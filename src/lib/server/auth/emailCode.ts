import type { D1Database } from '@cloudflare/workers-types';
import { randomCode, randomToken, sha256Hex, timingSafeEqual, uuid } from './crypto';
import { now } from '../db';

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

export type CodePurpose = 'login' | 'recovery';

/** What a freshly issued challenge hands back: a 6-digit code (manual / cross-device entry)
 * and a high-entropy link token (the one-tap magic link). Both resolve to the same row. */
export interface IssuedChallenge {
	code: string;
	linkToken: string;
}

/** Hash a code salted with its row id, so identical codes for different rows differ. */
function hashCode(code: string, id: string): Promise<string> {
	return sha256Hex(`${code}:${id}`);
}

/** The link token is 256-bit random, so its bare SHA-256 is already globally unique — no salt
 * needed (unlike the low-entropy code) and it can be looked up by hash directly. */
function hashLinkToken(token: string): Promise<string> {
	return sha256Hex(token);
}

/**
 * Issue a fresh challenge for a user: a 6-digit code AND a magic-link token, both stored only
 * as hashes. Any prior un-consumed challenge of the same purpose is dropped first, so only the
 * latest is valid (re-requesting invalidates the old). Returns the plaintext code + link token
 * for the caller to email — neither is ever stored in the clear.
 */
export async function issueCode(
	db: D1Database,
	userId: string,
	purpose: CodePurpose
): Promise<IssuedChallenge> {
	await db
		.prepare('DELETE FROM email_tokens WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL')
		.bind(userId, purpose)
		.run();
	const code = randomCode(6);
	const linkToken = randomToken();
	const id = uuid();
	const ts = now();
	await db
		.prepare(
			`INSERT INTO email_tokens (id, user_id, code_hash, link_token_hash, purpose, created_at, expires_at, attempts)
			 VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
		)
		.bind(id, userId, await hashCode(code, id), await hashLinkToken(linkToken), purpose, ts, ts + CODE_TTL_MS)
		.run();
	return { code, linkToken };
}

/**
 * Peek at a magic-link token WITHOUT consuming it — for the link's landing page (a GET).
 * Email security scanners and some clients pre-fetch links; if a GET consumed the token the
 * real click would always find it spent. So GET only reports whether the link is still live
 * (and whose account it signs into, to render "Sign in as you@…"); the POST confirm consumes it.
 * Returns null for unknown / expired / already-consumed tokens.
 */
export async function peekLinkToken(
	db: D1Database,
	rawToken: string
): Promise<{ userId: string; email: string; purpose: CodePurpose } | null> {
	if (!rawToken) return null;
	const row = await db
		.prepare(
			`SELECT t.user_id AS userId, t.expires_at AS expiresAt, t.consumed_at AS consumedAt,
			        t.purpose AS purpose, u.email AS email
			 FROM email_tokens t JOIN users u ON u.id = t.user_id
			 WHERE t.link_token_hash = ?`
		)
		.bind(await hashLinkToken(rawToken))
		.first<{ userId: string; expiresAt: number; consumedAt: number | null; purpose: CodePurpose; email: string }>();
	if (!row || row.consumedAt !== null || row.expiresAt <= now()) return null;
	return { userId: row.userId, email: row.email, purpose: row.purpose };
}

/**
 * Consume a magic-link token (the POST confirm). Marks the row consumed with a guarded UPDATE
 * so two concurrent confirms can't both succeed — only the writer that flips consumed_at wins.
 * Returns the user id on success, or null for unknown / expired / already-consumed tokens.
 */
export async function consumeLinkToken(
	db: D1Database,
	rawToken: string
): Promise<{ userId: string } | null> {
	if (!rawToken) return null;
	const tokenHash = await hashLinkToken(rawToken);
	const row = await db
		.prepare(
			`SELECT id, user_id AS userId, expires_at AS expiresAt, consumed_at AS consumedAt
			 FROM email_tokens WHERE link_token_hash = ?`
		)
		.bind(tokenHash)
		.first<{ id: string; userId: string; expiresAt: number; consumedAt: number | null }>();
	if (!row || row.consumedAt !== null || row.expiresAt <= now()) return null;
	const res = await db
		.prepare('UPDATE email_tokens SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL')
		.bind(now(), row.id)
		.run();
	if (res.meta.changes !== 1) return null; // lost the race to a concurrent confirm
	return { userId: row.userId };
}

/**
 * Verify a submitted code against the user's latest un-consumed code of this purpose.
 * Single-use (consumed on success), expiring, and rate-limited: each wrong guess increments
 * `attempts`, and past MAX_ATTEMPTS the code is dead even if later guessed correctly.
 * Comparison is constant-time on the hashes.
 */
export async function verifyCode(
	db: D1Database,
	userId: string,
	code: string,
	purpose: CodePurpose
): Promise<boolean> {
	const row = await db
		.prepare(
			`SELECT id, code_hash AS codeHash, expires_at AS expiresAt, attempts
			 FROM email_tokens
			 WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL
			 ORDER BY created_at DESC LIMIT 1`
		)
		.bind(userId, purpose)
		.first<{ id: string; codeHash: string; expiresAt: number; attempts: number }>();
	if (!row) return false;
	if (row.expiresAt <= now() || row.attempts >= MAX_ATTEMPTS) return false;

	const candidate = await hashCode(code, row.id);
	if (!timingSafeEqual(candidate, row.codeHash)) {
		await db.prepare('UPDATE email_tokens SET attempts = attempts + 1 WHERE id = ?').bind(row.id).run();
		return false;
	}
	await db.prepare('UPDATE email_tokens SET consumed_at = ? WHERE id = ?').bind(now(), row.id).run();
	return true;
}
