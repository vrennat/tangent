import type { Article, Candidate } from '$lib/wikipedia/types';

/** How a card arrived in the feed — drives the breadcrumb phrasing. */
export type Relation = 'seed' | 'link' | 'related' | 'surprise' | 'dive';

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

/** One node in the persistent trail. Detours (surprises) are skipped when deriving the chain tip. */
export interface TrailNode {
	id: string;
	title: string;
	relation: Relation;
	fromTitle: string;
	/** True for surprise cards — the next build fetches from the pre-surprise tip instead. */
	isDetour: boolean;
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
	/** How many distinct seen cards each token appeared in — used for DF discounting. */
	tokenDocFreq: Record<string, number>;
	/** Tokens from the last few shown articles, to penalize monotony (variety). */
	recentTokens: Set<string>;
	/** Titles already shown, to avoid loops. */
	seenTitles: Set<string>;
	/** When true, the engine never fires a surprise (branchFrom, dives). */
	noSurprise: boolean;
	/** Injectable RNG (default Math.random) so tests are deterministic. */
	rng: () => number;
}

export interface Selection {
	candidate: Candidate;
	/** True when the surprise epsilon fired and relevance was bypassed. */
	surprised: boolean;
}

/**
 * The persistent half of a user's profile: the interest vector. Small and syncable
 * (a few KB), it lives on-device when logged out and in D1 when an account exists.
 * Sent in the `/api/next` body so the server engine scores against it.
 */
export interface InterestPayload {
	tokenWeights: Record<string, number>;
	tokenDocFreq: Record<string, number>;
}

/**
 * The ephemeral half: per-session state the client always tracks and sends. Kept
 * separate from {@link InterestPayload} so accounts only ever sync the durable vector.
 */
export interface SessionPayload {
	/** Titles already shown this session, to avoid loops. */
	seenTitles: string[];
	/** Tokens from the last few shown articles, for the variety penalty. */
	recentTokens: string[];
	/** When true, the engine never fires a surprise (deliberate steering: branch/dive). */
	noSurprise?: boolean;
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
	/** True when the candidate pool is exhausted (no eligible next step). */
	exhausted?: boolean;
}
