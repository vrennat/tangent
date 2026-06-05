import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { search } from '$lib/wikipedia/action';
import { cached, TTL } from '$lib/server/cache';

/** GET /api/search?q=quantum -> { results } for the /start typeahead. */
export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	if (q.length < 2) return json({ results: [] });

	try {
		const results = await cached(`search:${q.toLowerCase()}`, TTL.short, () => search(q));
		setHeaders({ 'cache-control': 'public, max-age=300' });
		return json({ results });
	} catch {
		return json({ results: [], error: 'upstream error' }, { status: 502 });
	}
};
