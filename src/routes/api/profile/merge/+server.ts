import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { mergeProfile } from '$lib/server/profileStore';
import { hydratePersisted, type Persisted } from '$lib/engagement/persisted';

/**
 * POST /api/profile/merge — first-login reconciliation. Body: { data: Persisted }.
 *
 * Unions the device-local profile with whatever is stored (neither clobbers the other) and
 * returns the merged result for the client to adopt as its new local state.
 */
export const POST: RequestHandler = async ({ platform, locals, request }) => {
	if (!locals.user) return json({ error: 'unauthorized' }, { status: 401 });
	const db = getDb(platform);
	let data: Persisted;
	try {
		const b = (await request.json()) as { data?: Partial<Persisted> };
		data = hydratePersisted(b.data);
	} catch {
		return json({ error: 'invalid body' }, { status: 400 });
	}
	const stored = await mergeProfile(db, locals.user.id, data);
	return json({ profile: stored });
};
