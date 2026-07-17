/**
 * Backfill complete non-hidden categories for every candidate in cache.json.
 *
 * The cache was built while the metadata batch silently truncated categories
 * (see action.ts fetchCategoriesFor for the clshow/continuation trap), so 36.5%
 * of cached candidates carry empty category lists, biased against later
 * positions. Rebuilding the cache cold would take hours of parse+metadata
 * traffic; categories keyed by title are the only stale part, so this fetches
 * exactly those.
 *
 * Resumable: progress persists to categories-cache.json; re-run to continue.
 * Run: TANGENT_UA="Tangent-sim/0.1 (tannervass@gmail.com)" bun run enrich-categories.ts
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fetchCategoriesFor } from '../../src/lib/wikipedia/action.ts';
import type { Candidate } from '../../src/lib/wikipedia/types.ts';

const CACHE_PATH = `${import.meta.dir}/cache.json`;
const CATS_PATH = `${import.meta.dir}/categories-cache.json`;
/** Titles per fetchCategoriesFor call — 3 parallel chunk requests inside. */
const GROUP = 30;
const PAUSE_MS = 250;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const cache: Record<string, Candidate[]> = JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
const cats: Record<string, string[]> = existsSync(CATS_PATH)
	? JSON.parse(readFileSync(CATS_PATH, 'utf8'))
	: {};

const unique = new Set<string>();
for (const parent of Object.keys(cache)) for (const c of cache[parent]) unique.add(c.title);
const todo = [...unique].filter((t) => !(t in cats));
console.error(`${unique.size} unique titles, ${todo.length} to fetch (${unique.size - todo.length} already done)`);

let flushCounter = 0;
const flush = () => writeFileSync(CATS_PATH, JSON.stringify(cats));

for (let i = 0; i < todo.length; i += GROUP) {
	const group = todo.slice(i, i + GROUP);
	// Retry with backoff — Wikipedia 429s under burst load.
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			const got = await fetchCategoriesFor(group);
			// A title with genuinely zero visible categories is recorded as [] so it
			// is not refetched on resume.
			for (const t of group) cats[t] = got.get(t) ?? [];
			break;
		} catch {
			await sleep(1000 * 2 ** attempt);
		}
	}
	if (++flushCounter % 20 === 0) {
		flush();
		console.error(`  ...${Math.min(i + GROUP, todo.length)}/${todo.length}`);
	}
	await sleep(PAUSE_MS);
}
flush();

// Patch the candidate cache. Only titles the enrichment actually resolved are
// overwritten — a fetch that never succeeded keeps whatever the cache had.
let patched = 0;
let empties = 0;
for (const parent of Object.keys(cache)) {
	cache[parent] = cache[parent].map((c) => {
		if (!(c.title in cats)) return c;
		patched++;
		if (cats[c.title].length === 0) empties++;
		return { ...c, categories: cats[c.title] };
	});
}
writeFileSync(CACHE_PATH, JSON.stringify(cache));

const instances = Object.values(cache).reduce((a, l) => a + l.length, 0);
console.error(
	`Patched ${patched}/${instances} candidate instances; ${empties} now genuinely category-less (${((100 * empties) / Math.max(1, patched)).toFixed(1)}%).`
);
