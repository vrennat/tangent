import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { listCredentials } from '$lib/server/auth/passkey';

/** GET /api/auth/me — the current account + its passkeys, or `{ user: null, passkeys: [] }`. */
export const GET: RequestHandler = async ({ locals, platform }) => {
	if (!locals.user) return json({ user: null, passkeys: [] });
	const passkeys = await listCredentials(getDb(platform), locals.user.id);
	return json({ user: locals.user, passkeys });
};
