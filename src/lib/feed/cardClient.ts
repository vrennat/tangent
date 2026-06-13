import type { Article } from '$lib/wikipedia/types';

/**
 * Fetch a fully-resolved article card by title. Returns null on failure or if the
 * page is gone. Used by the reader's link-follow path to feed the engagement profile
 * (the interest vector needs the article's server-computed `tokens`) without gating
 * navigation — the push happens immediately; this runs alongside it.
 */
export async function fetchCard(title: string): Promise<Article | null> {
	try {
		const res = await fetch(`/api/card?title=${encodeURIComponent(title)}`);
		if (!res.ok) return null;
		const data = (await res.json()) as { article: Article | null };
		return data.article ?? null;
	} catch {
		return null;
	}
}
