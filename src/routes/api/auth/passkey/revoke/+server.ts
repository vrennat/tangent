import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { deleteCredential } from '$lib/server/auth/passkey';

/**
 * POST /api/auth/passkey/revoke — remove one of the signed-in user's passkeys. Body: { id }.
 * Scoped to the caller's account, so a stray credential id can't delete someone else's key.
 * Idempotent: an unknown/already-removed id still returns ok (with removed: false).
 */
export const POST: RequestHandler = async ({ platform, locals, request }) => {
	if (!locals.user) return json({ error: 'unauthorized' }, { status: 401 });

	let body: { id?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid body' }, { status: 400 });
	}
	if (!body.id) return json({ error: 'invalid body' }, { status: 400 });

	const removed = await deleteCredential(getDb(platform), body.id, locals.user.id);
	return json({ ok: true, removed });
};
