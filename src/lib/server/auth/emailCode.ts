import type { D1Database } from '@cloudflare/workers-types';
import { randomCode, sha256Hex, timingSafeEqual, uuid } from './crypto';
import { now } from '../db';

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

export type CodePurpose = 'login' | 'recovery';

/** Hash a code salted with its row id, so identical codes for different rows differ. */
function hashCode(code: string, id: string): Promise<string> {
	return sha256Hex(`${code}:${id}`);
}

/**
 * Issue a fresh 6-digit code for a user. Any prior un-consumed code of the same purpose is
 * dropped first, so only the latest code is ever valid (re-requesting invalidates the old).
 * Returns the plaintext code for the caller to email — it is never stored in the clear.
 */
export async function issueCode(
	db: D1Database,
	userId: string,
	purpose: CodePurpose
): Promise<string> {
	await db
		.prepare('DELETE FROM email_tokens WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL')
		.bind(userId, purpose)
		.run();
	const code = randomCode(6);
	const id = uuid();
	const ts = now();
	await db
		.prepare(
			`INSERT INTO email_tokens (id, user_id, code_hash, purpose, created_at, expires_at, attempts)
			 VALUES (?, ?, ?, ?, ?, ?, 0)`
		)
		.bind(id, userId, await hashCode(code, id), purpose, ts, ts + CODE_TTL_MS)
		.run();
	return code;
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
