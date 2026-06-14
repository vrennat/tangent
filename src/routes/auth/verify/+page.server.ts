import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { peekLinkToken, consumeLinkToken } from '$lib/server/auth/emailCode';
import { markEmailVerified } from '$lib/server/auth/users';
import { createSession, SESSION_COOKIE, SESSION_COOKIE_OPTS } from '$lib/server/auth/session';
import { recordEvent } from '$lib/server/metrics';

/**
 * Magic-link landing. The GET only PEEKS the token (never consumes it) so email scanners /
 * link prefetchers can't burn the link before the human clicks. The confirm button POSTs back
 * here; that action consumes the token, verifies the email, and mints the session cookie.
 */
export const load: PageServerLoad = async ({ url, platform }) => {
	const token = url.searchParams.get('token') ?? '';
	if (!token) return { state: 'invalid' as const };
	const db = getDb(platform);
	const peek = await peekLinkToken(db, token);
	if (!peek) return { state: 'invalid' as const };
	return { state: 'ready' as const, email: peek.email };
};

export const actions: Actions = {
	default: async ({ request, platform, cookies }) => {
		const data = await request.formData();
		const token = String(data.get('token') ?? '');
		const db = getDb(platform);

		const consumed = await consumeLinkToken(db, token);
		if (!consumed) return fail(400, { state: 'invalid' as const });

		await markEmailVerified(db, consumed.userId);
		const { token: sessionToken } = await createSession(db, consumed.userId, 'web');
		recordEvent(platform, 'sign_in', ['magic_link']);
		cookies.set(SESSION_COOKIE, sessionToken, SESSION_COOKIE_OPTS);

		// ?signin=1 tells the layout this was a fresh login -> run the union profile merge
		// (the magic-link path is a full nav, so the SPA verify-code merge never fired).
		redirect(303, '/?signin=1');
	}
};
