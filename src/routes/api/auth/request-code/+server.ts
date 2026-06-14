import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { findOrCreateUserByEmail, isValidEmail } from '$lib/server/auth/users';
import { issueCode, type CodePurpose } from '$lib/server/auth/emailCode';
import { sendCode } from '$lib/server/auth/email';

/**
 * POST /api/auth/request-code — body { email, purpose? }.
 *
 * Find-or-create the account, mint a fresh 6-digit code, and email it. Always responds
 * with a generic `{ ok: true }` (plus `devCode` in dev) so the endpoint can't be used to
 * probe which emails have accounts. The account is created lazily here; it only becomes
 * verified once the code is consumed.
 */
export const POST: RequestHandler = async ({ request, platform, url }) => {
	const db = getDb(platform);
	let email: string;
	let purpose: CodePurpose;
	try {
		const b = (await request.json()) as { email?: string; purpose?: string };
		email = (b.email ?? '').trim();
		purpose = b.purpose === 'recovery' ? 'recovery' : 'login';
	} catch {
		return json({ error: 'invalid body' }, { status: 400 });
	}
	if (!isValidEmail(email)) return json({ error: 'invalid email' }, { status: 400 });

	const user = await findOrCreateUserByEmail(db, email);
	const { code, linkToken } = await issueCode(db, user.id, purpose);
	// Build the magic link off the request origin so it self-targets: localhost in dev,
	// tangent.page in prod. The token is the secret; nothing else identifies the row.
	const link = `${url.origin}/auth/verify?token=${linkToken}`;
	const { devCode, devLink } = await sendCode(platform, user.email, { code, link }, purpose);

	// devCode/devLink are only ever populated in dev (no email binding) — they let local + tests
	// complete the flow without an inbox; production returns the bare { ok }.
	return json({ ok: true, ...(devCode ? { devCode } : {}), ...(devLink ? { devLink } : {}) });
};
