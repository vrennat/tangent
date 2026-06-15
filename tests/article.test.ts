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

/**
 * Climate/weather boxes are tagged `wh-climate` so CSS can pin the metric-label column and keep
 * the heatmap. Detection scans each wikitable's own leading content (before any nested table) for
 * a "Climate/Weather/Sunshine/Rainfall data for" title, so an outer layout table that merely
 * contains a weather box is skipped in favour of the inner box.
 */
const weatherBox = (title: string, cls = 'wikitable') =>
	`<table class="${cls}"><tbody>` +
	`<tr><th colspan="3">${title}</th></tr>` +
	`<tr><th>Month</th><th>Jan</th><th>Feb</th></tr>` +
	`<tr><th>Record high</th><td style="background:#FF9B37">67</td><td style="background:#FF7800">75</td></tr>` +
	`</tbody></table>`;

describe('sanitizeArticleHtml — climate-box tagging', () => {
	it('tags a weather box with wh-climate (keeping its other classes)', () => {
		const out = sanitizeArticleHtml(weatherBox('Climate data for Testville'));
		expect(out).toContain('class="wh-climate wikitable"');
		expect(out).toContain('background:#FF9B37'); // heatmap colour survives
	});

	it('tags the "Sunshine data for" variant', () => {
		const out = sanitizeArticleHtml(weatherBox('Sunshine data for Testville'));
		expect(out).toContain('wh-climate');
	});

	it('leaves an ordinary wikitable untouched', () => {
		const out = sanitizeArticleHtml(
			'<table class="wikitable"><tbody><tr><th>Year</th><th>Pop.</th></tr><tr><td>1900</td><td>500</td></tr></tbody></table>'
		);
		expect(out).not.toContain('wh-climate');
	});

	it('tags the inner box, not an outer layout table that contains it', () => {
		const out = sanitizeArticleHtml(
			`<table class="wikitable"><tbody><tr><td>${weatherBox('Climate data for Testville')}</td></tr></tbody></table>`
		);
		expect(out.split('wh-climate').length - 1).toBe(1); // exactly one tag
	});
});

/**
 * Family/pedigree tree charts ({{Chart}}) — a classless `border-collapse:separate` table whose
 * cells draw the tree with inline borders — are wrapped in a horizontal-scroll div and tagged
 * `wh-chart`. The classless + separate-collapse signature plus the connector idiom keeps navboxes
 * and ordinary tables out.
 */
const chartTree = (extraOpen = '') =>
	`<table style="border-spacing: 0px; border-collapse: separate; margin: 0 auto;"${extraOpen}><tbody>` +
	`<tr><td style="border:1px solid">Sophia</td></tr>` +
	`<tr><td style="border:0px solid; border-width:1px"></td></tr>` +
	`</tbody></table>`;

describe('sanitizeArticleHtml — chart-tree wrapping', () => {
	it('wraps a chart tree in a scroll div and tags the table', () => {
		const out = sanitizeArticleHtml(chartTree());
		expect(out).toContain('<div class="wh-chart-scroll">');
		expect(out).toContain('<table class="wh-chart"');
		expect(out).toContain('Sophia');
	});

	it('does not wrap a classed table (e.g. navbox) even with separate collapse', () => {
		const out = sanitizeArticleHtml(
			'<table class="navbox" style="border-collapse: separate"><tbody><tr><td style="border-bottom:1px solid"></td></tr></tbody></table>'
		);
		expect(out).not.toContain('wh-chart');
	});

	it('does not wrap a separate-collapse table that lacks connector cells', () => {
		const out = sanitizeArticleHtml(
			'<table style="border-collapse: separate; margin: 0 auto;"><tbody><tr><td>plain cell</td></tr></tbody></table>'
		);
		expect(out).not.toContain('wh-chart');
	});

	it('does not wrap a classless separate-collapse table without margin:0 auto (e.g. periodic table)', () => {
		const out = sanitizeArticleHtml(
			'<table style="border-spacing:1px; border-collapse:separate;"><tbody>' +
				'<tr><td style="border:0px solid; border-width:1px">H</td><td>He</td></tr></tbody></table>'
		);
		expect(out).not.toContain('wh-chart');
	});
});

/**
 * Wide all-text data tables (election results, demographics, rankings) are tagged `wh-wide` so CSS
 * can nowrap their cells and let the existing overflow scroll engage, instead of squeezing every
 * column to one word per line. The detector skips "document" tables with a prose column (a long
 * cell in an ordinary row, or repeated long full-width rows like episode summaries), which nowrap
 * would explode — while tolerating a single long full-width footnote/caption banner.
 */
const dataRow = (cols: number, val = 'Conservative') =>
	`<tr>${Array.from({ length: cols }, () => `<td>${val}</td>`).join('')}</tr>`;
const wikitable = (rows: string) => `<table class="wikitable"><tbody>${rows}</tbody></table>`;
const longText = 'lorem ipsum '.repeat(12); // ~144 chars, well over the 80-char prose threshold

describe('sanitizeArticleHtml — wide-table tagging', () => {
	it('tags a wide (>=6 col) all-text grid with wh-wide', () => {
		const out = sanitizeArticleHtml(wikitable(dataRow(7) + dataRow(7) + dataRow(7)));
		expect(out).toContain('class="wh-wide wikitable"');
	});

	it('leaves a narrow (<=5 col) table untouched', () => {
		const out = sanitizeArticleHtml(wikitable(dataRow(5) + dataRow(5) + dataRow(5)));
		expect(out).not.toContain('wh-wide');
	});

	it('skips a table with a long prose cell in an ordinary data row', () => {
		const proseRow = `<tr><td>a</td><td>${longText}</td><td>c</td><td>d</td><td>e</td><td>f</td></tr>`;
		const out = sanitizeArticleHtml(wikitable(dataRow(6) + dataRow(6) + proseRow));
		expect(out).not.toContain('wh-wide');
	});

	it('skips a document table with repeated long full-width rows (episode-summary shape)', () => {
		const summary = `<tr><td colspan="6">${longText}</td></tr>`;
		const out = sanitizeArticleHtml(wikitable(dataRow(6) + summary + dataRow(6) + summary));
		expect(out).not.toContain('wh-wide');
	});

	it('tags a wide grid that carries a single long full-width footnote banner', () => {
		const footnote = `<tr><td colspan="7">${longText}</td></tr>`;
		const out = sanitizeArticleHtml(wikitable(dataRow(7) + dataRow(7) + dataRow(7) + footnote));
		expect(out).toContain('wh-wide');
	});

	it('does not double-tag a weather box (climate pass claims it first)', () => {
		const wideWeather =
			'<table class="wikitable"><tbody>' +
			'<tr><th colspan="14">Climate data for Testville</th></tr>' +
			`<tr><th>Month</th>${'<th>Jan</th>'.repeat(13)}</tr>` +
			dataRow(14, '20') +
			'</tbody></table>';
		const out = sanitizeArticleHtml(wideWeather);
		expect(out).toContain('wh-climate');
		expect(out).not.toContain('wh-wide');
	});

	it('measures width by data rows, not a colspan title banner', () => {
		const out = sanitizeArticleHtml(
			wikitable('<tr><th colspan="9">Some Wide Title Banner</th></tr>' + dataRow(4) + dataRow(4))
		);
		expect(out).not.toContain('wh-wide'); // only 4 data columns; the banner doesn't inflate width
	});
});

describe('sanitizeArticleHtml — Parsoid JSON-blob attributes', () => {
	// A deduplicated-templatestyles <link> carries a whole glossary transclusion in its
	// data-mw. That JSON embeds literal `>` (refs, inline HTML), which used to truncate the
	// `<link[^>]*>` remover at the first inner `>` and spill the rest of the blob as visible
	// text — the glossary-rendering bug. The blob must be stripped before the tag is removed.
	// The blob embeds a literal `>` (inside `<ref ...>`) BEFORE a later "template" token —
	// the exact shape that made `<link[^>]*>` truncate at the inner `>`. A fixture without
	// an inner `>` would pass even on the buggy ordering, so this `>` is load-bearing.
	const GLOSSARY_LINK =
		'<link rel="mw-deduplicated-inline-style" href="mw-data:TemplateStyles:r1" ' +
		`typeof="mw:Extension/templatestyles mw:Transclusion" data-mw='{"parts":[{"template":` +
		`{"target":{"wt":"defn"},"params":{"1":{"wt":"cooling <ref name=\\"s\\">note</ref>"}},"i":0}},` +
		`{"template":{"target":{"wt":"term"},"params":{"1":{"wt":"adiabat"}},"i":1}}]}'/>`;

	it('removes a <link> whose data-mw JSON contains literal > without spilling JSON as text', () => {
		const out = sanitizeArticleHtml(`<p>Before</p>${GLOSSARY_LINK}<p>After</p>`);
		expect(out).not.toContain('"template"'); // the post-`>` tail must not leak
		expect(out).not.toContain('"parts"');
		expect(out).not.toContain('<link');
		expect(out).toContain('<p>Before</p>');
		expect(out).toContain('<p>After</p>');
	});

	it('strips data-mw on a retained element (e.g. <sup> ref) without leaking the blob', () => {
		const out = sanitizeArticleHtml(
			`<sup class="mw-ref" data-mw='{"name":"ref","body":{"id":"x"}}'>[1]</sup>`
		);
		expect(out).not.toContain('data-mw');
		expect(out).not.toContain('"name"');
		expect(out).toContain('[1]');
	});
});
