import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchArticle } from '$lib/wikipedia/rest';
import { cached, TTL } from '$lib/server/cache';

/** GET /api/card?title=Roman%20Empire -> { article } (or null if it doesn't exist). */
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
