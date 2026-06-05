/** Shared shapes for everything we pull out of Wikipedia. */

export interface Thumbnail {
	source: string;
	width: number;
	height: number;
}

/**
 * A fully-formed article, ready to render as a feed card body.
 * Built from the REST `/page/summary` endpoint.
 */
export interface Article {
	/** Canonical display title, e.g. "Roman Empire". Also used as the lookup key. */
	title: string;
	/** Short Wikidata one-liner, e.g. "27 BC–476 AD state". May be null. */
	description: string | null;
	/** Plain-text intro extract (a few sentences). */
	extract: string;
	thumbnail: Thumbnail | null;
	/** Desktop Wikipedia URL for "Read full article". */
	wikiUrl: string;
	lang: string;
}

/**
 * A possible next step discovered from the current article. Cheap to produce in
 * bulk (one Action API call yields hundreds) and used purely for scoring/preview —
 * the article we actually render is fetched fresh via {@link Article}.
 *
 * `relation` encodes the hybrid strategy: a real outbound `link`, or a `related`
 * page surfaced by `morelike` when an article has no good outbound links.
 */
export interface Candidate {
	title: string;
	description: string | null;
	thumbnail: Thumbnail | null;
	isDisambiguation: boolean;
	relation: 'link' | 'related';
}

export interface SearchResult {
	title: string;
	description: string | null;
	thumbnail: Thumbnail | null;
}
