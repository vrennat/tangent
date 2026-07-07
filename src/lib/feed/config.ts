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
	 *
	 * Raised 1.5 -> 2.0 after a cold-start sim sweep (scripts/feed-sim/FINDINGS.md):
	 * vs lowering positionWeight, this buys the same concreteness gain (Δspecificity
	 * +0.14) with less than half the lead-depth displacement and half the dead-ends,
	 * because it targets concreteness directly rather than via deeper/odder links. The
	 * cost is a mild cold-start topical-diversity dip (ΔTTR -2.8); the relevance taper
	 * (1/(1+r) in score.ts) confines that to literal cold start — engaged-walk diversity
	 * is unchanged. Held at 2.0 (not 3.0) to keep the diversity cost and history/biography
	 * skew contained; 3.0 reintroduces the relevance-lever bubble failure mode.
	 */
	specificityWeight: 2.0,
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
	/** Steady-state probability of ignoring relevance and jumping somewhere loosely
	 *  connected. The opening cards use surpriseEpsilonSchedule instead. */
	surpriseEpsilon: 0.18,
	/**
	 * Per-step surprise epsilon for the opening cards (index = stepIndex; beyond the
	 * array the steady-state surpriseEpsilon applies). Zero on the first card — the
	 * user is still orienting, and a sideways yank there reads as broken — then
	 * elevated through the first handful so a first session reliably meets a tangent,
	 * the moment that shows what the product is, instead of waiting the ~6 cards the
	 * steady-state epsilon needs in expectation. The pool-quality gates (floor,
	 * intrigue floor, minPool fall-through) still apply, so a shallow middle never
	 * turns the elevated epsilon into dud surprises.
	 */
	surpriseEpsilonSchedule: [0, 0, 0.35, 0.35, 0.35, 0.35, 0.35] as const,
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
	/**
	 * Session decay for tokenDocFreq, matched to sessionDecay so the DF discount ages
	 * with the interest weights it discounts. Without it df only ever grows while
	 * weights stay capped, so relevance fades toward zero for long-lived profiles —
	 * and the map itself grows without bound (it rides in every /api/next payload).
	 */
	dfSessionDecay: 0.85,
	/** Drop df entries below one document's worth after decay — a token seen once, sessions ago, is noise. */
	dfDecayFloor: 1,
	/** Cap the persisted seen-title df-dedupe list (most recent kept) so it can't grow forever. */
	dfSeenTitlesCap: 500,
	/** Single token weight ceiling; prevents one obsession from drowning everything else out. */
	tokenWeightCap: 3,
	/** Single avoided-token ceiling; keeps skips from permanently burying broad topics. */
	avoidTokenWeightCap: 1.8,
	/** Five-card pacing loop: continuity, continuity, taste, novelty, specificity. */
	pacingPattern: ['close', 'close', 'taste', 'intrigue', 'specific'] as const,
	/**
	 * Cold-open pacing for the opening steps (index = stepIndex; index 0 aligns with
	 * the seed, so clients that build from step 1 never hit it). At step 1 every
	 * candidate is one hop from the seed — closeness is guaranteed by construction —
	 * so the regular loop's close/close/taste start wastes the first impression on
	 * continuity the pool already provides. Open on hooks instead; the regular loop
	 * restarts from its beginning once these run out.
	 */
	pacingColdOpen: ['close', 'intrigue', 'specific', 'close', 'intrigue'] as const,
	/**
	 * Slot substituted for 'taste' when the user hasn't picked a flavor: tasteAffinity
	 * is identically 0 for 'balanced', so the taste slot would otherwise be a dead
	 * spot in the loop for every user on the default — which is every cold-start user.
	 */
	pacingBalancedFallback: 'intrigue' as const,
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
