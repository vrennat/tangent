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

/**
 * Footnote pruning: the citation list is dropped along with the section heading it
 * lived under, so the reader never shows an empty "References"/"Notes" section — but
 * a references section that also carries a real bibliography keeps that content.
 * Inputs mirror the Parsoid shapes seen in the wild (wrap as a direct child, and the
 * extra classless <div> wrapper {{reflist}} sometimes adds).
 */
const refList = (group = '') =>
	`<div class="mw-references-wrap mw-references-columns"><ol class="mw-references references"${group ? ` data-mw-group="${group}"` : ''}>` +
	`<li id="cite_note-1"><span class="mw-reference-text">Smith, J. (2019). Octopus cognition.</span></li>` +
	`</ol></div>`;

describe('sanitizeArticleHtml — footnote pruning', () => {
	it('drops a pure citation section, heading and list together', () => {
		const out = sanitizeArticleHtml(
			`<section data-mw-section-id="9"><h2 id="References">References</h2>${refList()}</section>`
		);
		expect(out).not.toContain('References');
		expect(out).not.toContain('mw-references-wrap');
		expect(out).not.toContain('Octopus cognition');
	});

	it('drops a section whose list sits in the extra {{reflist}} <div> wrapper', () => {
		const out = sanitizeArticleHtml(
			`<section><h2 id="Notes">Notes</h2><span class="mw-empty-elt"></span><div>\n${refList('lower-alpha')}</div></section>`
		);
		expect(out).not.toContain('Notes');
		expect(out).not.toContain('mw-references-wrap');
	});

	it('keeps a references section that also holds a bibliography', () => {
		const out = sanitizeArticleHtml(
			`<section><h2 id="References">References</h2>${refList()}` +
				`<section><h3>Works cited</h3><div class="refbegin"><ul><li><cite>Bell, J. S. (1966).</cite></li></ul></div></section>` +
				`</section>`
		);
		expect(out).toContain('References'); // heading survives…
		expect(out).toContain('Works cited'); // …because the bibliography remains
		expect(out).toContain('Bell, J. S. (1966).');
		expect(out).not.toContain('mw-references-wrap'); // but the inline citation list is gone
		expect(out).not.toContain('Octopus cognition');
	});

	it('keeps a references section that is itself a {{refbegin}} bibliography', () => {
		const out = sanitizeArticleHtml(
			`<section><h2 id="References">References</h2><span class="mw-empty-elt"></span>` +
				`<div class="refbegin refbegin-columns references-column-width"><ul><li><cite>Allen, M. (1975).</cite></li></ul></div></section>`
		);
		expect(out).toContain('References');
		expect(out).toContain('Allen, M. (1975).');
	});

	it('leaves content sections (See also, External links) untouched', () => {
		const out = sanitizeArticleHtml(
			`<section><h2 id="See_also">See also</h2><ul><li><a href="./Cephalopod">Cephalopod</a></li></ul></section>` +
				`<section><h2 id="External_links">External links</h2><ul><li><a href="https://example.org">Refuge</a></li></ul></section>`
		);
		expect(out).toContain('See also');
		expect(out).toContain('Cephalopod');
		expect(out).toContain('External links');
	});
});
