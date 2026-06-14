import type { Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, validateSessionToken } from '$lib/server/auth/session';

/**
 * Resolve the session on every request and hang the account off `event.locals.user`.
 * Web clients carry the session in an HttpOnly cookie; the native iOS app sends it as a
 * Bearer token (no cookie jar). Either way the token is validated against D1.
 *
 * Routes that need auth read `locals.user`; we never throw here — an unauthenticated
 * request just gets `user: null` and proceeds (the feed works signed-out).
 */
export const handle: Handle = async ({ event, resolve }) => {
	const db = event.platform?.env?.DB;
	event.locals.user = null;

	if (db) {
		const bearer = event.request.headers.get('authorization');
		const token = bearer?.startsWith('Bearer ')
			? bearer.slice(7)
			: event.cookies.get(SESSION_COOKIE);
		if (token) {
			event.locals.user = await validateSessionToken(db, token);
		}
	}

	return resolve(event);
};
