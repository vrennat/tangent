import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { getDb } from '$lib/server/db';
import { rpConfig } from '$lib/server/auth/webauthnConfig';
import { storeChallenge } from '$lib/server/auth/passkey';

/**
 * POST /api/auth/passkey/login/options — begin a passwordless passkey sign-in. We pass no
 * allowCredentials so the browser offers any discoverable credential (passkey) for this RP;
 * the chosen credential identifies the account at verify time.
 */
export const POST: RequestHandler = async ({ platform, url }) => {
	const db = getDb(platform);
	const { rpID } = rpConfig(url);

	const options = await generateAuthenticationOptions({
		rpID,
		userVerification: 'preferred',
		allowCredentials: []
	});

	const challengeId = await storeChallenge(db, {
		userId: null,
		challenge: options.challenge,
		purpose: 'authenticate'
	});
	return json({ options, challengeId });
};
