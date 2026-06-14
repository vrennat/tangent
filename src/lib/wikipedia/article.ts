import { restGetText, restTitlePath } from './client';
import { reflowGraphicalTimelines } from './timeline';

const WIKI = 'https://en.wikipedia.org';

/**
 * Turn Wikipedia's Parsoid HTML into something compact to drop inline with {@html}:
 * structural transforms (heading demotion, infobox/quick-facts wrapping, table tagging,
 * reference pruning) plus a regex pass that sheds bulky Parsoid metadata and makes a
 * first cut at executable surfaces.
 *
 * NOT the security boundary on its own. The regex executable-surface strip here is a
 * cheap first approximation; the authoritative, parser-based scrub is scrubExecutableHtml,
 * applied in fetchArticleHtml. Anything serving this HTML to a client MUST go through
 * fetchArticleHtml (or run scrubExecutableHtml itself) — do not feed the raw output of
 * this function to {@html}. Exported only so the structural transforms are unit-testable.
 *
 * Presentation cruft (edit links, navboxes, maintenance boxes) is left in place and hidden
 * via CSS (`.wiki-content`) rather than fragile server-side surgery.
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

	// Strip the citation apparatus and drop any section it leaves hollow (see below).
	// Done before infobox wrapping so that pass scans a far smaller document — the
	// reference list alone can be several hundred KB.
	html = pruneReferenceSections(html);

	// Tag/wrap the table-shaped reflows whose mobile layout needs a signal CSS can't derive on
	// its own — which cell is the sticky label, where the scrollable chart is, whether a grid is
	// all-text (the rest — clade, ahnentafel, locmap, … — are pure CSS in app.css/ReaderCSS.swift).
	// All target stable class names / inline styles that survive the stripping above; the actual
	// styling lives in the stylesheets. Order matters: climate tags weather boxes first so the
	// wide-table pass skips them.
	html = reflowClimateTables(html);
	html = reflowChartTrees(html);
	html = reflowWideTables(html);

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
	return matchingTagEnd(html, start, 'table');
}

/**
 * Index just past the close tag balancing the `<tag>` whose open tag starts at `start`.
 * Counts nested same-name tags by depth (Parsoid emits well-formed XHTML). -1 if unbalanced.
 */
function matchingTagEnd(html: string, start: number, tag: string): number {
	const TAG = new RegExp(`<(/?)${tag}\\b`, 'gi');
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

/** Remove every `<tag …>…</tag>` whose open tag matches `openRe`, balancing nesting. */
function removeBlocks(html: string, openRe: RegExp, tag: string): string {
	const out: string[] = [];
	let cursor = 0;
	for (let m = openRe.exec(html); m; m = openRe.exec(html)) {
		const start = m.index;
		if (start < cursor) continue; // already inside a removed block
		const end = matchingTagEnd(html, start, tag);
		if (end === -1) continue; // malformed — leave untouched
		out.push(html.slice(cursor, start));
		cursor = end;
		openRe.lastIndex = end;
	}
	out.push(html.slice(cursor));
	return out.join('');
}

/**
 * Weather/climate boxes ({{Weather box}}) — a wide `<table class="wikitable">` whose first row
 * is a `<th colspan>Climate data for …</th>` title over a month×metric grid of cells carrying an
 * inline temperature-colour heatmap. The generic table rule already scrolls it, but the metric
 * labels scroll out of view and the columns squeeze. We tag the box `wh-climate` so CSS can pin
 * the label column (`position:sticky`), force natural column width, and keep the heatmap — the
 * at-a-glance read survives intact. Detection scans only each table's own leading content (up to
 * its first nested table) for a "Climate/Weather/Sunshine/Rainfall data for" title, so an outer
 * layout table that merely contains a weather box isn't tagged (we descend into it instead).
 */
function reflowClimateTables(html: string): string {
	const OPEN = /<table\b[^>]*\bclass="[^"]*\bwikitable\b[^"]*"[^>]*>/gi;
	const TITLE = /\b(?:Climate|Weather|Sunshine|Rainfall) data for\b/i;
	const out: string[] = [];
	let cursor = 0;
	for (let m = OPEN.exec(html); m; m = OPEN.exec(html)) {
		const start = m.index;
		if (start < cursor) continue; // inside an already-tagged table
		const openEnd = start + m[0].length;
		const end = matchingTableEnd(html, start);
		if (end === -1) continue;
		const body = html.slice(openEnd, end);
		const firstNested = body.indexOf('<table');
		const head = firstNested === -1 ? body : body.slice(0, firstNested);
		if (TITLE.test(head)) {
			out.push(html.slice(cursor, start), m[0].replace(/\bclass="/i, 'class="wh-climate '), body);
			cursor = end;
			OPEN.lastIndex = end;
		} else {
			OPEN.lastIndex = openEnd; // descend: the weather box may be nested in this table
		}
	}
	out.push(html.slice(cursor));
	return out.join('');
}

/**
 * Family/pedigree tree charts ({{Chart}} / {{Tree chart}}) — a classless
 * `<table style="…border-collapse: separate…margin: 0 auto…">` laying out person boxes (inline
 * `border:1px solid`) on a dense pixel grid joined by connector segments drawn as inline borders
 * on spacer cells. The relationships ARE that connector geometry — there's no semantic structure
 * to reflow — so we preserve the authored layout and make it mobile-usable: wrap it in a
 * horizontal-scroll div and tag it `wh-chart` so CSS can reset the generic cell mesh (letting
 * only the inline connectors show) and darken light-background boxes. The full {{Chart}}
 * signature — classless + `border-collapse:separate` + `margin: 0 auto` in the table's own style
 * — plus a connector cell in the body keeps data tables out: the periodic table, for one, is a
 * classless separate-collapse table too, but uses `border-spacing:1px` with no centring margin.
 */
function reflowChartTrees(html: string): string {
	const OPEN = /<table\b(?![^>]*\bclass=)[^>]*\bstyle="[^"]*border-collapse:\s*separate[^"]*"[^>]*>/gi;
	const CONNECTOR = /border:\s*0px solid|border-(?:bottom|right|left|top):\s*1px solid/i;
	const out: string[] = [];
	let cursor = 0;
	for (let m = OPEN.exec(html); m; m = OPEN.exec(html)) {
		const start = m.index;
		if (start < cursor) continue;
		const openEnd = start + m[0].length;
		const end = matchingTableEnd(html, start);
		if (end === -1) continue;
		const body = html.slice(openEnd, end);
		if (/margin:\s*0 auto/.test(m[0]) && CONNECTOR.test(body)) {
			out.push(
				html.slice(cursor, start),
				'<div class="wh-chart-scroll">',
				m[0].replace('<table', '<table class="wh-chart"'),
				body,
				'</div>'
			);
			cursor = end;
			OPEN.lastIndex = end;
		} else {
			OPEN.lastIndex = openEnd; // descend into nested separate-collapse tables
		}
	}
	out.push(html.slice(cursor));
	return out.join('');
}

/**
 * Wide all-text data tables (election results, demographics, sortable rankings, …) — many short
 * columns of wrappable text. The generic `table{display:block;overflow-x:auto}` rule only scrolls a
 * table whose min-content exceeds the column; an all-text grid's min-content collapses to its
 * longest word, so instead of scrolling it squeezes every column to one-word-per-line (an 18-column
 * results table renders ~7000px tall). We tag such tables `wh-wide` so CSS can set the cells
 * `white-space:nowrap`, restoring each column's natural width and engaging the existing horizontal
 * scroll — the desktop wide-table read, on mobile.
 *
 * The hazard is the opposite shape: a "document" table with a long prose column (TV episode
 * summaries, Nobel rationales, a monarch's claim to the throne) — nowrap there explodes one cell
 * into a multi-thousand-pixel line. So a table is left alone (kept wrapping) when it carries prose,
 * detected structurally by `isWideGridTable`. A lone full-width footnote/caption banner doesn't
 * disqualify an otherwise griddy table; CSS lets that one banner wrap (`td[colspan]`).
 */
function reflowWideTables(html: string): string {
	const OPEN = /<table\b[^>]*\bclass="[^"]*\bwikitable\b[^"]*"[^>]*>/gi;
	const out: string[] = [];
	let cursor = 0;
	for (let m = OPEN.exec(html); m; m = OPEN.exec(html)) {
		const start = m.index;
		if (start < cursor) continue; // inside an already-emitted table
		const openEnd = start + m[0].length;
		// Weather boxes (already wh-climate) own their nowrap+sticky; chart trees aren't .wikitable.
		if (/\bwh-(?:climate|wide|chart)\b/.test(m[0])) { OPEN.lastIndex = openEnd; continue; }
		const end = matchingTableEnd(html, start);
		if (end === -1) continue;
		const body = html.slice(openEnd, end);
		if (isWideGridTable(body)) {
			out.push(html.slice(cursor, start), m[0].replace(/\bclass="/i, 'class="wh-wide '), body);
			cursor = end;
			OPEN.lastIndex = end;
		} else {
			OPEN.lastIndex = openEnd; // descend: a wide grid may be nested in this layout table
		}
	}
	out.push(html.slice(cursor));
	return out.join('');
}

/**
 * True when a table body is a wide (≥6 column) grid of short cells with no prose column — the
 * shape that squeezes (see reflowWideTables). Counts cells on the table's own rows only (nested
 * tables stripped). Width is the median column count over multi-cell rows, so a colspan title or
 * section-divider banner doesn't inflate it. Long (≥80-char) cells flag prose: one in an ordinary
 * multi-cell row is prose-in-data (a description column), and two-or-more in lone full-width rows
 * are a document layout (episode/rationale rows) — either disqualifies. A single lone full-width
 * long cell is just a footnote/caption and is tolerated. Validated across ~190 wide tables: tags
 * results/ranking/demographics grids, skips every prose/document table.
 */
function isWideGridTable(body: string): boolean {
	let flat = body;
	for (let i = 0; i < 6; i++) {
		const next = flat.replace(/<table\b[^>]*>(?:(?!<table\b)[\s\S])*?<\/table>/gi, '');
		if (next === flat) break;
		flat = next;
	}
	const rows = flat.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
	const cols: number[] = [];
	let normalLong = 0;
	let loneLong = 0;
	for (const row of rows) {
		const cells = row.match(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi) ?? [];
		let span = 0;
		for (const cell of cells) {
			span += parseInt(/\bcolspan="?(\d+)/i.exec(cell)?.[1] ?? '1', 10) || 1;
			const text = cell.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
			if (text.length >= 80) cells.length >= 2 ? normalLong++ : loneLong++;
		}
		if (cells.length >= 2) cols.push(span);
	}
	if (normalLong >= 1 || loneLong >= 2) return false; // prose / document table — keep it wrapping
	if (cols.length === 0) return false;
	cols.sort((a, b) => a - b);
	return cols[Math.floor(cols.length / 2)] >= 6;
}

/**
 * The reader deliberately drops Wikipedia's footnote apparatus — the inline `[1]`
 * markers (hidden in CSS) and the citation list — as noise that linearizes into a
 * wall of plumbing in our single column. But the list lived under its own section
 * heading ("References", "Notes", "Footnotes"), so hiding only the list left the
 * heading dangling over an empty body. Here we (1) delete the citation apparatus
 * outright — which also sheds the bulkiest part of the payload, the list itself —
 * and (2) remove any section that is now hollow.
 *
 * Sections that pair a citation list with real content survive: a "References"
 * section whose body also holds a `{{refbegin}}`/`{{div-col}}` bibliography, or a
 * nested "Works cited" subsection, keeps that content (now under a non-empty
 * heading). Plain content sections — "See also", "External links", "Further
 * reading" — carry no apparatus and are untouched.
 */
function pruneReferenceSections(html: string): string {
	// (1) Delete the apparatus wherever it appears. Wrap first (it contains the <ol>),
	// then any standalone reflist/citation list left by other templates.
	html = removeBlocks(html, /<div\b[^>]*\bclass="[^"]*\bmw-references-wrap\b[^"]*"[^>]*>/gi, 'div');
	html = removeBlocks(html, /<div\b[^>]*\bclass="[^"]*\breflist\b[^"]*"[^>]*>/gi, 'div');
	html = removeBlocks(html, /<ol\b[^>]*\bclass="[^"]*\breferences\b[^"]*"[^>]*>/gi, 'ol');

	// (2) Drop sections the apparatus removal hollowed out. Leaves first (fixpoint), so a
	// parent that empties only once its empty children are gone is caught on a later pass.
	for (;;) {
		const next = removeEmptyLeafSections(html);
		if (next === html) break;
		html = next;
	}
	return html;
}

/** A section's body counts as empty once headings and empty wrappers are shed and no
 *  text or content-bearing element remains (so a hidden citation list reads as empty,
 *  but a bibliography list or stray prose does not). */
function isEmptySectionBody(inner: string): boolean {
	let body = inner.replace(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi, '');
	for (let prev = ''; prev !== body; ) {
		prev = body;
		body = body.replace(/<(div|span|p)\b[^>]*>\s*<\/\1>/gi, '');
	}
	if (
		/<(img|figure|table|ul|ol|dl|li|blockquote|a|cite|b|i|em|strong|sub|sup|hr|dt|dd|tr|td|th|math|audio|video|svg|details|pre|code|caption)\b/i.test(
			body
		)
	)
		return false;
	return !/\S/.test(body.replace(/<[^>]+>/g, ''));
}

/** One pass: remove every leaf `<section>` (no nested section) whose body is empty. */
function removeEmptyLeafSections(html: string): string {
	const OPEN = /<section\b[^>]*>/gi;
	const out: string[] = [];
	let cursor = 0;
	for (let m = OPEN.exec(html); m; m = OPEN.exec(html)) {
		const start = m.index;
		if (start < cursor) continue;
		const end = matchingTagEnd(html, start, 'section');
		if (end === -1) continue;
		const inner = html.slice(start + m[0].length, end - '</section>'.length);
		if (/<section\b/i.test(inner)) {
			// Not a leaf — descend so nested empty sections are still reached this pass.
			OPEN.lastIndex = start + m[0].length;
			continue;
		}
		if (isEmptySectionBody(inner)) {
			out.push(html.slice(cursor, start));
			cursor = end;
		}
		OPEN.lastIndex = end;
	}
	out.push(html.slice(cursor));
	return out.join('');
}

// A handful of named character references an attacker could use to spell a scheme or its
// colon (`javascript&colon;…`). Numeric refs cover the rest and are decoded generically.
const NAMED_REFS: Record<string, string> = {
	colon: ':',
	tab: '\t',
	newline: '\n',
	sol: '/',
	lpar: '(',
	rpar: ')',
	// Refs that decode to a character isSafeUrl strips — so `java&shy;script:` reveals its
	// scheme after decode+strip instead of hiding behind the entity. Keyed lowercase.
	nonbreakingspace: '\u00A0',
	shy: '\u00AD',
	zerowidthspace: '\u200B'
};

/**
 * Decode HTML character references the way a browser would when parsing an attribute —
 * ONE level only (browsers don't re-decode, so double-encoded text never forms a live
 * scheme). Lets `isSafeUrl` see `&#106;avascript:` / `javascript&#58;…` as the
 * `javascript:` the browser will; HTMLRewriter hands us the raw, still-encoded value.
 */
function decodeRefs(s: string): string {
	const cp = (n: number) => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '');
	return s
		.replace(/&#x([0-9a-f]+);?/gi, (_m, h: string) => cp(parseInt(h, 16)))
		.replace(/&#(\d+);?/g, (_m, d: string) => cp(parseInt(d, 10)))
		.replace(/&([a-z]+);/gi, (m, name: string) => NAMED_REFS[name.toLowerCase()] ?? m);
}

/**
 * Whether a URL is safe to keep in an href/src. Only http(s)/mailto/tel and scheme-less
 * (relative or anchor) URLs pass; javascript:, data:, vbscript: and any other scheme are
 * rejected. Character references are decoded (decodeRefs) and control characters +
 * surrounding whitespace stripped first, so obfuscations like an entity-encoded
 * `&#106;avascript:`, an embedded tab, or a leading space can't hide the scheme.
 * Exported for unit testing — the scrub that calls it needs the Worker runtime.
 */
const SAFE_URL_SCHEME = /^(?:https?|mailto|tel):/i;
export function isSafeUrl(value: string): boolean {
	const v = decodeRefs(value).replace(/[\u0000-\u0020\u007F-\u00A0\u00AD\u2000-\u200F\u2028-\u202F\u205F-\u2064\u2066-\u206F\u3000\uFEFF]/g, '');
	const scheme = /^[a-z][a-z0-9+.-]*:/i.exec(v);
	return !scheme || SAFE_URL_SCHEME.test(scheme[0]);
}

/**
 * A srcset is a comma-separated list of `url [descriptor]` candidates. It only ever loads
 * images (a javascript:/data:text/html candidate can't execute via srcset), but we still
 * gate it so the attribute carries no non-safe scheme. Splitting on comma can break a
 * data: candidate apart, but that only makes the leading fragment fail isSafeUrl — which
 * is the outcome we want (reject). Returns false if any candidate's URL is non-safe.
 */
export function isSafeSrcset(value: string): boolean {
	return value.split(',').every((part) => {
		const url = part.trim().split(/\s+/)[0];
		return !url || isSafeUrl(url);
	});
}

// Minimal structural view of the Worker-runtime HTMLRewriter, typed locally so we can
// reach the runtime global without a `/// <reference types="@cloudflare/workers-types" />`
// (which would shadow the DOM `Response` in client code — see app.d.ts).
interface RewriterElement {
	readonly attributes: IterableIterator<string[]>;
	remove(): void;
	removeAttribute(name: string): void;
	setAttribute(name: string, value: string): void;
}
interface Rewriter {
	on(selector: string, handlers: { element(el: RewriterElement): void }): Rewriter;
	transform(res: Response): { text(): Promise<string> };
}
const RewriterCtor = (globalThis as { HTMLRewriter?: new () => Rewriter }).HTMLRewriter;

const EVENT_HANDLER_ATTR = /^on[a-z]/i;
const DROP_ATTRS = new Set(['srcdoc', 'formaction', 'ping']);
const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'action', 'data']);
const DROP_ELEMENTS = 'script, style, link, base, iframe, object, embed, meta';

/**
 * Authoritative, parser-based scrub of executable surfaces — the security layer the
 * regex pass in sanitizeArticleHtml only approximates (regex can't see unclosed tags,
 * entity-encoded schemes, or odd attribute quoting). Runs in the Worker runtime so the
 * HTML reaching the client's `{@html}` is parser-clean: drop script/style/external-
 * resource elements, strip every inline event handler, and neutralize any non-safe URL
 * (javascript:, data:, …) on link/src attributes. Inline `style`/`class`/`data-*` are
 * deliberately kept — the reader's graphics (locmap pins, heatmaps, percentage bars) are
 * built from them, and CSS can't execute script. In Node (vite dev, vitest) HTMLRewriter
 * is absent, so this no-ops and sanitizeArticleHtml's regex pass stands in — dev is the
 * developer's own machine reading already-sanitized Parsoid, not a user attack surface.
 */
async function scrubExecutableHtml(html: string): Promise<string> {
	if (!RewriterCtor) return html;
	const rewriter = new RewriterCtor()
		.on(DROP_ELEMENTS, { element: (el) => el.remove() })
		.on('*', {
			element(el) {
				const remove: string[] = [];
				const neutralize: string[] = [];
				for (const [name, value] of el.attributes) {
					const lower = name.toLowerCase();
					if (EVENT_HANDLER_ATTR.test(lower) || DROP_ATTRS.has(lower)) remove.push(name);
					else if (lower === 'srcset' && !isSafeSrcset(value)) remove.push(name);
					else if (URL_ATTRS.has(lower) && !isSafeUrl(value)) neutralize.push(name);
				}
				for (const name of remove) el.removeAttribute(name);
				for (const name of neutralize) el.setAttribute(name, '#');
			}
		});
	return rewriter.transform(new Response(html)).text();
}

/** Fetch a full article as sanitized, inline-ready HTML. Null if the page is gone. */
export async function fetchArticleHtml(title: string): Promise<string | null> {
	const raw = await restGetText(`page/html/${restTitlePath(title)}`);
	if (!raw) return null;
	// Structural transforms first (sync, regex), then the parser-based security scrub so
	// the HTML that reaches {@html} in the reader is parser-clean in production.
	return scrubExecutableHtml(sanitizeArticleHtml(raw));
}
