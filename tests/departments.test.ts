import { describe, it, expect } from 'vitest';
import type { Candidate } from '../src/lib/wikipedia/types';
import { department } from '../src/lib/feed/departments';

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

describe('department', () => {
	describe('happy path', () => {
		it('files an extinct order under Deep Time', () => {
			expect(department(candidate('Belemnoidea', 'Extinct order of cephalopods'))).toBe(
				'Deep Time'
			);
		});

		it('files a geologic epoch under Deep Time', () => {
			expect(department(candidate('Miocene', 'First geological epoch of the Neogene Period'))).toBe(
				'Deep Time'
			);
		});

		it('files a genuinely mysterious death under Strange Deaths', () => {
			expect(
				department(
					candidate('Death of Edgar Allan Poe', 'Mysterious death in 1849', [
						'Category:Unsolved deaths'
					])
				)
			).toBe('Strange Deaths');
		});

		it('files a lost artifact under Lost & Found', () => {
			expect(
				department(candidate('Athena Parthenos', 'Lost statue by Phidias', ['Category:Lost sculptures']))
			).toBe('Lost & Found');
		});

		it('files a forgery under Hoaxes & Blunders', () => {
			expect(
				department(candidate('Dare Stones', 'Series of inscribed stones, likely a forgery'))
			).toBe('Hoaxes & Blunders');
		});
	});

	describe('precision guards (a mislabel is worse than the plain divider)', () => {
		it('does NOT file an execution as a Strange Death', () => {
			// "executed"/"assassinated" alone would file crucifixions and royal
			// beheadings here — measured against real tangent landings, that caught
			// figures whose deaths are anything but a trivia column.
			expect(
				department(
					candidate('Marie Antoinette', 'Queen of France executed in 1793', [
						'Category:People executed by guillotine'
					])
				)
			).toBeNull();
		});

		it('files the Cambrian explosion as Deep Time, not Disasters', () => {
			expect(
				department(candidate('Cambrian explosion', 'Rapid diversification of animal life'))
			).toBe('Deep Time');
		});

		it('ignores paleontological CATEGORIES on living taxa for Deep Time', () => {
			// "Cambrian first appearances" sits on extant phyla; only the article
			// itself being about deep time counts.
			expect(
				department(
					candidate('Tunicate', 'Marine invertebrate animal', [
						'Category:Cambrian first appearances'
					])
				)
			).toBeNull();
		});

		it('returns null for an ordinary article (plain divider fallback)', () => {
			expect(department(candidate('Roman roads', 'Roads of the Roman Empire'))).toBeNull();
		});
	});
});
