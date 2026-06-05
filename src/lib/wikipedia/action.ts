import type { Candidate, SearchResult, Thumbnail } from './types';
import { actionGet } from './client';

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
}

interface QueryResponse {
	query?: { pages?: ActionPage[]; search?: { title: string }[] };
}

/** How many usable outbound links we want before we bother with a `morelike` fallback. */
const MIN_OUTBOUND = 6;
/** Cap candidates sent to the client to keep the payload small. */
const MAX_CANDIDATES = 80;

function toCandidate(p: ActionPage, relation: 'link' | 'related'): Candidate {
	return {
		title: p.title,
		description: p.description ?? null,
		thumbnail: p.thumbnail ?? null,
		isDisambiguation: p.pageprops?.disambiguation !== undefined,
		relation
	};
}

/** Keep substantive pages (have a description), thumbnailed first, capped. */
function refine(pages: ActionPage[], relation: 'link' | 'related'): Candidate[] {
	return pages
		.filter((p) => !p.missing && p.ns === 0 && (p.description || p.thumbnail))
		.map((p) => toCandidate(p, relation))
		.sort((a, b) => Number(Boolean(b.thumbnail)) - Number(Boolean(a.thumbnail)))
		.slice(0, MAX_CANDIDATES);
}

/** Real outbound links from an article, enriched with image + description in one call. */
export async function fetchOutboundLinks(title: string): Promise<Candidate[]> {
	const data = await actionGet<QueryResponse>({
		action: 'query',
		generator: 'links',
		titles: title,
		gpllimit: '500',
		gplnamespace: '0',
		prop: 'pageimages|description|pageprops',
		piprop: 'thumbnail',
		pithumbsize: '480',
		ppprop: 'disambiguation',
		redirects: '1'
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
		prop: 'pageimages|description|pageprops',
		piprop: 'thumbnail',
		pithumbsize: '480',
		ppprop: 'disambiguation'
	});
	return refine(data.query?.pages ?? [], 'related');
}

/**
 * Hybrid candidate set for the feed engine: real outbound links, topped up with
 * related pages when an article is too sparse to keep the rabbit hole going.
 */
export async function fetchCandidates(title: string): Promise<Candidate[]> {
	const links = await fetchOutboundLinks(title);
	const usable = links.filter((c) => !c.isDisambiguation && c.title !== title);
	if (usable.length >= MIN_OUTBOUND) return usable;

	const related = await fetchRelated(title);
	const seen = new Set(usable.map((c) => c.title));
	const merged = [...usable];
	for (const c of related) {
		if (c.title !== title && !seen.has(c.title)) merged.push(c);
	}
	return merged;
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
