import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { getUserByEmail, isValidEmail, markEmailVerified } from '$lib/server/auth/users';
import { verifyCode } from '$lib/server/auth/emailCode';
import { createSession, SESSION_COOKIE, SESSION_COOKIE_OPTS } from '$lib/server/auth/session';
import { recordEvent } from '$lib/server/metrics';

/**
 * POST /api/auth/verify-code — body { email, code, client? }.
 *
 * Verify the code; on success mark the email verified and mint a session. Web clients get
 * an HttpOnly cookie; the native app passes `client: 'ios'` and gets the raw token back to
 * store in the keychain (it has no cookie jar). Returns the account either way.
 */
export const POST: RequestHandler = async ({ request, platform, cookies }) => {
	const db = getDb(platform);
	let email: string;
	let code: string;
	let client: 'web' | 'ios';
	try {
		const b = (await request.json()) as { email?: string; code?: string; client?: string };
		email = (b.email ?? '').trim();
		code = (b.code ?? '').trim();
		client = b.client === 'ios' ? 'ios' : 'web';
	} catch {
		return json({ error: 'invalid body' }, { status: 400 });
	}
	if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
		return json({ error: 'invalid request' }, { status: 400 });
	}

	const user = await getUserByEmail(db, email);
	// Generic 401 whether the account is missing or the code is wrong — no enumeration.
	if (!user) return json({ error: 'invalid or expired code' }, { status: 401 });
	const ok = await verifyCode(db, user.id, code, 'login');
	if (!ok) return json({ error: 'invalid or expired code' }, { status: 401 });

	await markEmailVerified(db, user.id);
	const { token, expiresAt } = await createSession(db, user.id, client);
	const account = { id: user.id, email: user.email, emailVerified: true };
	recordEvent(platform, 'sign_in', ['code']);

	if (client === 'ios') {
		return json({ ok: true, user: account, token, expiresAt });
	}
	cookies.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTS);
	return json({ ok: true, user: account });
};
