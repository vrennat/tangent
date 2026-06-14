import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchToday } from '$lib/wikipedia/featured';
import { cached, cacheDelete, TTL } from '$lib/server/cache';

/**
 * GET /api/today -> Wikipedia's Main Page picks as Tangent seed sections.
 *
 * Cached per UTC day: the Main Page rolls over once a day, so a new date is a new cache
 * key and the previous day's entry expires. An empty result (the day's feed not yet
 * published) is evicted immediately so a transient miss self-heals on the next request
 * instead of being memoized for the full day.
 */
export const GET: RequestHandler = async ({ setHeaders }) => {
	const now = new Date();
	const key = `today:${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;

	try {
		const feed = await cached(key, TTL.long, () => fetchToday(now));
		if (feed.sections.length === 0) {
			cacheDelete(key);
			setHeaders({ 'cache-control': 'public, max-age=300' });
			return json(feed);
		}
		setHeaders({ 'cache-control': 'public, max-age=3600' });
		return json(feed);
	} catch {
		return json({ date: '', sections: [] }, { status: 502 });
	}
};
