import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchExploreCandidates, fetchRelated } from '$lib/wikipedia/action';
import { cacheDelete, cached, TTL } from '$lib/server/cache';

/**
 * GET /api/links?from=Title          -> in-order lead-section links (explore feed)
 * GET /api/links?from=Title&mode=related -> related-only ("More like this")
 */
export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const from = url.searchParams.get('from')?.trim();
	if (!from) return json({ candidates: [], error: 'missing from' }, { status: 400 });

	const related = url.searchParams.get('mode') === 'related';
	const key = `links:${related ? 'related' : 'explore'}:${from}`;

	try {
		const candidates = await cached(key, TTL.long, () =>
			related ? fetchRelated(from) : fetchExploreCandidates(from)
		);
		// An empty pool for a live article is far more often an upstream soft-failure
		// (Wikimedia throttle pages come back 200-shaped and parse to zero candidates)
		// than a genuinely link-less page. Memoizing it for a day — and letting
		// browsers cache it for an hour — turns a transient blip into "this tangent
		// has run dry" for everyone (seen 2026-07-19). Drop the entry so the next
		// request retries, and keep the response uncacheable.
		if (candidates.length === 0) {
			cacheDelete(key);
			setHeaders({ 'cache-control': 'no-store' });
			return json({ candidates });
		}
		setHeaders({ 'cache-control': 'public, max-age=3600' });
		return json({ candidates });
	} catch {
		return json({ candidates: [], error: 'upstream error' }, { status: 502 });
	}
};
