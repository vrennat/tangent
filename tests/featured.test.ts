import { describe, it, expect } from 'vitest';
import type { Candidate } from '../src/lib/wikipedia/types';
import { rankSeeds } from '../src/lib/feed/score';
import { _internal } from '../src/lib/wikipedia/featured';

const { dykSubject, isArticleSeed, stripHtml } = _internal;

function candidate(overrides: Partial<Candidate> = {}): Candidate {
	return {
		title: 'Aqueduct',
		description: 'water channel',
		thumbnail: null,
		isDisambiguation: false,
		relation: 'link',
		categories: [],
		position: 0,
		...overrides
	};
}

describe('rankSeeds', () => {
	describe('removals', () => {
		it('drops disambiguation pages', () => {
			const ranked = rankSeeds([candidate({ title: 'Mercury', isDisambiguation: true })]);
			expect(ranked).toHaveLength(0);
		});

		it('drops political hubs (the seed never starts on them)', () => {
			const ranked = rankSeeds([
				candidate({ title: '2024 United States presidential election', description: 'election' })
			]);
			expect(ranked).toHaveLength(0);
		});

		it('drops the WWII / authoritarian attractor', () => {
			const ranked = rankSeeds([
				candidate({ title: 'Adolf Hitler', description: 'Dictator of Germany 1933–1945' })
			]);
			expect(ranked).toHaveLength(0);
		});

		it('keeps an ordinary article', () => {
			const ranked = rankSeeds([candidate({ title: 'Octopus', description: 'marine mollusc' })]);
			expect(ranked.map((c) => c.title)).toEqual(['Octopus']);
		});
	});

	describe('ordering', () => {
		it('ranks a vivid, named/dated subject above a bare abstraction', () => {
			const concrete = candidate({
				title: 'Chernobyl disaster',
				description: '1986 nuclear accident in the Soviet Union'
			});
			const abstract = candidate({ title: 'Science', description: 'the study of the natural world' });
			const ranked = rankSeeds([abstract, concrete]);
			expect(ranked[0].title).toBe('Chernobyl disaster');
		});

		it('is independent of input order', () => {
			const a = candidate({ title: 'Volcano', description: 'rupture in planetary crust' });
			const b = candidate({ title: 'Tardigrade', description: '1773 microscopic animal' });
			const forward = rankSeeds([a, b]).map((c) => c.title);
			const reverse = rankSeeds([b, a]).map((c) => c.title);
			expect(forward).toEqual(reverse);
		});
	});
});

describe('dykSubject', () => {
	it('extracts the bolded subject article (DYK convention)', () => {
		const html =
			'... that <i><b><a rel="mw:WikiLink" href="https://en.wikipedia.org/wiki/El_Sol_Rojo">El Sol Rojo</a></b></i>, located adjacent to <a href="https://en.wikipedia.org/wiki/Estadio_Azteca">Mexico City Stadium</a>, has no recognized legal owner?';
		expect(dykSubject(html)).toBe('El Sol Rojo');
	});

	it('falls back to the first article link when nothing is bolded', () => {
		const html = '... that <a href="https://en.wikipedia.org/wiki/Quokka">the quokka</a> smiles?';
		expect(dykSubject(html)).toBe('Quokka');
	});

	it('skips non-article links (File:, citations) when choosing the subject', () => {
		const html =
			'... see <b><a href="https://en.wikipedia.org/wiki/File:Map.png">this map</a></b> of <a href="https://en.wikipedia.org/wiki/Patagonia">Patagonia</a>?';
		expect(dykSubject(html)).toBe('Patagonia');
	});

	it('returns null when there is no usable article link', () => {
		expect(dykSubject('... that nothing here links anywhere?')).toBeNull();
	});
});

describe('isArticleSeed', () => {
	it('rejects the portal and housekeeping pages', () => {
		expect(isArticleSeed('Main Page')).toBe(false);
		expect(isArticleSeed('Deaths in 2026')).toBe(false);
		expect(isArticleSeed('2026 in film')).toBe(false);
		expect(isArticleSeed('Wikipedia:Featured articles')).toBe(false);
		expect(isArticleSeed('Special:Search')).toBe(false);
	});

	it('keeps real articles, including ones that start with a year + lowercase word', () => {
		expect(isArticleSeed('Roman Empire')).toBe(true);
		expect(isArticleSeed('1986 California Proposition 65')).toBe(true);
	});
});

describe('stripHtml', () => {
	it('removes tags and HTML comments, collapsing whitespace', () => {
		expect(stripHtml('<!--Jun 13-->In basketball, the <a href="x">Knicks</a> win.')).toBe(
			'In basketball, the Knicks win.'
		);
	});
});
