import { restGetText, restTitlePath } from './client';

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

	return html;
}

/** Fetch a full article as sanitized, inline-ready HTML. Null if the page is gone. */
export async function fetchArticleHtml(title: string): Promise<string | null> {
	const raw = await restGetText(`page/html/${restTitlePath(title)}`);
	if (!raw) return null;
	return sanitizeArticleHtml(raw);
}
