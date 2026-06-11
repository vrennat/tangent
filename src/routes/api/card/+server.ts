import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchArticle } from '$lib/wikipedia/rest';
import { fetchArticleHtml } from '$lib/wikipedia/article';
import { extractLeadImage } from '$lib/wikipedia/leadImage';
import { cached, TTL } from '$lib/server/cache';

/** GET /api/card?title=Roman%20Empire -> { article } (or null if it doesn't exist). */
export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const title = url.searchParams.get('title')?.trim();
	if (!title) return json({ article: null, error: 'missing title' }, { status: 400 });

	try {
		const article = await cached(`card:${title}`, TTL.long, async () => {
			const a = await fetchArticle(title);
			if (!a || a.thumbnail) return a;

			// No PageImages lead image (common on broad concept pages) — fall back to
			// the first substantial image in the article body. Shares the reader's
			// cache key, so an imageless card prefetches the inline article for free.
			// Best-effort: an upstream failure here must not sink the card.
			try {
				const html = await cached(`article:${a.title}`, TTL.long, () => fetchArticleHtml(a.title));
				return { ...a, thumbnail: html ? extractLeadImage(html) : null };
			} catch {
				return a;
			}
		});
		setHeaders({ 'cache-control': 'public, max-age=3600' });
		return json({ article });
	} catch {
		return json({ article: null, error: 'upstream error' }, { status: 502 });
	}
};
