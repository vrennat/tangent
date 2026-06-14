import type { D1Database } from '@cloudflare/workers-types';
import { hydratePersisted, mergePersisted, type Persisted } from '$lib/engagement/persisted';
import { now } from './db';

export interface StoredProfile {
	data: Persisted;
	updatedAt: number;
	revision: number;
}

/** Read a user's synced profile, or null if they've never pushed one. */
export async function getProfile(db: D1Database, userId: string): Promise<StoredProfile | null> {
	const row = await db
		.prepare('SELECT data, updated_at AS updatedAt, revision FROM profiles WHERE user_id = ?')
		.bind(userId)
		.first<{ data: string; updatedAt: number; revision: number }>();
	if (!row) return null;
	let parsed: unknown = null;
	try {
		parsed = JSON.parse(row.data);
	} catch {
		parsed = null;
	}
	return {
		data: hydratePersisted(parsed as Partial<Persisted>),
		updatedAt: row.updatedAt,
		revision: row.revision
	};
}

/**
 * Overwrite the stored profile (steady-state last-write-wins) and bump the revision.
 * Callers that must not clobber independent history use `mergeProfile` instead.
 */
export async function putProfile(
	db: D1Database,
	userId: string,
	data: Persisted
): Promise<StoredProfile> {
	const ts = now();
	await db
		.prepare(
			`INSERT INTO profiles (user_id, data, updated_at, revision)
			 VALUES (?, ?, ?, 1)
			 ON CONFLICT(user_id) DO UPDATE SET
				data = excluded.data,
				updated_at = excluded.updated_at,
				revision = profiles.revision + 1`
		)
		.bind(userId, JSON.stringify(data), ts)
		.run();
	const stored = await getProfile(db, userId);
	if (!stored) throw new Error('profile vanished after write');
	return stored;
}

/**
 * Reconcile an incoming (device-local) profile with the stored one and persist the union.
 * This is the first-login path: it must not let either side clobber the other's history.
 * Returns the authoritative merged profile for the client to adopt.
 */
export async function mergeProfile(
	db: D1Database,
	userId: string,
	incoming: Persisted
): Promise<StoredProfile> {
	const existing = await getProfile(db, userId);
	const merged = existing ? mergePersisted(existing.data, incoming) : incoming;
	return putProfile(db, userId, merged);
}
