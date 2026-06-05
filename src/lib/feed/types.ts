import type { Article, Candidate } from '$lib/wikipedia/types';

/** How a card arrived in the feed — drives the breadcrumb phrasing. */
export type Relation = 'seed' | 'link' | 'related' | 'surprise';

export interface Connection {
	/** The title of the article we came from (empty for the seed). */
	fromTitle: string;
	relation: Relation;
}

/** One entry in the feed. `id` is unique per appearance so keys stay stable. */
export interface FeedCard {
	id: string;
	article: Article;
	connection: Connection;
}

/**
 * Everything the pure engine needs to pick the next step. No I/O, no globals —
 * the caller assembles this from the user's engagement profile and feed history,
 * which keeps scoring/selection trivially unit-testable.
 */
export interface EngineContext {
	/** Interest vector: token -> weight, built from articles the user liked/dwelled on. */
	tokenWeights: Record<string, number>;
	/** Tokens from the last few shown articles, to penalize monotony (variety). */
	recentTokens: Set<string>;
	/** Titles already shown, to avoid loops. */
	seenTitles: Set<string>;
	/** Injectable RNG (default Math.random) so tests are deterministic. */
	rng: () => number;
}

export interface Selection {
	candidate: Candidate;
	/** True when the surprise epsilon fired and relevance was bypassed. */
	surprised: boolean;
}
