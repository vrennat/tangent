import type { Article } from '$lib/wikipedia/types';
import { fetchArticle } from '$lib/wikipedia/rest';
import { fetchArticleHtml } from '$lib/wikipedia/article';
import { extractLeadImage } from '$lib/wikipedia/leadImage';
import { cached, TTL } from './cache';

/**
 * Resolve a title into a fully-formed card: the article summary plus a best-effort
 * lead image when PageImages has none (common on broad concept pages).
 *
 * Shared by `/api/card` (the web reader's seed/dive fetch) and `/api/next` (the
 * server-side feed engine), so both surface identical cards. The `degraded` flag
 * lets each endpoint decide its own cache policy — a missing image should be
 * retried soon, not pinned for a day.
 *
 * Throws on upstream network failure (so callers can return a retryable error);
 * returns `{ article: null }` only when the page genuinely doesn't exist.
 */
export async function resolveCard(title: string): Promise<{ article: Article | null; degraded: boolean }> {
	let article = await cached(`card:${title}`, TTL.long, () => fetchArticle(title));

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
			// Best-effort: ship the card without an image rather than failing. Flagged
			// degraded so the caller caches the response only briefly and retries soon.
			degraded = true;
		}
	}

	return { article, degraded };
}
