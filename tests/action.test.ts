import { describe, it, expect, vi, beforeEach } from 'vitest';

const { actionGet } = vi.hoisted(() => ({ actionGet: vi.fn() }));
vi.mock('../src/lib/wikipedia/client', () => ({ actionGet }));

import { fetchRelated } from '../src/lib/wikipedia/action';

function page(title: string, index: number, overrides: Record<string, unknown> = {}) {
	return { pageid: index, ns: 0, title, index, description: `about ${title}`, ...overrides };
}

/** Mock: first call answers the page/generator query, later calls answer the
 *  category batch (empty unless a test overrides them). */
function mockPagesThenCategories(pages: unknown[], categoryResponses: unknown[] = [{}]) {
	actionGet.mockResolvedValueOnce({ query: { pages } });
	for (const r of categoryResponses) actionGet.mockResolvedValueOnce(r);
}

describe('fetchRelated', () => {
	beforeEach(() => {
		actionGet.mockReset();
		// Safety net for call counts beyond a test's explicit mocks.
		actionGet.mockResolvedValue({});
	});

	describe('generator ordering', () => {
		// The Action API returns generator results in arbitrary order; the `index`
		// field carries the generator's rank (for morelike:, similarity). Candidate
		// `position` must reflect that rank, not the arbitrary array order, because
		// the engine's position boost treats low positions as prominence.
		it('orders candidates and positions by generator index, not array order', async () => {
			mockPagesThenCategories([
				page('Cephalopod', 5),
				page('Grimpoteuthis', 1),
				page('Umbrella octopus', 3)
			]);

			const out = await fetchRelated('Octopus');

			expect(out.map((c) => c.title)).toEqual(['Grimpoteuthis', 'Umbrella octopus', 'Cephalopod']);
			expect(out.map((c) => c.position)).toEqual([0, 1, 2]);
		});

		it('assigns positions by rank even when the illustrated-first cap reorders the list', async () => {
			mockPagesThenCategories([
				page('Third', 3),
				page('First', 1),
				page('Second', 2, { thumbnail: { source: 'x', width: 1, height: 1 } })
			]);

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
			mockPagesThenCategories([
				page('Kept', 1),
				page('Gone', 2, { missing: true }),
				page('Category:Octopuses', 3, { ns: 14 }),
				page('Bare stub', 4, { description: undefined })
			]);

			const out = await fetchRelated('Octopus');
			expect(out.map((c) => c.title)).toEqual(['Kept']);
		});
	});

	describe('category completeness', () => {
		// prop=categories pays out a fixed membership budget per REQUEST (cllimit=max
		// = 500), not per page — a rich batch exhausts it mid-list and later pages
		// silently get nothing unless clcontinue is followed to the end. clshow=!hidden
		// SUPPRESSES that continuation entirely (verified live), so hidden categories
		// are flagged via clprop=hidden and filtered client-side instead.
		it('merges categories across clcontinue continuations and drops hidden ones', async () => {
			const cat = (title: string, hidden = false) => ({ ns: 14, title, hidden });
			mockPagesThenCategories(
				[page('Alpha', 1), page('Beta', 2)],
				[
					{
						query: {
							pages: [
								{
									ns: 0,
									title: 'Alpha',
									categories: [
										cat('Category:Ancient Rome'),
										cat('Category:Articles with short description', true)
									]
								},
								{ ns: 0, title: 'Beta' }
							]
						},
						continue: { clcontinue: 'x', continue: '-||' }
					},
					{
						query: {
							pages: [
								{ ns: 0, title: 'Alpha', categories: [cat('Category:Roman generals')] },
								{ ns: 0, title: 'Beta', categories: [cat('Category:Punic Wars')] }
							]
						}
					}
				]
			);

			const out = await fetchRelated('Octopus');
			const byTitle = new Map(out.map((c) => [c.title, c.categories]));
			expect(byTitle.get('Alpha')).toEqual(['Category:Ancient Rome', 'Category:Roman generals']);
			expect(byTitle.get('Beta')).toEqual(['Category:Punic Wars']);
		});

		it('returns candidates with empty categories when the category fetch fails', async () => {
			actionGet.mockReset();
			actionGet.mockResolvedValueOnce({ query: { pages: [page('Kept', 1)] } });
			actionGet.mockRejectedValueOnce(new Error('boom'));

			const out = await fetchRelated('Octopus');
			expect(out.map((c) => c.title)).toEqual(['Kept']);
			expect(out[0].categories).toEqual([]);
		});
	});
});
