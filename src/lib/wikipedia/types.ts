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
	/**
	 * Interest-vector tokens for this article (from `title + description`), computed
	 * server-side with the single-source tokenizer. Clients NEVER tokenize — they do
	 * pure numeric vector math keyed on these tokens — so the scoring brain can't drift
	 * across a web (TS) and native (Swift) client. See `$lib/feed/tokens`.
	 */
	tokens: string[];
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
	/**
	 * Visible (non-hidden) category titles, when available. The Action API's
	 * category budget truncates on link-heavy pages, so this is best-effort — the
	 * feed engine also leans on title/description for topic signals like politics.
	 */
	categories: string[];
	/**
	 * Position of this link in the source article's reading order (0 = first, most
	 * prominent — i.e. lead-section links). Lower is more "rabbit-hole-worthy"; the
	 * engine boosts earlier links so the feed follows what the article is about.
	 */
	position: number;
}

export interface SearchResult {
	title: string;
	description: string | null;
	thumbnail: Thumbnail | null;
}
