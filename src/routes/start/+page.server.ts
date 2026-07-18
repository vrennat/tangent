import type { PageServerLoad } from './$types';
import { SEEDS, type Seed } from '$lib/seeds';
import { todayFeed } from '$lib/server/today';

/** How many "Or dive into" chips each visit shows, drawn fresh from the seed list. */
const CHIP_COUNT = 12;

function sample(seeds: readonly Seed[], count: number): Seed[] {
	const pool = [...seeds];
	for (let i = pool.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[pool[i], pool[j]] = [pool[j], pool[i]];
	}
	return pool.slice(0, count);
}

export const load: PageServerLoad = () => {
	return {
		// Intentionally not awaited — SvelteKit streams it so the shell paints immediately
		// and the shelves fill in as Wikipedia responds (server-cached per UTC day).
		today: todayFeed(),
		seeds: sample(SEEDS, CHIP_COUNT)
	};
};
