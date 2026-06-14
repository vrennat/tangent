import { error } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';

/**
 * The D1 binding for this request. In production it comes from the Worker; in `vite dev`
 * adapter-cloudflare's platform proxy supplies a local Miniflare D1 (the `.wrangler` state).
 *
 * Throws a 503 if the binding is absent rather than letting a route crash with a vague
 * "cannot read property of undefined" — accounts simply aren't available without D1.
 */
export function getDb(platform: App.Platform | undefined): D1Database {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Accounts are unavailable (no database binding).');
	return db;
}

/** Epoch milliseconds. Centralized so call sites read intent, not `Date.now()`. */
export function now(): number {
	return Date.now();
}
