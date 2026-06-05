import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchCandidates, fetchRelated } from '$lib/wikipedia/action';
import { cached, TTL } from '$lib/server/cache';

/**
 * GET /api/links?from=Title          -> hybrid candidates (outbound links + fallback)
 * GET /api/links?from=Title&mode=related -> related-only ("More like this")
 */
export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const from = url.searchParams.get('from')?.trim();
	if (!from) return json({ candidates: [], error: 'missing from' }, { status: 400 });

	const related = url.searchParams.get('mode') === 'related';
	const key = `links:${related ? 'related' : 'hybrid'}:${from}`;

	try {
		const candidates = await cached(key, TTL.long, () =>
			related ? fetchRelated(from) : fetchCandidates(from)
		);
		setHeaders({ 'cache-control': 'public, max-age=3600' });
		return json({ candidates });
	} catch {
		return json({ candidates: [], error: 'upstream error' }, { status: 502 });
	}
};
