import { describe, it, expect, vi, beforeEach } from 'vitest';

const { actionGet } = vi.hoisted(() => ({ actionGet: vi.fn() }));
vi.mock('../src/lib/wikipedia/client', () => ({ actionGet }));

import { fetchRelated } from '../src/lib/wikipedia/action';

function page(title: string, index: number, overrides: Record<string, unknown> = {}) {
	return { pageid: index, ns: 0, title, index, description: `about ${title}`, ...overrides };
}

describe('fetchRelated', () => {
	beforeEach(() => {
		actionGet.mockReset();
	});

	describe('generator ordering', () => {
		// The Action API returns generator results in arbitrary order; the `index`
		// field carries the generator's rank (for morelike:, similarity). Candidate
		// `position` must reflect that rank, not the arbitrary array order, because
		// the engine's position boost treats low positions as prominence.
		it('orders candidates and positions by generator index, not array order', async () => {
			actionGet.mockResolvedValue({
				query: {
					pages: [page('Cephalopod', 5), page('Grimpoteuthis', 1), page('Umbrella octopus', 3)]
				}
			});

			const out = await fetchRelated('Octopus');

			expect(out.map((c) => c.title)).toEqual(['Grimpoteuthis', 'Umbrella octopus', 'Cephalopod']);
			expect(out.map((c) => c.position)).toEqual([0, 1, 2]);
		});

		it('assigns positions by rank even when the illustrated-first cap reorders the list', async () => {
			actionGet.mockResolvedValue({
				query: {
					pages: [
						page('Third', 3),
						page('First', 1),
						page('Second', 2, { thumbnail: { source: 'x', width: 1, height: 1 } })
					]
				}
			});

			const out = await fetchRelated('Octopus');

			// Thumbnailed candidate floats first (cap priority), but its position
			// still records its generator rank.
			expect(out[0].title).toBe('Second');
			expect(out[0].position).toBe(1);
			const byTitle = new Map(out.map((c) => [c.title, c.position]));
			expect(byTitle.get('First')).toBe(0);
			expect(byTitle.get('Third')).toBe(2);
		});
	});

	describe('filtering', () => {
		it('drops missing, non-main-namespace, and substance-free pages', async () => {
			actionGet.mockResolvedValue({
				query: {
					pages: [
						page('Kept', 1),
						page('Gone', 2, { missing: true }),
						page('Category:Octopuses', 3, { ns: 14 }),
						page('Bare stub', 4, { description: undefined })
					]
				}
			});

			const out = await fetchRelated('Octopus');
			expect(out.map((c) => c.title)).toEqual(['Kept']);
		});
	});
});
