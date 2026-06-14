import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { getDb } from '$lib/server/db';
import { rpConfig } from '$lib/server/auth/webauthnConfig';
import { consumeChallenge, getCredentialById, touchCredential } from '$lib/server/auth/passkey';
import { getUserById } from '$lib/server/auth/users';
import { createSession, SESSION_COOKIE, SESSION_COOKIE_OPTS } from '$lib/server/auth/session';

/**
 * POST /api/auth/passkey/login/verify — finish a passkey sign-in. Body:
 * { challengeId, response, client? }. Looks up the credential the authenticator returned,
 * verifies the assertion, bumps the signature counter, and mints a session (cookie / bearer).
 */
export const POST: RequestHandler = async ({ platform, url, request, cookies }) => {
	const db = getDb(platform);
	const { rpID, origin } = rpConfig(url);

	let body: { challengeId?: string; response?: AuthenticationResponseJSON; client?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid body' }, { status: 400 });
	}
	if (!body.challengeId || !body.response) return json({ error: 'invalid body' }, { status: 400 });

	const expectedChallenge = await consumeChallenge(db, body.challengeId, 'authenticate');
	if (!expectedChallenge) return json({ error: 'challenge expired' }, { status: 400 });

	const cred = await getCredentialById(db, body.response.id);
	if (!cred) return json({ error: 'unknown credential' }, { status: 401 });

	let verification;
	try {
		verification = await verifyAuthenticationResponse({
			response: body.response,
			expectedChallenge,
			expectedOrigin: origin,
			expectedRPID: rpID,
			credential: {
				id: cred.id,
				publicKey: cred.publicKey,
				counter: cred.counter,
				transports: cred.transports
			},
			requireUserVerification: false
		});
	} catch {
		return json({ error: 'verification failed' }, { status: 401 });
	}
	if (!verification.verified) return json({ verified: false }, { status: 401 });

	await touchCredential(db, cred.id, verification.authenticationInfo.newCounter);
	const user = await getUserById(db, cred.userId);
	if (!user) return json({ error: 'account missing' }, { status: 401 });

	const client = body.client === 'ios' ? 'ios' : 'web';
	const { token, expiresAt } = await createSession(db, user.id, client);
	if (client === 'ios') return json({ ok: true, user, token, expiresAt });
	cookies.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTS);
	return json({ ok: true, user });
};
