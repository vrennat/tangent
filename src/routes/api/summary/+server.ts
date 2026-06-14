import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchArticle } from '$lib/wikipedia/rest';
import { cached, TTL } from '$lib/server/cache';

/**
 * GET /api/summary?title=Octopus -> { article } — a fast, text-first summary for the
 * desktop link-hover peek. Shares the `card:${title}` cache key with `/api/card` (and
 * thus the feed/dive path), so hovering a link pre-pays its later dive. Unlike
 * `/api/card` it skips `resolveCard`'s lead-image fallback: a hover peek lives or dies
 * on latency, and that fallback blocks on a full-article HTML fetch for imageless
 * pages. The dive still augments the image on its own path.
 */
export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const title = url.searchParams.get('title')?.trim();
	if (!title) return json({ article: null, error: 'missing title' }, { status: 400 });

	try {
		const article = await cached(`card:${title}`, TTL.long, () => fetchArticle(title));
		setHeaders({ 'cache-control': 'public, max-age=3600' });
		return json({ article });
	} catch {
		return json({ article: null, error: 'upstream error' }, { status: 502 });
	}
};
