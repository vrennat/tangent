/**
 * Tunable knobs for the feed algorithm. Everything that shapes the rabbit hole
 * lives here so the behavior is easy to reason about and iterate on.
 *
 * Keep it simple (per design): position-free scoring over a candidate pool,
 * an engagement nudge, a variety penalty, and a surprise epsilon for serendipity.
 */
export const FEED = {
	/** Baseline score every candidate starts with. */
	base: 1,
	/** Weight on relevance (overlap with the user's interest vector). Squashed via tanh. */
	relevanceWeight: 2.5,
	/** Bonus for candidates that have a lead image (richer cards). */
	imageBonus: 0.6,
	/** Per-token penalty for overlapping with recently shown articles (variety). */
	varietyPenalty: -0.45,
	/** Nudge against `related` fallbacks so genuine outbound links win ties. */
	relatedPenalty: -0.25,
	/** Safety net — disambiguation pages should already be filtered out. */
	disambiguationPenalty: -5,
	/** Probability of ignoring relevance and jumping somewhere loosely connected. */
	surpriseEpsilon: 0.18,
	/** Pick the next step by weighted-random among the top-K scorers (not pure argmax). */
	topK: 8,
	/** Softmax temperature for that weighted pick. Higher = more random among the top. */
	temperature: 0.6,
	/** How many recent articles feed the variety penalty. */
	recentWindow: 3,
	/** Weight added to a token each time the user likes an article containing it. */
	likeTokenWeight: 1,
	/** Lighter weight for tokens from articles the user merely dwelled on. */
	dwellTokenWeight: 0.35,
	/** Dwell milliseconds before an article counts as "engaged with". */
	dwellThresholdMs: 4000
} as const;
