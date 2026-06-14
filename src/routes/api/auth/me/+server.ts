import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** GET /api/auth/me — the current account, or `{ user: null }` when signed out. */
export const GET: RequestHandler = async ({ locals }) => {
	return json({ user: locals.user });
};
