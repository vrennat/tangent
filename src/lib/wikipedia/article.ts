import { restGetText, restTitlePath } from './client';
import { reflowGraphicalTimelines } from './timeline';

const WIKI = 'https://en.wikipedia.org';

/**
 * Turn Wikipedia's Parsoid HTML into something safe and compact to drop inline
 * with {@html}. The source is trusted (HTTPS Wikimedia, and `/page/html` carries
 * no <script> tags), but we still strip executable surfaces defensively and shed
 * the bulky Parsoid metadata that would otherwise bloat the payload several-fold.
 *
 * Presentation cruft (edit links, navboxes, maintenance boxes) is left in place
 * and hidden via CSS (`.wiki-content`) rather than fragile server-side surgery.
 */
export function sanitizeArticleHtml(raw: string): string {
	let html = raw;

	// Keep only the <body> contents.
	const bodyStart = html.indexOf('<body');
	if (bodyStart !== -1) {
		const open = html.indexOf('>', bodyStart);
		const close = html.lastIndexOf('</body>');
		html = html.slice(open + 1, close === -1 ? undefined : close);
	}

	// Reflow graphical-timeline templates into a mobile-native list while the rich
	// Parsoid structure (positions, colours, links) is still intact — before the
	// attribute stripping below. Emitted `./` hrefs are resolved by the URL rewrite.
	html = reflowGraphicalTimelines(html);

	html = html
		// Remove executable / external-resource elements.
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.replace(/<link\b[^>]*>/gi, '')
		.replace(/<base\b[^>]*>/gi, '')
		.replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
		// Drop "[edit]" section links.
		.replace(/<span class="mw-editsection">[\s\S]*?<\/span>/gi, '')
		// Shed Parsoid bookkeeping attributes (JSON blobs + node ids/typeofs).
		// `id="mw.."` are Parsoid node ids; real anchor ids (cite_note-.., section
		// names) don't start with "mw", so footnote/section links survive.
		.replace(/\sdata-mw=("[^"]*"|'[^']*')/gi, '')
		.replace(/\sdata-parsoid=("[^"]*"|'[^']*')/gi, '')
		.replace(/\sabout="#mw[^"]*"/gi, '')
		.replace(/\stypeof="mw:[^"]*"/gi, '')
		.replace(/\srel="mw:[^"]*"/gi, '')
		.replace(/\sid="mw[A-Za-z0-9_-]{1,12}"/g, '')
		// Defense in depth: no inline handlers or javascript: URLs.
		.replace(/\son[a-z]+=("[^"]*"|'[^']*')/gi, '')
		.replace(/(href|src)\s*=\s*"javascript:[^"]*"/gi, '$1="#"');

	// Rewrite relative URLs to absolute so links/images resolve inside our app.
	html = html
		.replace(/(href|src|resource)="\.\//g, `$1="${WIKI}/wiki/`)
		.replace(/(href|src)="\/w\//g, `$1="${WIKI}/w/`)
		.replace(/(href|src)="\/wiki\//g, `$1="${WIKI}/wiki/`)
		.replace(/(href|src)="\/\//g, '$1="https://')
		.replace(
			/srcset="([^"]*)"/g,
			(_m, set: string) => `srcset="${set.replace(/(^|,\s*)\/\//g, '$1https://')}"`
		);

	// Defer offscreen images so image-heavy articles don't fetch everything up front.
	html = html.replace(/<img /gi, '<img loading="lazy" decoding="async" ');

	// Demote section headings one level (h2→h3, h3→h4, h4→h5) so they nest under
	// the reader's own <h2> article title rather than competing with it. Matches
	// both open and close tags; ids/anchors are preserved. (.wiki-content restyles
	// the shifted levels to keep the original visual hierarchy.)
	html = html.replace(
		/<(\/?)h([2-4])\b/gi,
		(_m, slash: string, level: string) => `<${slash}h${Number(level) + 1}`
	);

	// Tuck infoboxes into a collapsed "Quick facts" disclosure. The dense fact table
	// (capital, population, taxonomy, …) is worth keeping, but linearized into our
	// single column it dominates the reading flow — so we preserve it, collapsed.
	// Done last so the table's links/images already carry the rewritten URLs above.
	html = wrapInfoboxes(html);

	return html;
}

/**
 * Wrap each infobox `<table>` in a collapsed `<details class="quick-facts">` so the
 * structured facts stay available without blocking the prose. Parsoid emits
 * well-formed XHTML, so we find each table's matching close by counting nested
 * `<table>` depth (infoboxes routinely nest tables for sub-groups). The infobox's
 * own light inline backgrounds are neutralized in CSS (`.quick-facts`), not here.
 */
function wrapInfoboxes(html: string): string {
	const OPEN = /<table\b[^>]*\bclass="[^"]*\binfobox\b[^"]*"[^>]*>/gi;
	const out: string[] = [];
	let cursor = 0;

	for (let m = OPEN.exec(html); m; m = OPEN.exec(html)) {
		const start = m.index;
		const end = matchingTableEnd(html, start);
		if (end === -1) continue; // malformed — leave untouched

		const { lead, table } = hoistInfoboxImage(html.slice(start, end));
		out.push(html.slice(cursor, start));
		// The defining picture leads the read instead of hiding inside the disclosure.
		if (lead) out.push(lead);
		out.push('<details class="quick-facts"><summary>Quick facts</summary>', table, '</details>');
		cursor = end;
		OPEN.lastIndex = end;
	}

	out.push(html.slice(cursor));
	return out.join('');
}

/**
 * Lift an infobox's lead image (and its caption) out of the fact table into a
 * standalone `<figure>` rendered above the collapsed disclosure, so the article's
 * defining picture leads the read instead of hiding inside "Quick facts". The
 * existing `figure` rules (app.css + ReaderCSS) center it on both platforms — no
 * extra CSS needed — and the row is dropped from the table so it isn't duplicated.
 *
 * Anchors on Parsoid's `mw-default-size` thumbnail wrapper rather than a class
 * like `.infobox-image`: standard infoboxes (people, places, products) and
 * taxoboxes (`infobox biota`, which use a plain centered cell) both wrap their
 * lead photo in it, while inline icons/flags do not — so this catches the
 * designated lead across infobox shapes without grabbing decoration. Only a
 * single-image row is hoisted; multi-image cells (a country's flag + coat of
 * arms) and image-less infoboxes are left in place, keeping the transform
 * lossless. Returns the figure markup (empty if nothing hoisted) and the table.
 */
function hoistInfoboxImage(table: string): { lead: string; table: string } {
	const anchor = /class="mw-default-size"/i.exec(table);
	if (!anchor) return { lead: '', table };

	// The lead photo always precedes any nested sub-table, so the nearest <tr>
	// around the anchor bounds a flat image row (no nested </tr> to confuse us).
	const trStart = table.lastIndexOf('<tr', anchor.index);
	const trClose = table.indexOf('</tr>', anchor.index);
	if (trStart === -1 || trClose === -1) return { lead: '', table };
	const rowEnd = trClose + '</tr>'.length;
	const row = table.slice(trStart, rowEnd);

	const imgs = row.match(/<img\b[^>]*>/gi) ?? [];
	if (imgs.length !== 1) return { lead: '', table }; // multi-image cell — leave it in the drawer

	const caption = /<div\b[^>]*\binfobox-caption\b[^>]*>([\s\S]*?)<\/div>/i.exec(row)?.[1];
	const figcaption = caption ? `<figcaption>${caption}</figcaption>` : '';
	const lead = `<figure class="infobox-lead">${imgs[0]}${figcaption}</figure>`;

	return { lead, table: table.slice(0, trStart) + table.slice(rowEnd) };
}

/** Index just past the `</table>` that closes the `<table>` opening at `start`. -1 if unbalanced. */
function matchingTableEnd(html: string, start: number): number {
	const TAG = /<(\/?)table\b/gi;
	TAG.lastIndex = start;
	let depth = 0;
	for (let t = TAG.exec(html); t; t = TAG.exec(html)) {
		depth += t[1] ? -1 : 1;
		if (depth === 0) {
			const close = html.indexOf('>', t.index);
			return close === -1 ? -1 : close + 1;
		}
	}
	return -1;
}

/** Fetch a full article as sanitized, inline-ready HTML. Null if the page is gone. */
export async function fetchArticleHtml(title: string): Promise<string | null> {
	const raw = await restGetText(`page/html/${restTitlePath(title)}`);
	if (!raw) return null;
	return sanitizeArticleHtml(raw);
}
