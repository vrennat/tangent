import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveCard } from '$lib/server/resolveCard';
import { recordEvent } from '$lib/server/metrics';

/** GET /api/card?title=Roman%20Empire -> { article } (or null if it doesn't exist). */
export const GET: RequestHandler = async ({ url, setHeaders, platform }) => {
	const title = url.searchParams.get('title')?.trim();
	if (!title) return json({ article: null, error: 'missing title' }, { status: 400 });

	try {
		const { article, degraded } = await resolveCard(title);
		// A degraded (imageless) card is only briefly cacheable: the Cloudflare edge
		// caches these, and a long-lived degraded copy would pin an imageless card on
		// every client until it expires.
		setHeaders({ 'cache-control': degraded ? 'public, max-age=60' : 'public, max-age=3600' });
		recordEvent(platform, 'feed_served', [title]);
		return json({ article });
	} catch {
		return json({ article: null, error: 'upstream error' }, { status: 502 });
	}
};
