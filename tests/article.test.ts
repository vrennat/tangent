import { describe, it, expect } from 'vitest';
import { sanitizeArticleHtml } from '../src/lib/wikipedia/article';

/**
 * The lead-image hoist (hoistInfoboxImage) is exercised through the public
 * sanitizeArticleHtml so we test the real pipeline. Snippets omit <body> on
 * purpose — sanitize keeps the whole string when there's no body wrapper.
 */

const imageRow = (imgs: string, caption = true) =>
	`<tr><td colspan="2" class="infobox-image">${imgs}` +
	(caption ? '<div class="infobox-caption">cover with <a href="./Acquanetta">Acquanetta</a></div>' : '') +
	`</td></tr>`;

const COVER =
	'<span class="mw-default-size"><a href="./File:Jet.jpg" class="mw-file-description">' +
	'<img src="https://upload.wikimedia.org/jet.jpg" width="250" height="358" class="mw-file-element"/></a></span>';

const FACT_ROW =
	'<tr><th class="infobox-label">Publisher</th><td class="infobox-data">Ebony Media</td></tr>';

const infobox = (rows: string) =>
	`<table class="infobox hproduct"><caption class="infobox-title fn"><i>Jet</i></caption><tbody>${rows}</tbody></table>`;

describe('sanitizeArticleHtml — infobox lead-image hoist', () => {
	describe('single-image infobox', () => {
		const out = sanitizeArticleHtml(infobox(imageRow(COVER) + FACT_ROW));

		it('emits a lead figure before the quick-facts disclosure', () => {
			const fig = out.indexOf('<figure class="infobox-lead">');
			const details = out.indexOf('<details class="quick-facts">');
			expect(fig).toBeGreaterThanOrEqual(0);
			expect(fig).toBeLessThan(details);
		});

		it('moves the image — it appears once, inside the figure not the table', () => {
			expect(out.split('jet.jpg').length - 1).toBe(1);
			const figureHtml = out.slice(
				out.indexOf('<figure'),
				out.indexOf('</figure>') + '</figure>'.length
			);
			expect(figureHtml).toContain('jet.jpg');
			expect(out).not.toContain('infobox-image');
		});

		it('preserves the caption (with its link) as a figcaption', () => {
			expect(out).toContain('<figcaption>');
			expect(out).toContain('>Acquanetta</a>');
		});

		it('keeps the rest of the fact table intact inside the disclosure', () => {
			expect(out).toContain('Ebony Media');
			expect(out).toContain('<i>Jet</i>');
		});
	});

	describe('edge cases', () => {
		it('leaves an image-less infobox wrapped, with no figure', () => {
			const out = sanitizeArticleHtml(infobox(FACT_ROW));
			expect(out).toContain('<details class="quick-facts">');
			expect(out).not.toContain('<figure');
		});

		it('does not hoist a multi-image cell (flag + coat of arms stay in the table)', () => {
			const twoImgs =
				'<span class="mw-default-size"><img src="https://upload.wikimedia.org/flag.svg.png" width="120" height="80" class="mw-file-element"/></span>' +
				'<span class="mw-default-size"><img src="https://upload.wikimedia.org/arms.svg.png" width="100" height="120" class="mw-file-element"/></span>';
			const out = sanitizeArticleHtml(infobox(imageRow(twoImgs, false) + FACT_ROW));
			expect(out).not.toContain('<figure');
			expect(out).toContain('flag.svg.png');
			expect(out).toContain('arms.svg.png');
		});

		it('hoists an image with no caption (figure, no figcaption)', () => {
			const out = sanitizeArticleHtml(infobox(imageRow(COVER, false) + FACT_ROW));
			expect(out).toContain('<figure class="infobox-lead">');
			expect(out).not.toContain('<figcaption>');
		});

		it('leaves an article with no infobox untouched', () => {
			const out = sanitizeArticleHtml('<p>Just prose, no infobox.</p>');
			expect(out).not.toContain('<details');
			expect(out).not.toContain('<figure');
			expect(out).toContain('Just prose');
		});
	});
});
