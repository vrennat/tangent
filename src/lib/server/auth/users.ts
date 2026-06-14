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
