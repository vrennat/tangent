import type { Article, Candidate } from '$lib/wikipedia/types';
import type { TasteId } from './taste';

/** How a card arrived in the feed — drives the breadcrumb phrasing. */
export type Relation = 'seed' | 'link' | 'related' | 'surprise' | 'dive';

export interface Connection {
	/** The title of the article we came from (empty for the seed). */
	fromTitle: string;
	relation: Relation;
	/** True when this card started a new run (seed, tangent, drift, branch, dive). */
	runStart?: boolean;
}

/** One entry in the feed. `id` is unique per appearance so keys stay stable. */
export interface FeedCard {
	id: string;
	article: Article;
	connection: Connection;
	/** Wikipedia categories carried over from the candidate that won selection —
	 *  feeds the run's category accumulation. Absent for seeds/dives/rehydrated
	 *  cards (fetched as bare articles), which simply contribute no category signal. */
	categories?: string[];
	/**
	 * True while an optimistic placeholder is still loading its real article. A dive
	 * appends the card and scrolls to it immediately (we already know the title), then
	 * swaps in the fetched body — so the landing animation starts before the network
	 * round trip finishes instead of after it. Undefined/false once resolved.
	 */
	pending?: boolean;
}

/** One node in the persistent trail. Healed detours are skipped when deriving the chain tip. */
export interface TrailNode {
	id: string;
	title: string;
	relation: Relation;
	fromTitle: string;
	/**
	 * True for a tangent the user healed (fast-skipped): the chain tip and run
	 * accounting skip it, so the feed rebuilds from the pre-tangent card. Tangents
	 * re-root by default; this flag is the escape hatch, set after the fact.
	 * (Old stored trails marked every surprise a detour at creation — still honored.)
	 */
	isDetour: boolean;
	/** True when this node started a new run. Old stored trails lack it; run
	 *  accounting falls back to boundary relations (seed/related/surprise/dive). */
	runStart?: boolean;
	/**
	 * True once the card has actually scrolled into view (or is the seed). The full chain
	 * is kept for mechanics/rehydration, but the user-facing trail only shows seen nodes —
	 * so the trail reflects where you've actually been, not everything prefetched.
	 */
	seen: boolean;
}

/**
 * Discriminated fetch result so callers can distinguish network failures (retryable)
 * from genuine empty responses (exhausted) without swallowing errors into empty arrays.
 */
export type FetchResult<T> =
	| { ok: true; data: T }
	| { ok: false; kind: 'network' | 'notfound' | 'empty' };

/**
 * Everything the pure engine needs to pick the next step. No I/O, no globals —
 * the caller assembles this from the user's engagement profile and feed history,
 * which keeps scoring/selection trivially unit-testable.
 */
export interface EngineContext {
	/** Interest vector: token -> weight, built from articles the user liked/dwelled on. */
	tokenWeights: Record<string, number>;
	/** Avoidance vector: token -> weight, built from cards skipped quickly. */
	tokenAvoidWeights: Record<string, number>;
	/** How many distinct seen cards each token appeared in — used for DF discounting. */
	tokenDocFreq: Record<string, number>;
	/** Explicit user steering: a soft boost, not a hard filter. */
	taste: TasteId;
	/** Cards served since the current run began (0 = picking a fresh run's first card). */
	runDepth: number;
	/** Tokens accumulated from the current run's cards — the coherence target in-run,
	 *  the variety target at a run break. */
	runTokens: Set<string>;
	/** Normalized category tokens accumulated from the current run's cards — the
	 *  era/region half of the coherence signal. */
	runCategories: Set<string>;
	/** Titles already shown, to avoid loops. */
	seenTitles: Set<string>;
	/** When true, the engine never breaks the run for a tangent (branchFrom, dives). */
	noSurprise: boolean;
	/** Cards served this session — identifies the first run (runDepth === stepIndex). */
	stepIndex: number;
	/** Injectable RNG (default Math.random) so tests are deterministic. */
	rng: () => number;
}

export interface Selection {
	candidate: Candidate;
	/** True when this pick is a tangent — a deliberate run-breaking jump. */
	surprised: boolean;
	/** True when this pick starts a new run (every tangent, plus the drift
	 *  fall-through when the tangent pool was too shallow). Clients reset their
	 *  run accounting (depth, run tokens/categories) on it. */
	runReset: boolean;
}

/**
 * The persistent half of a user's profile: the interest vector. Small and syncable
 * (a few KB), it lives on-device when logged out and in D1 when an account exists.
 * Sent in the `/api/next` body so the server engine scores against it.
 */
export interface InterestPayload {
	tokenWeights: Record<string, number>;
	/** Optional for backward compatibility with older clients. Defaults to empty. */
	tokenAvoidWeights?: Record<string, number>;
	tokenDocFreq: Record<string, number>;
	/** Optional for backward compatibility with older clients. Defaults to balanced. */
	taste?: TasteId;
}

/**
 * The ephemeral half: per-session state the client always tracks and sends. Kept
 * separate from {@link InterestPayload} so accounts only ever sync the durable vector.
 */
export interface SessionPayload {
	/** Titles already shown this session, to avoid loops. */
	seenTitles: string[];
	/** Deprecated: superseded by runTokens. Still read as a fallback so older
	 *  clients keep a coherence signal. */
	recentTokens?: string[];
	/** When true, the engine never breaks the run for a tangent (branch/dive). */
	noSurprise?: boolean;
	/** Cards served this session. Defaults to seenTitles.length. */
	stepIndex?: number;
	/** Cards served since the current run began. Older clients omit it; the server
	 *  falls back to a fixed-cadence cycle derived from stepIndex. */
	runDepth?: number;
	/** Tokens accumulated from the current run's cards. */
	runTokens?: string[];
	/** Normalized category tokens accumulated from the current run's cards. */
	runCategories?: string[];
}

/** POST body for `/api/next` — the server reconstructs an {@link EngineContext} from this. */
export interface NextRequest {
	/** The chain tip to explore from (surprise detours are skipped client-side first). */
	fromTitle: string;
	/** `related` for "more like this" steering; omitted for the default explore feed. */
	mode?: 'related';
	interest: InterestPayload;
	session: SessionPayload;
}

/** `/api/next` response — the fully-resolved next card plus how it was chosen. */
export interface NextResponse {
	article: Article | null;
	surprised: boolean;
	relation: Relation;
	/** True when this pick starts a new run — clients reset run accounting on it. */
	runReset?: boolean;
	/** The picked candidate's NORMALIZED category tokens (categoryTokenSet), ready
	 *  for the client's run-category accumulation. Pre-normalized server-side so
	 *  native clients never need their own category tokenizer. */
	categoryTokens?: string[];
	/** True when the candidate pool is exhausted (no eligible next step). */
	exhausted?: boolean;
}
