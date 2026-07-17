import type { Candidate, SearchResult, Thumbnail } from './types';
import { actionGet } from './client';
import { articleTitleFromHref } from './links';

/** A page object as returned by the Action API with formatversion=2. */
interface ActionPage {
	pageid?: number;
	ns: number;
	title: string;
	index?: number;
	missing?: boolean;
	description?: string;
	thumbnail?: Thumbnail;
	pageprops?: { disambiguation?: string };
	categories?: { ns: number; title: string; hidden?: boolean }[];
}

interface QueryResponse {
	query?: {
		pages?: ActionPage[];
		search?: { title: string }[];
		normalized?: { from: string; to: string }[];
		redirects?: { from: string; to: string }[];
	};
	continue?: Record<string, string>;
}

interface ParseResponse {
	parse?: { text?: string | { '*'?: string } };
}

/** How many usable lead links we want before falling back to the hybrid set. */
const MIN_EXPLORE = 5;
/** Enough candidates for top-K scoring plus a real surprise middle. */
const TARGET_EXPLORE = 14;
/** titles= batch limit for non-bot clients; also our candidate cap. */
const MAX_CANDIDATES = 50;

function toCandidate(p: ActionPage, relation: 'link' | 'related', position: number): Candidate {
	return {
		title: p.title,
		description: p.description ?? null,
		thumbnail: p.thumbnail ?? null,
		isDisambiguation: p.pageprops?.disambiguation !== undefined,
		relation,
		categories: (p.categories ?? []).map((c) => c.title),
		position
	};
}

/** Keep substantive pages (description or image), thumbnailed first, capped.
 *
 * Generator results arrive in ARBITRARY order; `index` carries the generator's
 * rank (for morelike: search, similarity; for links, alphabetical). Rank first so
 * each candidate's `position` — which the engine's position boost reads as
 * prominence — reflects that rank, not the response's hash order.
 * Exported for tests. */
export function refine(pages: ActionPage[], relation: 'link' | 'related'): Candidate[] {
	return pages
		.filter((p) => !p.missing && p.ns === 0 && (p.description || p.thumbnail))
		.sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
		.map((p, i) => toCandidate(p, relation, i))
		.sort((a, b) => Number(Boolean(b.thumbnail)) - Number(Boolean(a.thumbnail)))
		.slice(0, MAX_CANDIDATES);
}

/** Batch-fetch metadata for a list of titles (used to enrich + score candidates).
 *  Categories are deliberately NOT here: prop=categories pays a fixed membership
 *  budget per request, so on generator queries (up to 500 pages) it spreads a few
 *  categories across pages we mostly discard. Complete categories are fetched in a
 *  second pass over only the kept candidates — see withCategories(). */
const METADATA_PROPS = {
	prop: 'pageimages|description|pageprops',
	piprop: 'thumbnail',
	pithumbsize: '480',
	ppprop: 'disambiguation'
} as const;

/** Titles per category request. Raw memberships (hidden included) run ~45-50 per
 *  article, so 10 titles sits just under the 500-membership request budget and the
 *  clcontinue backstop rarely fires. */
const CATEGORY_CHUNK = 10;

/**
 * Complete non-hidden categories for a capped title list.
 *
 * Two Action API traps shape this function, both verified empirically (2026-07-16):
 *  - prop=categories pays a fixed ~500-membership budget per REQUEST, not per page,
 *    so a large batch exhausts it mid-list and later pages come back empty (the sim
 *    measured 36.5% of cached candidates category-less, climbing with index).
 *  - With clshow=!hidden set, an exhausted scan reports batchcomplete with NO
 *    continuation at all — silent, unresumable truncation. So hidden categories
 *    must be filtered client-side via clprop=hidden, which keeps continuation honest.
 */
export async function fetchCategoriesFor(titles: string[]): Promise<Map<string, string[]>> {
	const out = new Map<string, string[]>();
	const capped = titles.slice(0, MAX_CANDIDATES);
	if (capped.length === 0) return out;

	const chunks: string[][] = [];
	for (let i = 0; i < capped.length; i += CATEGORY_CHUNK)
		chunks.push(capped.slice(i, i + CATEGORY_CHUNK));

	await Promise.all(
		chunks.map(async (chunk) => {
			const base = {
				action: 'query',
				titles: chunk.join('|'),
				prop: 'categories',
				clprop: 'hidden',
				cllimit: 'max'
			};
			let cont: Record<string, string> = {};
			// One chunk usually completes in a single request; the bound only stops a
			// pathological continuation loop.
			for (let i = 0; i < 4; i++) {
				const data = await actionGet<QueryResponse>({ ...base, ...cont });
				for (const p of data.query?.pages ?? []) {
					const visible = (p.categories ?? []).filter((c) => !c.hidden).map((c) => c.title);
					if (visible.length === 0) continue;
					out.set(p.title, [...(out.get(p.title) ?? []), ...visible]);
				}
				if (!data.continue?.clcontinue) break;
				cont = data.continue;
			}
		})
	);
	return out;
}

/** Fill complete categories onto candidates. Tolerates fetch failure — a candidate
 *  without categories is degraded scoring, not a missing card. */
async function withCategories(candidates: Candidate[]): Promise<Candidate[]> {
	if (candidates.length === 0) return candidates;
	try {
		const cats = await fetchCategoriesFor(candidates.map((c) => c.title));
		return candidates.map((c) => ({ ...c, categories: cats.get(c.title) ?? [] }));
	} catch {
		return candidates;
	}
}

/**
 * Lead-section links of an article, in reading order. This is the heart of the
 * "explore Wikipedia" feel: the lead's links are the prominent, on-topic
 * connections a curious reader would actually click — unlike `generator=links`,
 * which returns links alphabetically (so a cap only ever sees A/B/C titles).
 */
async function fetchLeadLinkTitles(title: string): Promise<string[]> {
	const data = await actionGet<ParseResponse>({
		action: 'parse',
		page: title,
		prop: 'text',
		section: '0',
		disabletoc: '1',
		redirects: '1'
	});

	const text = data.parse?.text;
	const html = typeof text === 'string' ? text : (text?.['*'] ?? '');
	if (!html) return [];

	// The section-0 parse appends the article's citation list (<ol class="references">).
	// Its <cite> links — identifier stubs (Doi/Hdl/ISSN), journals, authors, publishers —
	// are reference plumbing, not rabbit-hole connections, so drop the apparatus (and the
	// inline <sup> footnote markers) before collecting links.
	const body = html
		.replace(/<ol\b[^>]*class="[^"]*\breferences\b[^"]*"[\s\S]*?<\/ol>/gi, '')
		.replace(/<sup\b[^>]*class="[^"]*\breference\b[^"]*"[\s\S]*?<\/sup>/gi, '');

	const seen = new Set<string>();
	const ordered: string[] = [];
	const collect = (fragment: string) => {
		const anchor = /<a\b[^>]*?\shref="([^"]+)"/g;
		let match: RegExpExecArray | null;
		while ((match = anchor.exec(fragment)) !== null) {
			const linked = articleTitleFromHref(match[1]);
			if (!linked || linked === title || /\(disambiguation\)$/i.test(linked)) continue;
			if (!seen.has(linked)) {
				seen.add(linked);
				ordered.push(linked);
			}
		}
	};

	// Prose paragraphs first, then everything else (infobox/taxobox, lists). This ranks
	// an article's narrative links above its infobox links — e.g. Octopus leads with
	// Mollusc/Cephalopod/Squid, not the taxobox's geological periods.
	const prose = (body.match(/<p\b[\s\S]*?<\/p>/gi) ?? []).join('\n');
	collect(prose);
	collect(body);
	return ordered;
}

/** Enrich ordered titles with metadata, preserving each title's document-order position.
 *  Exported so other seed sources (e.g. the Main Page feed's thumbnail-less DYK hooks)
 *  can resolve a list of titles to full candidates. */
export async function enrichByTitles(orderedTitles: string[]): Promise<Candidate[]> {
	const slice = orderedTitles.slice(0, MAX_CANDIDATES);
	if (slice.length === 0) return [];

	const data = await actionGet<QueryResponse>({
		action: 'query',
		titles: slice.join('|'),
		redirects: '1',
		...METADATA_PROPS
	});

	// Resolve requested titles through normalization + redirects to their canonical page.
	const remap = new Map<string, string>();
	for (const n of data.query?.normalized ?? []) remap.set(n.from, n.to);
	for (const r of data.query?.redirects ?? []) remap.set(r.from, r.to);
	const resolve = (t: string): string => {
		let cur = t;
		const guard = new Set<string>();
		while (remap.has(cur) && !guard.has(cur)) {
			guard.add(cur);
			cur = remap.get(cur) as string;
		}
		return cur;
	};

	const byTitle = new Map<string, ActionPage>();
	for (const p of data.query?.pages ?? []) byTitle.set(p.title, p);

	const candidates: Candidate[] = [];
	const emitted = new Set<string>();
	slice.forEach((requested, position) => {
		const page = byTitle.get(resolve(requested));
		if (!page || page.missing || page.ns !== 0) return;
		if (!page.description && !page.thumbnail) return; // substantive pages only
		// Distinct lead links can redirect/normalize to the same canonical page; keep the
		// first (most prominent) occurrence so the same article never appears twice.
		if (emitted.has(page.title)) return;
		emitted.add(page.title);
		candidates.push(toCandidate(page, 'link', position));
	});
	return withCategories(candidates);
}

/** Real outbound links from an article (alphabetical) — kept as a fallback source. */
export async function fetchOutboundLinks(title: string): Promise<Candidate[]> {
	const data = await actionGet<QueryResponse>({
		action: 'query',
		generator: 'links',
		titles: title,
		gpllimit: '500',
		gplnamespace: '0',
		redirects: '1',
		...METADATA_PROPS
	});
	return withCategories(refine(data.query?.pages ?? [], 'link'));
}

/** "More like this" via CirrusSearch — our stand-in for the dead REST related endpoint. */
export async function fetchRelated(title: string): Promise<Candidate[]> {
	const data = await actionGet<QueryResponse>({
		action: 'query',
		generator: 'search',
		gsrsearch: `morelike:${title}`,
		gsrnamespace: '0',
		gsrlimit: '20',
		...METADATA_PROPS
	});
	return withCategories(refine(data.query?.pages ?? [], 'related'));
}

/** Hybrid fallback: outbound links topped up with related pages when sparse. */
async function fetchHybrid(title: string): Promise<Candidate[]> {
	const links = await fetchOutboundLinks(title);
	const usable = links.filter((c) => !c.isDisambiguation && c.title !== title);
	if (usable.length >= MIN_EXPLORE) return usable;

	const related = await fetchRelated(title);
	const seen = new Set(usable.map((c) => c.title));
	const merged = [...usable];
	for (const c of related) {
		if (c.title !== title && !seen.has(c.title)) merged.push(c);
	}
	return merged;
}

/**
 * Primary candidate source for the feed: prominent, in-order lead-section links.
 * Tops up thinner lead pools with related pages so scoring has enough lateral,
 * potentially more interesting options; falls back to the hybrid (outbound + related)
 * set for stubs or parse misses, so the rabbit hole never dead-ends.
 */
export async function fetchExploreCandidates(title: string): Promise<Candidate[]> {
	const leadTitles = await fetchLeadLinkTitles(title);
	const lead = (await enrichByTitles(leadTitles)).filter(
		(c) => !c.isDisambiguation && c.title !== title
	);
	if (lead.length >= TARGET_EXPLORE) return lead;

	if (lead.length >= MIN_EXPLORE) {
		let related: Candidate[];
		try {
			related = await fetchRelated(title);
		} catch {
			return lead;
		}
		const have = new Set(lead.map((c) => c.title));
		const extra = related
			.filter((c) => c.title !== title && !have.has(c.title))
			.map((c, i) => ({ ...c, position: lead.length + i }));
		return [...lead, ...extra].slice(0, MAX_CANDIDATES);
	}

	const fallback = await fetchHybrid(title);
	const have = new Set(lead.map((c) => c.title));
	const extra = fallback
		.filter((c) => c.title !== title && !have.has(c.title))
		.map((c, i) => ({ ...c, position: lead.length + i }));
	return [...lead, ...extra];
}

/** Typeahead search for the /start page. */
export async function search(query: string): Promise<SearchResult[]> {
	if (!query.trim()) return [];
	const data = await actionGet<QueryResponse>({
		action: 'query',
		generator: 'search',
		gsrsearch: query,
		gsrnamespace: '0',
		gsrlimit: '8',
		prop: 'pageimages|description',
		piprop: 'thumbnail',
		pithumbsize: '120'
	});
	const pages = data.query?.pages ?? [];
	// generator results aren't ordered; `index` preserves search rank.
	return pages
		.filter((p) => !p.missing && p.ns === 0)
		.sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
		.map((p) => ({
			title: p.title,
			description: p.description ?? null,
			thumbnail: p.thumbnail ?? null
		}));
}
