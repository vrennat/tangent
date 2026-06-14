import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { getDb } from '$lib/server/db';
import { rpConfig } from '$lib/server/auth/webauthnConfig';
import { consumeChallenge, storeCredential } from '$lib/server/auth/passkey';

/**
 * POST /api/auth/passkey/register/verify — finish adding a passkey. Body:
 * { challengeId, response, label? }. Verifies the attestation against the stored challenge
 * and persists the credential for the signed-in user.
 */
export const POST: RequestHandler = async ({ platform, locals, url, request }) => {
	if (!locals.user) return json({ error: 'unauthorized' }, { status: 401 });
	const db = getDb(platform);
	const { rpID, origin } = rpConfig(url);

	let body: { challengeId?: string; response?: RegistrationResponseJSON; label?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid body' }, { status: 400 });
	}
	if (!body.challengeId || !body.response) return json({ error: 'invalid body' }, { status: 400 });

	const expectedChallenge = await consumeChallenge(db, body.challengeId, 'register');
	if (!expectedChallenge) return json({ error: 'challenge expired' }, { status: 400 });

	let verification;
	try {
		verification = await verifyRegistrationResponse({
			response: body.response,
			expectedChallenge,
			expectedOrigin: origin,
			expectedRPID: rpID,
			requireUserVerification: false
		});
	} catch {
		return json({ error: 'verification failed' }, { status: 400 });
	}
	if (!verification.verified || !verification.registrationInfo) {
		return json({ verified: false }, { status: 400 });
	}

	const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
	await storeCredential(db, {
		userId: locals.user.id,
		credential,
		deviceType: credentialDeviceType,
		backedUp: credentialBackedUp,
		label: body.label
	});
	return json({ verified: true });
};
