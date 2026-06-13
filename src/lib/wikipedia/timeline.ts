/**
 * Reflow Wikipedia's graphical timeline templates ({{Nature timeline}}, {{Life
 * timeline}}, {{Human timeline}}, … — the `Module:Graphical timeline` family) into
 * a mobile-native vertical timeline in the Nightstand style.
 *
 * Those templates render as a fixed-em, absolutely-positioned graphic tagged
 * `nomobile` — Wikipedia hides it on phones because it can't reflow. We instead
 * mine the graphic's own coordinate system: the `#Scale` ticks carry the integer-Gya
 * axis labels, `#Timeline` carries the colored era bands (top/height/colour), and
 * `#Annotations` carries the dated events. From that we emit a single continuous
 * vertical spine — era-coloured segments, events as dots placed at their true (log)
 * positions, life-grade onsets as ringed markers — that reads as a timeline on a
 * narrow column, with all events and links preserved.
 *
 * Detection is structural (`id="Container"` + `id="Annotations"` + `id="Timeline"`),
 * which survives sanitization, so it runs on the raw Parsoid body before attribute
 * stripping. Output uses `./`-relative hrefs so the caller's URL rewrite resolves
 * them. Anything we can't parse is left untouched (and stays hidden by the
 * `.nomobile` rule), so the transform is lossless-or-skip, never destructive.
 */

interface Tick {
	em: number;
	gya: number;
}

interface Era {
	left: number;
	top: number;
	height: number;
	color: string;
	label: string;
	href: string;
}

interface TimelineEvent {
	em: number;
	label: string;
	href: string;
}

/** Replace every graphical-timeline table with a reflowed `.wh-tl` block. */
export function reflowGraphicalTimelines(html: string): string {
	const OPEN = /<table\b[^>]*\bid="Container"[^>]*>/gi;
	const out: string[] = [];
	let cursor = 0;

	for (let m = OPEN.exec(html); m; m = OPEN.exec(html)) {
		const start = m.index;
		const end = matchingTableEnd(html, start);
		if (end === -1) continue;

		const block = html.slice(start, end);
		// Only the Module:Graphical timeline family carries all three layer ids.
		if (!block.includes('id="Annotations"') || !block.includes('id="Timeline"')) continue;

		const reflowed = renderTimeline(block);
		if (!reflowed) continue; // unparseable — leave the original (it stays hidden)

		out.push(html.slice(cursor, start), reflowed);
		cursor = end;
		OPEN.lastIndex = end;
	}

	out.push(html.slice(cursor));
	return out.join('');
}

// Vertical layout (px). The timeline reads top→bottom = present→Big Bang. Positions
// come straight from the source's em coordinates (PX per source em), so the axis stays
// logarithmic — which conveniently spreads the dense recent cluster. Labels can't be
// placed at their exact dot when several events bunch up, so each is nudged down to keep
// a minimum gap and a hairline connector links it back to its true position on the spine.
const PX = 19;
const TOP_PAD = 14;
const BOTTOM_PAD = 30;
const LABEL_GAP = 23; // min vertical px between stacked labels
const SEGNAME_MIN = 54; // only name era segments tall enough to hold vertical text

interface Marker {
	em: number;
	label: string;
	href: string;
	era: boolean; // a life-grade onset (ring) vs. a dated event (dot)
	color?: string;
	dotY: number;
	labelY: number;
	conn: boolean;
}

/** Parse one timeline table; null if it lacks the data to render meaningfully. */
function renderTimeline(block: string): string | null {
	const ticks = parseTicks(block);
	const eras = parseEras(block);
	const events = parseEvents(block);
	if (ticks.length < 2 || eras.length === 0 || events.length === 0) return null;

	const { label: title, href: titleHref } = parseTitle(block);
	const y = (em: number): number => TOP_PAD + em * PX;
	// Backbone eras (full width, stacked) tile the spine; the indented "life" eras run
	// from the present back to their origin, so we surface them as onset markers.
	const backbone = eras.filter((e) => e.left < 0.5);
	const nested = eras.filter((e) => e.left >= 0.5);

	const maxEm = Math.max(
		...events.map((e) => e.em),
		...eras.map((e) => e.top + e.height)
	);
	const height = Math.round(y(maxEm) + BOTTOM_PAD);

	// Merge dated events and life-grade onsets onto one spine, then nudge labels apart.
	const markers: Marker[] = [
		...events.map((e) => ({ em: e.em, label: e.label, href: e.href, era: false })),
		...nested.map((e) => ({
			em: e.top + e.height,
			label: e.label,
			href: e.href,
			era: true,
			color: e.color
		}))
	]
		.sort((a, b) => a.em - b.em)
		.map((m): Marker => ({ ...m, dotY: 0, labelY: 0, conn: false }));
	let last = -Infinity;
	for (const m of markers) {
		m.dotY = y(m.em);
		m.labelY = Math.max(m.dotY, last + LABEL_GAP);
		m.conn = m.labelY - m.dotY > 2;
		last = m.labelY;
	}

	const parts: string[] = ['<div class="wh-tl">'];
	parts.push(
		`<div class="wh-tl-title"><a href="${esc(titleHref)}">${esc(title || 'Timeline')}</a></div>`
	);
	parts.push('<div class="wh-tl-axis"><span>now</span><span>13.8 billion years ago →</span></div>');
	parts.push(`<div class="wh-tl-track" style="height:${height}px">`);

	// Age gridlines + labels (the source's own integer-Gya ticks — accurate).
	for (const t of ticks) {
		parts.push(`<div class="wh-tl-grid" style="top:${Math.round(y(t.em))}px"></div>`);
		parts.push(`<div class="wh-tl-age" style="top:${Math.round(y(t.em))}px">${t.gya}</div>`);
	}
	parts.push(
		`<div class="wh-tl-age wh-tl-age-unit" style="top:${Math.round(y(ticks[ticks.length - 1].em) + 16)}px">Gya</div>`
	);

	// Era-coloured spine segments + vertical era names in their own lane.
	for (const e of backbone) {
		const top = Math.round(y(e.top));
		const h = Math.round(e.height * PX);
		parts.push(
			`<div class="wh-tl-seg" style="top:${top}px;height:${h}px;background:${visColor(e.color)}"></div>`
		);
		if (h > SEGNAME_MIN) {
			parts.push(
				`<div class="wh-tl-segname" style="top:${top}px;height:${h}px">${esc(e.label)}</div>`
			);
		}
	}

	// Markers: a dot (event) or ring (life-grade onset) on the spine + a label.
	for (const m of markers) {
		if (m.conn) {
			parts.push(
				`<div class="wh-tl-conn" style="top:${Math.round(m.dotY)}px;height:${Math.round(m.labelY - m.dotY)}px"></div>`
			);
		}
		const mark = m.era
			? `<span class="wh-tl-ring" style="border-color:${visColor(m.color ?? '#e0a14e')}"></span>`
			: '<span class="wh-tl-dot"></span>';
		parts.push(`<div class="wh-tl-mk" style="top:${Math.round(m.dotY)}px">${mark}</div>`);
		parts.push(
			`<div class="wh-tl-lab${m.era ? ' wh-tl-onset' : ''}" style="top:${Math.round(m.labelY)}px"><a href="${esc(m.href)}">${esc(m.label)}</a></div>`
		);
	}

	parts.push('</div></div>');
	return parts.join('');
}

/**
 * Lift a band colour to read on the dark spine. The source palette is light-theme
 * pastels plus near-black greys (the deep "matter-dominated"/"dark ages" eras), which
 * vanish on Nightstand — so anything below mid-luminance is mixed toward a warm light.
 */
function visColor(hex: string): string {
	const c = hex.replace('#', '');
	let r = parseInt(c.slice(0, 2), 16);
	let g = parseInt(c.slice(2, 4), 16);
	let b = parseInt(c.slice(4, 6), 16);
	const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	if (lum < 0.62) {
		const f = (0.62 - lum) * 1.1;
		r = Math.min(255, Math.round(r + (220 - r) * f));
		g = Math.min(255, Math.round(g + (205 - g) * f));
		b = Math.min(255, Math.round(b + (170 - b) * f));
	}
	return `rgb(${r},${g},${b})`;
}

/** Axis ticks: a `top:Xem` div whose text is an integer Gya followed by an em dash. */
function parseTicks(block: string): Tick[] {
	const scale = slice(block, 'id="Scale"', 'id="Timeline"');
	const ticks: Tick[] = [];
	const RE = /top:\s*([\d.-]+)em[^>]*>([\s\S]*?)<\/div>/gi;
	for (let m = RE.exec(scale); m; m = RE.exec(scale)) {
		const n = /(\d+)\s*—/.exec(text(m[2]));
		if (n) ticks.push({ em: parseFloat(m[1]), gya: parseInt(n[1], 10) });
	}
	// Dedup + sort by em ascending.
	const seen = new Set<number>();
	return ticks
		.filter((t) => (seen.has(t.em) ? false : (seen.add(t.em), true)))
		.sort((a, b) => a.em - b.em);
}

/** Era bands: each `<div … background:#…>` carries left/top/height + a label link. */
function parseEras(block: string): Era[] {
	const tl = slice(block, 'id="Timeline"', 'id="Annotations"');
	const eras: Era[] = [];
	const RE = /<div\b([^>]*background[^>]*)>/gi;
	for (let m = RE.exec(tl); m; m = RE.exec(tl)) {
		const s = m[1];
		const color = /background(?:-color)?:\s*(#[0-9a-f]+)/i.exec(s);
		if (!color) continue;
		const win = tl.slice(m.index + m[0].length, m.index + m[0].length + 900);
		eras.push({
			left: numStyle(s, 'left') ?? 0,
			top: numStyle(s, 'top') ?? 0,
			height: numStyle(s, 'height') ?? 0,
			color: color[1],
			label: anchorText(win),
			href: firstHref(win)
		});
	}
	return eras;
}

/** Events: each annotation is a `<table role="presentation" … top:Xem>` with a label. */
function parseEvents(block: string): TimelineEvent[] {
	const ann = block.slice(block.indexOf('id="Annotations"'));
	const events: TimelineEvent[] = [];
	const RE = /<table role="presentation" style="[^"]*top:\s*([\d.-]+)em[^"]*">([\s\S]*?)<\/table>/gi;
	for (let m = RE.exec(ann); m; m = RE.exec(ann)) {
		const label = text(m[2]).replace(/^[←\s]+/, '');
		if (label) events.push({ em: parseFloat(m[1]), label, href: firstHref(m[2]) });
	}
	return events.sort((a, b) => a.em - b.em);
}

function parseTitle(block: string): { label: string; href: string } {
	const cell = slice(block, 'id="Title"', 'id="Navbox"') || slice(block, 'id="Title"', 'id="Scale"');
	return { label: anchorText(cell), href: firstHref(cell) || '#' };
}

// --- small HTML helpers -----------------------------------------------------

/** Index just past the `</table>` closing the `<table>` opening at `start`. -1 if unbalanced. */
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

/** Substring between the element bearing marker `a` and the one bearing marker `b`. */
function slice(block: string, a: string, b: string): string {
	const i = block.indexOf(a);
	if (i === -1) return '';
	const j = block.indexOf(b, i);
	return block.slice(i, j === -1 ? undefined : j);
}

function numStyle(style: string, key: string): number | null {
	const m = new RegExp(key + ':\\s*([\\d.-]+)em').exec(style);
	return m ? parseFloat(m[1]) : null;
}

function firstHref(seg: string): string {
	const m = /href="([^"]+)"/.exec(seg);
	return m ? m[1] : '#';
}

/** Visible text of the first anchor in `seg` (tags → spaces, entities decoded). */
function anchorText(seg: string): string {
	const m = /<a\b[^>]*>([\s\S]*?)<\/a>/i.exec(seg);
	return text(m ? m[1] : seg);
}

/** Strip tags, decode the handful of entities Parsoid emits, collapse whitespace. */
function text(html: string): string {
	return decode(html.replace(/<[^>]+>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();
}

function decode(s: string): string {
	return s
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;/g, "'")
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(parseInt(n, 10)));
}

function esc(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
