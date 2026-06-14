import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { getDb } from '$lib/server/db';
import { rpConfig } from '$lib/server/auth/webauthnConfig';
import { getCredentialDescriptors, storeChallenge } from '$lib/server/auth/passkey';

/**
 * POST /api/auth/passkey/register/options — begin adding a passkey to the signed-in account.
 * Returns the creation options + an opaque challengeId the client sends back on verify.
 */
export const POST: RequestHandler = async ({ platform, locals, url }) => {
	if (!locals.user) return json({ error: 'unauthorized' }, { status: 401 });
	const db = getDb(platform);
	const { rpName, rpID } = rpConfig(url);

	const options = await generateRegistrationOptions({
		rpName,
		rpID,
		userName: locals.user.email,
		userID: new TextEncoder().encode(locals.user.id),
		userDisplayName: locals.user.email,
		attestationType: 'none',
		excludeCredentials: await getCredentialDescriptors(db, locals.user.id),
		authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' }
	});

	const challengeId = await storeChallenge(db, {
		userId: locals.user.id,
		challenge: options.challenge,
		purpose: 'register'
	});
	return json({ options, challengeId });
};
