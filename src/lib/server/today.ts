/**
 * Today's Main Page picks, cached per UTC day: the Main Page rolls over once a day, so a
 * new date is a new cache key and the previous day's entry expires. An empty result (the
 * day's feed not yet published) is evicted immediately so a transient miss self-heals on
 * the next request instead of being memoized for the full day.
 *
 * Never rejects — the start page streams this promise, and an empty feed simply hides
 * the section.
 */
import { cached, cacheDelete, TTL } from '$lib/server/cache';
import { fetchToday, type TodayFeed } from '$lib/wikipedia/featured';

export async function todayFeed(): Promise<TodayFeed> {
	const now = new Date();
	const key = `today:${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;

	try {
		const feed = await cached(key, TTL.long, () => fetchToday(now));
		if (feed.sections.length === 0) cacheDelete(key);
		return feed;
	} catch {
		return { date: '', sections: [] };
	}
}
