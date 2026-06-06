import type { Candidate, SearchResult, Thumbnail } from './types';
import { actionGet } from './client';
import { wormholeTitleFromHref } from './links';

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
	categories?: { ns: number; title: string }[];
}

interface QueryResponse {
	query?: {
		pages?: ActionPage[];
		search?: { title: string }[];
		normalized?: { from: string; to: string }[];
		redirects?: { from: string; to: string }[];
	};
}

interface ParseResponse {
	parse?: { text?: string | { '*'?: string } };
}

/** How many usable lead links we want before falling back to the hybrid set. */
const MIN_EXPLORE = 5;
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

/** Keep substantive pages (description or image), thumbnailed first, capped. */
function refine(pages: ActionPage[], relation: 'link' | 'related'): Candidate[] {
	return pages
		.filter((p) => !p.missing && p.ns === 0 && (p.description || p.thumbnail))
		.map((p, i) => toCandidate(p, relation, i))
		.sort((a, b) => Number(Boolean(b.thumbnail)) - Number(Boolean(a.thumbnail)))
		.slice(0, MAX_CANDIDATES);
}

/** Batch-fetch metadata for a list of titles (used to enrich + score candidates). */
const METADATA_PROPS = {
	prop: 'pageimages|description|pageprops|categories',
	piprop: 'thumbnail',
	pithumbsize: '480',
	ppprop: 'disambiguation',
	clshow: '!hidden',
	cllimit: 'max'
} as const;

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

	const seen = new Set<string>();
	const ordered: string[] = [];
	const collect = (fragment: string) => {
		const anchor = /<a\b[^>]*?\shref="([^"]+)"/g;
		let match: RegExpExecArray | null;
		while ((match = anchor.exec(fragment)) !== null) {
			const linked = wormholeTitleFromHref(match[1]);
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
	const prose = (html.match(/<p\b[\s\S]*?<\/p>/gi) ?? []).join('\n');
	collect(prose);
	collect(html);
	return ordered;
}

/** Enrich ordered titles with metadata, preserving each title's document-order position. */
async function enrichByTitles(orderedTitles: string[]): Promise<Candidate[]> {
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
	slice.forEach((requested, position) => {
		const page = byTitle.get(resolve(requested));
		if (!page || page.missing || page.ns !== 0) return;
		if (!page.description && !page.thumbnail) return; // substantive pages only
		candidates.push(toCandidate(page, 'link', position));
	});
	return candidates;
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
	return refine(data.query?.pages ?? [], 'link');
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
	return refine(data.query?.pages ?? [], 'related');
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
 * Falls back to the hybrid (outbound + related) set for stubs or parse misses, so
 * the rabbit hole never dead-ends.
 */
export async function fetchExploreCandidates(title: string): Promise<Candidate[]> {
	const leadTitles = await fetchLeadLinkTitles(title);
	const lead = (await enrichByTitles(leadTitles)).filter(
		(c) => !c.isDisambiguation && c.title !== title
	);
	if (lead.length >= MIN_EXPLORE) return lead;

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
