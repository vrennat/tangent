import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { revokeSession, SESSION_COOKIE, SESSION_COOKIE_OPTS } from '$lib/server/auth/session';

/**
 * POST /api/auth/logout — revoke the current session and clear the cookie.
 * Idempotent: missing/expired sessions still return ok.
 */
export const POST: RequestHandler = async ({ platform, cookies, request }) => {
	const db = getDb(platform);
	const bearer = request.headers.get('authorization');
	const token = bearer?.startsWith('Bearer ') ? bearer.slice(7) : cookies.get(SESSION_COOKIE);
	if (token) await revokeSession(db, token);
	cookies.delete(SESSION_COOKIE, SESSION_COOKIE_OPTS);
	return json({ ok: true });
};
