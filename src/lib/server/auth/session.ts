import type { D1Database } from '@cloudflare/workers-types';
import { randomToken, sha256Hex } from './crypto';
import { now } from '../db';

/** The authenticated account, as surfaced on `event.locals.user`. */
export interface SessionUser {
	id: string;
	email: string;
	emailVerified: boolean;
}

export const SESSION_COOKIE = 'tangent_session';
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/** Cookie attributes shared by set + clear so they always match (clear needs the same path). */
export const SESSION_COOKIE_OPTS = {
	path: '/',
	httpOnly: true,
	secure: true,
	sameSite: 'lax' as const,
	maxAge: SESSION_TTL_MS / 1000
};

type Client = 'web' | 'ios';

/**
 * Mint a session: store only the SHA-256 of the raw token so a DB leak can't be replayed.
 * Returns the raw token for the caller to put in a cookie (web) or hand back as a bearer
 * (iOS), plus the absolute expiry.
 */
export async function createSession(
	db: D1Database,
	userId: string,
	client: Client = 'web'
): Promise<{ token: string; expiresAt: number }> {
	const token = randomToken();
	const tokenHash = await sha256Hex(token);
	const ts = now();
	const expiresAt = ts + SESSION_TTL_MS;
	await db
		.prepare(
			`INSERT INTO sessions (token_hash, user_id, client, created_at, expires_at, last_used_at)
			 VALUES (?, ?, ?, ?, ?, ?)`
		)
		.bind(tokenHash, userId, client, ts, expiresAt, ts)
		.run();
	return { token, expiresAt };
}

/**
 * Resolve a raw token to its account, or null if missing/expired. Expired rows are deleted
 * lazily on lookup. Touches `last_used_at` so we can show "last active" and prune later.
 */
export async function validateSessionToken(
	db: D1Database,
	token: string | undefined | null
): Promise<SessionUser | null> {
	if (!token) return null;
	const tokenHash = await sha256Hex(token);
	const row = await db
		.prepare(
			`SELECT s.expires_at AS expiresAt, u.id AS id, u.email AS email, u.email_verified AS emailVerified
			 FROM sessions s JOIN users u ON u.id = s.user_id
			 WHERE s.token_hash = ?`
		)
		.bind(tokenHash)
		.first<{ expiresAt: number; id: string; email: string; emailVerified: number }>();
	if (!row) return null;
	if (row.expiresAt <= now()) {
		await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
		return null;
	}
	await db
		.prepare('UPDATE sessions SET last_used_at = ? WHERE token_hash = ?')
		.bind(now(), tokenHash)
		.run();
	return { id: row.id, email: row.email, emailVerified: row.emailVerified === 1 };
}

/** Revoke a single session by its raw token (sign-out on this device). */
export async function revokeSession(db: D1Database, token: string): Promise<void> {
	const tokenHash = await sha256Hex(token);
	await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
}

/** Revoke every session for a user (sign-out everywhere). */
export async function revokeAllSessions(db: D1Database, userId: string): Promise<void> {
	await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
}
