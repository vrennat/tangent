import { describe, it, expect } from 'vitest';
import type { Candidate } from '../src/lib/wikipedia/types';
import { classifyDirection, eraBuckets, placeTokens } from '../src/lib/feed/directions';

function candidate(
	title: string,
	description: string | null,
	categories: string[] = []
): Candidate {
	return {
		title,
		description,
		thumbnail: null,
		isDisambiguation: false,
		relation: 'link',
		categories,
		position: 0
	};
}

describe('eraBuckets', () => {
	describe('happy path', () => {
		it('buckets a modern year to its decade', () => {
			expect(eraBuckets(candidate('Falklands War', '1982 war between Argentina and the UK'))).toContain(
				'1980s'
			);
		});

		it('buckets a pre-1800 year to its century', () => {
			expect(eraBuckets(candidate('Spanish Armada', 'Fleet assembled in 1588'))).toContain('16c');
		});

		it('reads ordinal-century categories', () => {
			expect(
				eraBuckets(candidate('Baroque', null, ['Category:17th-century art movements']))
			).toContain('17c');
		});

		it('reads decade categories directly', () => {
			expect(eraBuckets(candidate('Punk rock', null, ['Category:1970s in music']))).toContain(
				'1970s'
			);
		});

		it('buckets BC years and centuries separately from AD', () => {
			const buckets = eraBuckets(
				candidate('Battle of Actium', 'Naval battle of 31 BC', ['Category:1st-century BC battles'])
			);
			expect(buckets).toContain('1c-bc');
			expect(buckets).not.toContain('1c');
		});
	});

	describe('edge cases', () => {
		it('ignores years in titles (identifiers, not dates)', () => {
			expect(eraBuckets(candidate('Boeing 1947', 'Airliner concept'))).toEqual(new Set());
		});

		it('returns empty for undated subjects', () => {
			expect(eraBuckets(candidate('Octopus', 'Order of cephalopod mollusks'))).toEqual(new Set());
		});
	});
});

describe('placeTokens', () => {
	describe('happy path', () => {
		it('finds a country in categories', () => {
			expect(
				placeTokens(candidate('Falklands War', null, ['Category:Wars involving Argentina']))
			).toContain('argentina');
		});

		it('finds a multiword place', () => {
			expect(
				placeTokens(
					candidate('Falklands War', null, ['Category:History of the Falkland Islands'])
				)
			).toContain('falkland islands');
		});

		it('finds a place in the description', () => {
			expect(placeTokens(candidate('Machu Picchu', '15th-century Inca citadel in Peru'))).toContain(
				'peru'
			);
		});

		it('finds a historical polity', () => {
			expect(
				placeTokens(candidate('Praetorian Guard', null, ['Category:Military units of the Roman Empire']))
			).toContain('roman empire');
		});
	});

	describe('edge cases', () => {
		it('does not read a person title as a place', () => {
			expect(placeTokens(candidate('Michael Jordan', 'American basketball player'))).toEqual(
				new Set()
			);
		});

		it('does not match a country inside its demonym', () => {
			expect(placeTokens(candidate('Porcelain', 'Chinese ceramic material'))).toEqual(new Set());
		});

		it('returns empty for placeless subjects', () => {
			expect(placeTokens(candidate('Quantum entanglement', 'Physical phenomenon'))).toEqual(
				new Set()
			);
		});
	});
});

describe('classifyDirection', () => {
	const runEras = new Set(['1980s']);
	const runPlaces = new Set(['argentina', 'united kingdom', 'falkland islands']);
	const runCategories = new Set(['wars', 'involving', 'argentina', '1982', 'conflicts']);

	describe('happy path', () => {
		it('labels same-era different-place as era', () => {
			const c = candidate('1985 Mexico City earthquake', 'Earthquake that struck Mexico in 1985', [
				'Category:1985 earthquakes',
				'Category:Earthquakes in Mexico'
			]);
			expect(classifyDirection(c, { runEras, runPlaces, runCategories })).toBe('era');
		});

		it('labels same-place different-era as place', () => {
			const c = candidate('Argentine Confederation', '1831–1861 predecessor state of Argentina', [
				'Category:History of Argentina',
				'Category:States and territories established in 1831'
			]);
			expect(classifyDirection(c, { runEras, runPlaces, runCategories })).toBe('place');
		});

		it('labels shared-category-thread with neither era nor place as theme', () => {
			const c = candidate('Iran–Iraq War', 'War in the Middle East', [
				'Category:Wars involving Iran',
				'Category:Proxy wars'
			]);
			expect(classifyDirection(c, { runEras, runPlaces, runCategories })).toBe('theme');
		});
	});

	describe('edge cases', () => {
		it('returns null when era matches but the candidate has no place', () => {
			const c = candidate('Compact disc', 'Digital optical disc format introduced in 1982');
			expect(classifyDirection(c, { runEras, runPlaces, runCategories })).toBeNull();
		});

		it('returns null when both era and place are shared (neighborhood, not tangent)', () => {
			const c = candidate('Battle of Goose Green', '1982 Falklands War battle', [
				'Category:Battles of the Falklands War',
				'Category:Conflicts in 1982',
				'Category:History of the Falkland Islands'
			]);
			expect(classifyDirection(c, { runEras, runPlaces, runCategories })).toBeNull();
		});

		it('does not call generic category overlap a theme', () => {
			const c = candidate('Impressionism', 'Art movement', [
				'Category:History of art',
				'Category:French people'
			]);
			expect(
				classifyDirection(c, {
					runEras,
					runPlaces,
					runCategories: new Set(['history', 'people', 'military'])
				})
			).toBeNull();
		});
	});

	describe('error cases', () => {
		it('returns null with empty run context (old clients degrade to wild)', () => {
			const c = candidate('1985 Mexico City earthquake', 'Earthquake in Mexico in 1985', [
				'Category:Earthquakes in Mexico'
			]);
			expect(
				classifyDirection(c, {
					runEras: new Set(),
					runPlaces: new Set(),
					runCategories: new Set()
				})
			).toBeNull();
		});
	});
});
