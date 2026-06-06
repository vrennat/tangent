import { describe, it, expect } from 'vitest';
import { wormholeTitleFromHref } from '../src/lib/wikipedia/links';

describe('wormholeTitleFromHref', () => {
	describe('article links (open a new wormhole)', () => {
		it('extracts a plain article title', () => {
			expect(wormholeTitleFromHref('https://en.wikipedia.org/wiki/Aqueduct')).toBe('Aqueduct');
		});

		it('converts underscores to spaces', () => {
			expect(wormholeTitleFromHref('https://en.wikipedia.org/wiki/Roman_Empire')).toBe('Roman Empire');
		});

		it('drops a section anchor', () => {
			expect(wormholeTitleFromHref('https://en.wikipedia.org/wiki/Aqueduct#History')).toBe('Aqueduct');
		});

		it('keeps a colon that is not a namespace', () => {
			expect(wormholeTitleFromHref('https://en.wikipedia.org/wiki/Mission:_Impossible')).toBe(
				'Mission: Impossible'
			);
		});

		it('decodes percent-encoded characters', () => {
			expect(wormholeTitleFromHref('https://en.wikipedia.org/wiki/Caf%C3%A9')).toBe('Café');
		});
	});

	describe('non-article links (open externally instead)', () => {
		it('rejects File: pages', () => {
			expect(wormholeTitleFromHref('https://en.wikipedia.org/wiki/File:Octopus.jpg')).toBeNull();
		});

		it('rejects Category: pages', () => {
			expect(
				wormholeTitleFromHref('https://en.wikipedia.org/wiki/Category:Cephalopods')
			).toBeNull();
		});

		it('rejects Special: pages', () => {
			expect(
				wormholeTitleFromHref('https://en.wikipedia.org/wiki/Special:BookSources/123')
			).toBeNull();
		});

		it('rejects edit/history (/w/index.php) links', () => {
			expect(
				wormholeTitleFromHref('https://en.wikipedia.org/w/index.php?title=Foo&action=edit')
			).toBeNull();
		});

		it('rejects off-wiki citation links', () => {
			expect(wormholeTitleFromHref('https://doi.org/10.1000/xyz')).toBeNull();
		});

		it('rejects in-page anchors', () => {
			expect(wormholeTitleFromHref('#cite_note-3')).toBeNull();
		});
	});
});
