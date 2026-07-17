/**
 * Tunable knobs for the feed algorithm. Everything that shapes the rabbit hole
 * lives here so the behavior is easy to reason about and iterate on.
 *
 * Shape of the walk (docs/specs/2026-07-16-run-based-feed-design.md): the feed
 * moves in RUNS — a few cards that stay in the current neighborhood (coherence +
 * category-affinity bonuses) — punctuated by TANGENTS, deliberate quality-gated
 * jumps that start the next run. The jump-distance sim showed the previous
 * per-card walk was unimodal (a routine pick and a deliberate surprise were the
 * same felt size); runs/breaks make it bimodal on purpose.
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
	/**
	 * Per-token penalty for overlapping with the current run's tokens, applied ONLY
	 * at a run break — it pushes the tangent pool out of the neighborhood the run
	 * just spent 3-5 cards in. In-run it is off entirely: the sim diagnosis showed
	 * the old always-on version penalized exactly the on-topic continuation
	 * ("Roman Republic" after "Roman Empire") that runs exist to provide.
	 */
	varietyPenalty: -0.45,
	/**
	 * In-run bonus for sharing tokens with the run so far (tanh-squashed count).
	 * The lexical half of "stay in the neighborhood"; sized between the intrigue
	 * nudge and the taste boost so it shapes ties without overriding relevance.
	 * Sim-tuned starting prior — see the spec's acceptance criteria.
	 */
	coherenceWeight: 0.9,
	/**
	 * In-run bonus for sharing normalized category tokens with the run so far
	 * (tanh-squashed count). This is the era/region signal: Wikipedia categories
	 * encode exactly same-time-same-place ("Ancient Rome", "1st-century BC
	 * establishments"), which title+description tokens mostly don't. Weighted
	 * above coherence because category overlap is rarer and more meaningful —
	 * requires the complete-categories fetch (see wikipedia/action.ts).
	 */
	categoryAffinityWeight: 1.6,
	/** Cards a run must serve before a break can roll. Runs are 3-5 cards. */
	runMinLength: 3,
	/**
	 * Break probability by cards past runMinLength: 45% at depth 3, 75% at 4,
	 * certain at 5. The final 1 is the anti-orbit guarantee — coherence bonuses
	 * strengthen gravity wells, so run termination must not be probabilistic
	 * forever. The session's FIRST run breaks at exactly runMinLength instead
	 * (probability 1), so a first session reliably meets a tangent at card 4 —
	 * the moment that shows what the product is — rather than 45%-maybe.
	 */
	runBreakRamp: [0.45, 0.75, 1] as const,
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
	/** Pick the next step by weighted-random among the top-K scorers (not pure argmax). */
	topK: 8,
	/** Softmax temperature for that weighted pick. Higher = more random among the top. */
	temperature: 0.6,
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
	/** Minimum break-step score for a candidate to qualify for the tangent pool
	 *  (excludes garbage at the bottom; near-neighborhood candidates sink below it
	 *  via the break-step variety penalty, which is the point). */
	surpriseFloor: 0.1,
	/** Minimum hook score for a tangent — a run break must land somewhere with a story. */
	surpriseIntrigueFloor: 0.35,
	/** Extra tangent-time weight for hooky lateral candidates. */
	surpriseIntrigueBoost: 1.8,
	/** Tangent softmax temperature; higher than normal because tangents should vary. */
	surpriseTemperature: 0.85,
	/** Cap tangent candidates after sorting by tangent score. */
	surpriseTopK: 10,
	/**
	 * Minimum eligible tangent candidates for the jump to fire. Below this the
	 * break falls through to a drift pick — out-of-neighborhood by variety penalty,
	 * but no jump — and the run resets anyway so a thin pool can never trap the
	 * feed in an orbit. A dud tangent from a near-empty pool is worse than none.
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
