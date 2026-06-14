import type { D1Database } from '@cloudflare/workers-types';
import { uuid } from './crypto';
import { now } from '../db';
import type { SessionUser } from './session';

/** Normalize an email for storage + comparison: trim + lowercase. */
export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

/** Cheap structural check — full validity is proven by the user receiving the code. */
export function isValidEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

/**
 * Look up an account by email, creating it on first sight. New accounts start
 * `email_verified = 0`; consuming a login code flips it. The `ON CONFLICT DO NOTHING`
 * + re-select makes concurrent first-logins race-safe (the UNIQUE email index arbitrates).
 */
export async function findOrCreateUserByEmail(db: D1Database, rawEmail: string): Promise<SessionUser> {
	const email = normalizeEmail(rawEmail);
	const id = uuid();
	const ts = now();
	await db
		.prepare(
			`INSERT INTO users (id, email, email_verified, created_at, updated_at)
			 VALUES (?, ?, 0, ?, ?) ON CONFLICT(email) DO NOTHING`
		)
		.bind(id, email, ts, ts)
		.run();
	const row = await db
		.prepare('SELECT id, email, email_verified AS emailVerified FROM users WHERE email = ?')
		.bind(email)
		.first<{ id: string; email: string; emailVerified: number }>();
	if (!row) throw new Error('failed to upsert user');
	return { id: row.id, email: row.email, emailVerified: row.emailVerified === 1 };
}

/** Mark an account's email as verified (idempotent). */
export async function markEmailVerified(db: D1Database, userId: string): Promise<void> {
	await db
		.prepare('UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?')
		.bind(now(), userId)
		.run();
}

export async function getUserById(db: D1Database, userId: string): Promise<SessionUser | null> {
	const row = await db
		.prepare('SELECT id, email, email_verified AS emailVerified FROM users WHERE id = ?')
		.bind(userId)
		.first<{ id: string; email: string; emailVerified: number }>();
	return row ? { id: row.id, email: row.email, emailVerified: row.emailVerified === 1 } : null;
}

/**
 * Permanently delete an account and everything hanging off it: passkeys, sessions, email
 * codes, pending WebAuthn challenges, and the synced profile. Children are deleted before
 * the user row so this is correct whether or not the runtime enforces FK cascades, and the
 * whole thing runs as one D1 batch (a single transaction) so a deletion is all-or-nothing.
 */
export async function deleteUser(db: D1Database, userId: string): Promise<void> {
	await db.batch([
		db.prepare('DELETE FROM credentials WHERE user_id = ?').bind(userId),
		db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
		db.prepare('DELETE FROM email_tokens WHERE user_id = ?').bind(userId),
		db.prepare('DELETE FROM webauthn_challenges WHERE user_id = ?').bind(userId),
		db.prepare('DELETE FROM profiles WHERE user_id = ?').bind(userId),
		db.prepare('DELETE FROM users WHERE id = ?').bind(userId)
	]);
}

/** Look up by email without creating. Used at code-verify time so a typo'd or never-requested
 * email can't mint orphan accounts (only request-code creates). */
export async function getUserByEmail(db: D1Database, rawEmail: string): Promise<SessionUser | null> {
	const row = await db
		.prepare('SELECT id, email, email_verified AS emailVerified FROM users WHERE email = ?')
		.bind(normalizeEmail(rawEmail))
		.first<{ id: string; email: string; emailVerified: number }>();
	return row ? { id: row.id, email: row.email, emailVerified: row.emailVerified === 1 } : null;
}
