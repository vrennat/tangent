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
		let article = await cached(`card:${title}`, TTL.long, () => fetchArticle(title));

		// No PageImages lead image (common on broad concept pages) — fall back to the
		// first substantial image in the article body. Cached under its own key, and
		// only on success: a transient upstream failure throws out of cached(), so the
		// next request retries instead of serving a degraded card for a day. Shares
		// the reader's article: key, so an imageless card prefetches the inline
		// article for free.
		let degraded = false;
		if (article && !article.thumbnail) {
			try {
				const thumbnail = await cached(`leadimg:${article.title}`, TTL.long, async () => {
					const html = await cached(`article:${article!.title}`, TTL.long, () =>
						fetchArticleHtml(article!.title)
					);
					return html ? extractLeadImage(html) : null;
				});
				if (thumbnail) article = { ...article, thumbnail };
			} catch {
				// Best-effort: the card ships without an image rather than failing. But
				// only briefly cacheable — the Cloudflare edge caches these responses
				// (cf-cache-status: HIT), and a long-lived degraded copy pins an
				// imageless card on every client until it expires.
				degraded = true;
			}
		}

		setHeaders({ 'cache-control': degraded ? 'public, max-age=60' : 'public, max-age=3600' });
		return json({ article });
	} catch {
		return json({ article: null, error: 'upstream error' }, { status: 502 });
	}
};
