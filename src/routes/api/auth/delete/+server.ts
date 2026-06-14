import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { deleteUser } from '$lib/server/auth/users';
import { SESSION_COOKIE, SESSION_COOKIE_OPTS } from '$lib/server/auth/session';

/**
 * POST /api/auth/delete — permanently delete the signed-in account and all of its data
 * (passkeys, sessions, email codes, synced profile). Deleting the sessions row revokes the
 * current token server-side; we also clear the cookie so the browser drops it immediately.
 * CSRF is covered the same way as the rest of /api/auth/*: a cross-origin form can't send
 * JSON, and a cross-origin fetch is blocked by the browser's same-origin policy.
 */
export const POST: RequestHandler = async ({ platform, locals, cookies }) => {
	if (!locals.user) return json({ error: 'unauthorized' }, { status: 401 });
	await deleteUser(getDb(platform), locals.user.id);
	cookies.delete(SESSION_COOKIE, SESSION_COOKIE_OPTS);
	return json({ ok: true });
};
