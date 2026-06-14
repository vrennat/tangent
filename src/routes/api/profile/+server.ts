import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { getProfile, putProfile } from '$lib/server/profileStore';
import { hydratePersisted, type Persisted } from '$lib/engagement/persisted';

/** GET /api/profile — the signed-in user's synced profile, or `{ profile: null }`. */
export const GET: RequestHandler = async ({ platform, locals }) => {
	if (!locals.user) return json({ error: 'unauthorized' }, { status: 401 });
	const db = getDb(platform);
	const stored = await getProfile(db, locals.user.id);
	return json({ profile: stored });
};

/**
 * PUT /api/profile — push the device's profile (steady-state last-write-wins).
 * Body: { data: Persisted }. Use POST /api/profile/merge instead at login time.
 */
export const PUT: RequestHandler = async ({ platform, locals, request }) => {
	if (!locals.user) return json({ error: 'unauthorized' }, { status: 401 });
	const db = getDb(platform);
	let data: Persisted;
	try {
		const b = (await request.json()) as { data?: Partial<Persisted> };
		data = hydratePersisted(b.data);
	} catch {
		return json({ error: 'invalid body' }, { status: 400 });
	}
	const stored = await putProfile(db, locals.user.id, data);
	return json({ profile: stored });
};
