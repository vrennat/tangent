import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { countCredentials } from '$lib/server/auth/passkey';

/** GET /api/auth/me — the current account + its passkey count, or `{ user: null }`. */
export const GET: RequestHandler = async ({ locals, platform }) => {
	if (!locals.user) return json({ user: null, passkeyCount: 0 });
	const passkeyCount = await countCredentials(getDb(platform), locals.user.id);
	return json({ user: locals.user, passkeyCount });
};
