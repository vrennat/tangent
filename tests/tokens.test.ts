import { describe, it, expect } from 'vitest';
import { tokenize, tokenSet } from '../src/lib/feed/tokens';

describe('tokenize', () => {
	describe('happy path', () => {
		it('lowercases, drops stopwords, keeps words of 3+ letters', () => {
			expect(tokenize('The Roman Empire of Rome')).toEqual(['roman', 'empire', 'rome']);
		});

		it('keeps hyphenated and apostrophe words whole', () => {
			expect(tokenize("self-taught O'Brien")).toEqual(['self-taught', "o'brien"]);
		});
	});

	describe('non-ASCII titles', () => {
		// Wikipedia is full of accented people and places. An ASCII-only tokenizer
		// splits on the accent and fabricates substrings: "Zürich" -> "rich" would
		// falsely match an interest in "rich".
		it('keeps accented characters inside tokens', () => {
			expect(tokenize('Zürich')).toEqual(['zürich']);
			expect(tokenize('Beyoncé')).toEqual(['beyoncé']);
			expect(tokenize('Gödel, Escher, Bach')).toEqual(['gödel', 'escher', 'bach']);
			expect(tokenize('São Paulo')).toEqual(['são', 'paulo']);
		});

		it('does not fabricate substrings from accent-split words', () => {
			expect(tokenize('Zürich')).not.toContain('rich');
			expect(tokenize('Café au lait')).not.toContain('caf');
		});
	});

	describe('edge cases', () => {
		it('returns empty for null, undefined, and empty input', () => {
			expect(tokenize(null)).toEqual([]);
			expect(tokenize(undefined)).toEqual([]);
			expect(tokenize('')).toEqual([]);
		});

		it('ignores digits and 1-2 letter words', () => {
			expect(tokenize('1453 AD it up')).toEqual([]);
		});
	});
});

describe('tokenSet', () => {
	it('dedupes repeated tokens', () => {
		expect(tokenSet('rome rome Rome')).toEqual(new Set(['rome']));
	});
});
