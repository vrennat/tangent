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
	/** Weight on relevance (overlap with the user's interest vector). Squashed via tanh.
	 *  Raised 2.5 -> 4.0 to lean the feed harder toward what the user actually reads:
	 *  at 2.5 the learned-interest term was dominated by position (2.4) + specificity
	 *  (1.5), so passive engagement barely shifted the stream (sim: +1.2% on-interest,
	 *  within noise). At 4.0 a well-matched candidate can out-score a merely-prominent
	 *  one. */
	relevanceWeight: 4.0,
	/** Weight on avoided tokens learned from quick skips / bounces. Squashed via tanh. */
	avoidanceWeight: 1.6,
	/** Weight on the user's explicit tangent flavor (technology, oddities, culture, etc.). */
	tasteWeight: 1.15,
	/** Small global boost for story-rich hooks: mysteries, firsts, rituals, failed ideas. */
	intrigueWeight: 0.65,
	/**
	 * Weight on the intrinsic specificity signal. A pure position ranking climbs the
	 * abstraction ladder — cold-start rabbit holes collapse into Entity / Language /
	 * Science. This term pulls the feed toward vivid, concrete, named/dated articles
	 * and away from bare definitional categories. Scaled like position/relevance so it
	 * reorders within the lead band without overriding a genuinely strong match.
	 */
	specificityWeight: 1.5,
	/**
	 * Gentle tiebreaker for candidates that have a lead image. Deliberately small:
	 * the card leads with the article's hook text, not the picture (Wikipedia images
	 * are often mediocre), so image-availability nudges ties but must not shape which
	 * articles the rabbit hole surfaces.
	 */
	imageBonus: 0.15,
	/**
	 * Prominence boost for links that appear early in the source article (the lead
	 * section). This is what makes the feed feel like exploring an article's actual
	 * connections rather than a random/alphabetical slice of its outbound links.
	 */
	positionWeight: 2.4,
	/** Decay constant for the position boost (links ~this far in get ~37% of it). */
	positionHalfLife: 10,
	/** Per-token penalty for overlapping with recently shown articles (variety). */
	varietyPenalty: -0.45,
	/** Nudge against `related` fallbacks so genuine outbound links win ties. */
	relatedPenalty: -0.25,
	/** Safety net — disambiguation pages should already be filtered out. */
	disambiguationPenalty: -5,
	/**
	 * Heavy dampening for political content (elections/presidents/parties/etc.).
	 * Large enough to sink political candidates below everything else, but additive
	 * (not -Infinity), so they can still appear when nothing else is available.
	 */
	politicalPenalty: -500,
	/** Probability of ignoring relevance and jumping somewhere loosely connected. */
	surpriseEpsilon: 0.18,
	/** Pick the next step by weighted-random among the top-K scorers (not pure argmax). */
	topK: 8,
	/** Softmax temperature for that weighted pick. Higher = more random among the top. */
	temperature: 0.6,
	/** How many recent articles feed the variety penalty (widened so the immediate parent is excluded separately). */
	recentWindow: 5,
	/** Weight added to a token each time the user likes an article containing it. */
	likeTokenWeight: 1,
	/** Weight added when the user explicitly clicks through to read an article — stronger than passive dwell. */
	clickthroughTokenWeight: 0.7,
	/** Weight added when the user explicitly branches from an article. */
	branchTokenWeight: 0.85,
	/** Lighter weight for tokens from articles the user merely dwelled on. */
	dwellTokenWeight: 0.2,
	/** Weight added to the avoided-token vector when a card is quickly skipped. */
	skipTokenWeight: 0.28,
	/** Dwell milliseconds before an article counts as "engaged with". */
	dwellThresholdMs: 4000,
	/** Ignore tiny visibility blips when deciding whether a card was skipped. */
	skipMinVisibleMs: 350,
	/** Below this visible duration, no interaction is treated as a weak negative signal. */
	skipThresholdMs: 1400,
	/** Multiply all token weights by this at the start of each session so stale interests fade. */
	sessionDecay: 0.85,
	/** Avoidance memory decays faster than positive interest so skips stay reversible. */
	avoidSessionDecay: 0.65,
	/** Drop tokens below this floor when decaying — noise that decay brought down this far is useless. */
	sessionDecayFloor: 0.05,
	/** Single token weight ceiling; prevents one obsession from drowning everything else out. */
	tokenWeightCap: 3,
	/** Single avoided-token ceiling; keeps skips from permanently burying broad topics. */
	avoidTokenWeightCap: 1.8,
	/** Five-card pacing loop: continuity, continuity, taste, novelty, specificity. */
	pacingPattern: ['close', 'close', 'taste', 'intrigue', 'specific'] as const,
	/** Extra boost for the explicit taste slot. */
	pacingTasteBoost: 1.25,
	/** Extra boost for the novelty/hook slot. */
	pacingIntrigueBoost: 1.5,
	/** Extra boost for the vivid-specific story slot. */
	pacingSpecificityBoost: 1.1,
	/** Minimum score for a candidate to qualify for the surprise pool (excludes garbage at the bottom). */
	surpriseFloor: 0.1,
	/** Minimum hook score for a smart surprise. */
	surpriseIntrigueFloor: 0.35,
	/** Extra surprise-time weight for hooky lateral candidates. */
	surpriseIntrigueBoost: 1.8,
	/** Surprise softmax temperature; higher than normal because surprise should vary. */
	surpriseTemperature: 0.85,
	/** Cap smart-surprise candidates after sorting by surprise score. */
	surpriseTopK: 10,
	/**
	 * Minimum usable mid-tier candidates (below top-K) for a surprise to fire.
	 * Equivalent to requiring a total scored pool of roughly topK + this many —
	 * a dud surprise from a near-empty middle is worse than no surprise.
	 */
	surpriseMinPool: 3,
	/** sessionStorage key used to persist the trail (titles + relations only — tiny). */
	trailStorageKey: 'tangent:trail:v1',
	/** Maximum trail nodes stored; older entries are dropped from the tail. */
	trailCap: 100,
	/** How many of the stored trail's latest nodes we refetch on rehydration (cold-cache budget). */
	rehydrateRestoreCap: 20,
	/** sessionStorage sentinel that gates decay to once per tab session. */
	decayStorageKey: 'tangent:decay:v1'
} as const;
