import { describe, it, expect } from 'vitest';
import {
	EMPTY_PERSISTED,
	hydratePersisted,
	mergePersisted,
	type Persisted
} from '../src/lib/engagement/persisted';

function make(overrides: Partial<Persisted>): Persisted {
	return hydratePersisted(overrides);
}

describe('hydratePersisted', () => {
	it('fills missing keys from empty', () => {
		const p = hydratePersisted({ likedTitles: ['A'] });
		expect(p.likedTitles).toEqual(['A']);
		expect(p.clickthroughs).toEqual([]);
		expect(p.tokenWeights).toEqual({});
		expect(p.taste).toBe('balanced');
	});

	it('sanitizes an invalid taste to balanced', () => {
		expect(hydratePersisted({ taste: 'serendipity' as never }).taste).toBe('balanced');
	});

	it('preserves a valid taste', () => {
		expect(hydratePersisted({ taste: 'science' }).taste).toBe('science');
	});

	it('treats null/undefined as empty', () => {
		expect(hydratePersisted(null)).toEqual(EMPTY_PERSISTED);
		expect(hydratePersisted(undefined)).toEqual(EMPTY_PERSISTED);
	});
});

describe('mergePersisted', () => {
	it('unions title sets without duplicates', () => {
		const a = make({ likedTitles: ['Octopus', 'Squid'], clickthroughs: ['Kraken'] });
		const b = make({ likedTitles: ['Squid', 'Nautilus'], clickthroughs: ['Kraken', 'Ammonite'] });
		const m = mergePersisted(a, b);
		expect([...m.likedTitles].sort()).toEqual(['Nautilus', 'Octopus', 'Squid']);
		expect([...m.clickthroughs].sort()).toEqual(['Ammonite', 'Kraken']);
	});

	it('takes the per-token MAX rather than summing (capped running sums)', () => {
		const a = make({ tokenWeights: { octopus: 2, shared: 1.5 } });
		const b = make({ tokenWeights: { octopus: 1, kraken: 3, shared: 4 } });
		const m = mergePersisted(a, b);
		expect(m.tokenWeights).toEqual({ octopus: 2, kraken: 3, shared: 4 });
	});

	it('merges avoid weights, doc-freq, and dwell by max too', () => {
		const a = make({
			tokenAvoidWeights: { spam: 1 },
			tokenDocFreq: { x: 5 },
			dwellMsByTitle: { Octopus: 1000 }
		});
		const b = make({
			tokenAvoidWeights: { spam: 0.5, junk: 2 },
			tokenDocFreq: { x: 3, y: 1 },
			dwellMsByTitle: { Octopus: 4000, Squid: 200 }
		});
		const m = mergePersisted(a, b);
		expect(m.tokenAvoidWeights).toEqual({ spam: 1, junk: 2 });
		expect(m.tokenDocFreq).toEqual({ x: 5, y: 1 });
		expect(m.dwellMsByTitle).toEqual({ Octopus: 4000, Squid: 200 });
	});

	it('keeps the larger seenCount', () => {
		expect(mergePersisted(make({ seenCount: 9 }), make({ seenCount: 3 })).seenCount).toBe(9);
	});

	it('prefers an explicit taste over balanced from either side', () => {
		expect(mergePersisted(make({ taste: 'science' }), make({ taste: 'balanced' })).taste).toBe(
			'science'
		);
		expect(mergePersisted(make({ taste: 'balanced' }), make({ taste: 'nature' })).taste).toBe(
			'nature'
		);
	});

	it('lets the b side win when both tastes are explicit (b is the newer device)', () => {
		expect(mergePersisted(make({ taste: 'history' }), make({ taste: 'nature' })).taste).toBe(
			'nature'
		);
	});

	it('merging with empty is a no-op on content', () => {
		const a = make({ likedTitles: ['Octopus'], tokenWeights: { octopus: 2 }, seenCount: 4 });
		const m = mergePersisted(a, hydratePersisted({}));
		expect(m.likedTitles).toEqual(['Octopus']);
		expect(m.tokenWeights).toEqual({ octopus: 2 });
		expect(m.seenCount).toBe(4);
	});
});
