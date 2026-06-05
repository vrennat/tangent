/**
 * Tiny in-memory TTL cache. Wikipedia content barely changes, so we cache hard.
 *
 * This lives per server instance (one isolate on Cloudflare Workers), which is
 * plenty for Phase 1 — repeated views of the same rabbit-hole node hit the cache.
 * A later pass can swap this for the Workers Cache API without touching callers.
 */

interface Entry<T> {
	value: T;
	expires: number;
}

const store = new Map<string, Entry<unknown>>();
const MAX_ENTRIES = 2000;

/** Run `fn` and memoize its result under `key` for `ttlMs`. Dedupes nothing fancy. */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
	const now = Date.now();
	const hit = store.get(key) as Entry<T> | undefined;
	if (hit && hit.expires > now) return hit.value;

	const value = await fn();
	store.set(key, { value, expires: now + ttlMs });

	// Crude bound: when we blow the cap, drop the oldest-inserted entries.
	if (store.size > MAX_ENTRIES) {
		const overflow = store.size - MAX_ENTRIES;
		let i = 0;
		for (const k of store.keys()) {
			if (i++ >= overflow) break;
			store.delete(k);
		}
	}

	return value;
}

export const TTL = {
	/** Article summaries / links — stable, cache for a day. */
	long: 24 * 60 * 60 * 1000,
	/** Search results — shorter so typeahead stays fresh-ish. */
	short: 10 * 60 * 1000
} as const;
