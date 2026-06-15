import { browser } from '$app/environment';
import type { Article, Candidate } from '$lib/wikipedia/types';
import type { Connection, EngineContext, FeedCard, FetchResult, Relation, TrailNode } from './types';
import { FEED } from './config';
import { selectNext } from './select';
import { tokenize } from './tokens';
import { profile } from '$lib/engagement/profile.svelte';
import { saveTrail, loadTrail, clearTrail, chainTip } from './trail';

type Status = 'idle' | 'loading' | 'ready' | 'error' | 'exhausted' | 'stalled';

const PREFETCH_TARGET = 3;
const MAX_CARD_ATTEMPTS = 3;
const REHYDRATE_BATCH = 4;

async function fetchCardApi(title: string): Promise<FetchResult<Article>> {
	try {
		const res = await fetch(`/api/card?title=${encodeURIComponent(title)}`);
		if (!res.ok) return { ok: false, kind: 'network' };
		const data = (await res.json()) as { article: Article | null };
		if (!data.article) return { ok: false, kind: 'notfound' };
		return { ok: true, data: data.article };
	} catch {
		return { ok: false, kind: 'network' };
	}
}

async function fetchLinksApi(from: string, mode?: 'related'): Promise<FetchResult<Candidate[]>> {
	try {
		const q = mode ? `&mode=${mode}` : '';
		const res = await fetch(`/api/links?from=${encodeURIComponent(from)}${q}`);
		if (!res.ok) return { ok: false, kind: 'network' };
		const data = (await res.json()) as { candidates: Candidate[] };
		const candidates = data.candidates ?? [];
		if (candidates.length === 0) return { ok: false, kind: 'empty' };
		return { ok: true, data: candidates };
	} catch {
		return { ok: false, kind: 'network' };
	}
}

/**
 * Drives the feed on the client: owns the visible card chain, runs the pure feed
 * engine against the user's engagement profile, and keeps a small buffer of
 * prefetched cards so scrolling stays smooth.
 *
 * The trail (titles + relations) is persisted to sessionStorage so refresh and
 * back-navigation restore the feed without destroying context.
 */
class FeedState {
	cards = $state<FeedCard[]>([]);
	trail = $state<TrailNode[]>([]);
	status = $state<Status>('idle');
	error = $state<string | null>(null);
	/** The raw seed param — used as the storage key and for rehydrate matching. */
	seedTitle = $state<string | null>(null);
	/** The seed's canonical Wikipedia title, for the page <title> (the param may be a
	 *  slug like "Silk_Road" or a not-yet-resolved guess). */
	displayTitle = $state<string | null>(null);
	rehydrating = $state(false);
	/** When true, jumpRelated also failed — only start-over remains. */
	showStartOver = $state(false);

	#buffer: FeedCard[] = [];
	#counter = 0;
	/** Guards branchFrom so rapid "More like this" taps don't stack branches / race the buffer. */
	#branching = false;
	/** Serializes builds so each one sees a consistent chain tip. */
	#tail: Promise<boolean> = Promise.resolve(false);
	/**
	 * Monotonically incremented on each start()/rehydrate() call.
	 * Async operations capture the token at entry and bail if it changed —
	 * prevents a mid-rehydrate seed change from corrupting state.
	 */
	#abortToken = 0;

	get isExhausted(): boolean {
		return this.status === 'exhausted';
	}

	/**
	 * Begin a new rabbit hole from a seed article.
	 * Clears any stored trail from a different seed (X→Y→X resurrection fix).
	 */
	async start(seedTitle: string): Promise<void> {
		this.#abortToken++;
		if (browser) {
			const stored = loadTrail();
			if (stored && stored.seedTitle !== seedTitle) clearTrail();
		}

		this.cards = [];
		this.#buffer = [];
		this.trail = [];
		this.error = null;
		this.seedTitle = seedTitle;
		this.displayTitle = null;
		this.status = 'loading';
		this.rehydrating = false;
		this.showStartOver = false;

		const result = await fetchCardApi(seedTitle);
		if (!result.ok) {
			this.status = 'error';
			this.error = `Couldn't open "${seedTitle}". Try another starting point.`;
			return;
		}

		this.displayTitle = result.data.title;
		const seedCard = this.#card(result.data, { fromTitle: '', relation: 'seed' });
		this.cards = [seedCard];
		// The seed is where you start, so it's seen from the outset.
		this.trail = [this.#trailNode(seedCard, true)];
		if (browser) saveTrail(seedTitle, this.trail);
		profile.recordSeen(result.data);
		this.status = 'ready';
		void this.#refill();
	}

	/** Reveal the next card. Called as the user scrolls toward the end. */
	async more(): Promise<void> {
		if (this.status === 'exhausted' || this.status === 'loading') return;
		if (this.#buffer.length === 0) await this.#buildNext();

		const next = this.#buffer.shift();
		if (next) {
			profile.recordSeen(next.article);
			this.cards = [...this.cards, next];
			this.trail = [...this.trail, this.#trailNode(next)];
			if (browser) saveTrail(this.seedTitle ?? '', this.trail);
			void this.#refill();
		} else if (this.cards.length > 0) {
			this.status = 'exhausted';
		}
	}

	/** "More like this": steer the hole toward a card via its related pages. */
	async branchFrom(card: FeedCard): Promise<string | null> {
		if (this.#branching) return null;
		this.#branching = true;
		try {
			const linksResult = await fetchLinksApi(card.article.title, 'related');
			if (!linksResult.ok) return null;

			// branchFrom is a deliberate steering action — never surprise here.
			const selection = selectNext(linksResult.data, this.#context({ noSurprise: true }));
			if (!selection) return null;

			const cardResult = await fetchCardApi(selection.candidate.title);
			if (!cardResult.ok) return null;

			this.#buffer = [];
			const built = this.#card(cardResult.data, {
				fromTitle: card.article.title,
				relation: 'related'
			});
			this.cards = [...this.cards, built];
			this.trail = [...this.trail, this.#trailNode(built)];
			if (browser) saveTrail(this.seedTitle ?? '', this.trail);
			profile.recordSeen(cardResult.data);
			void this.#refill();
			return built.id;
		} finally {
			this.#branching = false;
		}
	}

	/**
	 * Dive into an in-article link: append the linked article as a fresh card at the
	 * tail and steer the hole through it. Unlike branchFrom (which picks a *related*
	 * page), this lands exactly on the title the reader tapped. `fromTitle` is the
	 * article you were reading, so the new card's breadcrumb reads "Dove in from …".
	 *
	 * Optimistic: because we already know the destination title, the placeholder card
	 * is appended SYNCHRONOUSLY and its id returned immediately, so the caller can scroll
	 * to it at once — it renders as a skeleton (title + breadcrumb + pulsing body) while
	 * the real body (and the clickthrough + seen engagement signals, which need the
	 * article's tokens) is patched in by {@link #resolveCardInto} in the background. The
	 * skeleton is kept strictly shorter than any real card so the body only ever grows the
	 * card downward, never shifting the scroll position the dive landed on.
	 */
	beginDive(title: string, fromTitle: string): string {
		// New buffered picks were built from the old tip; the dive changes the tip.
		this.#buffer = [];
		const placeholder = this.#pendingCard(title, { fromTitle, relation: 'dive' });
		this.cards = [...this.cards, placeholder];
		this.trail = [...this.trail, this.#trailNode(placeholder)];
		if (browser) saveTrail(this.seedTitle ?? '', this.trail);
		this.status = 'ready';
		// Fetch the body in the background; the caller has already scrolled to the skeleton.
		void this.#resolveCardInto(placeholder.id, title, { clickthrough: true });
		return placeholder.id;
	}

	/**
	 * Fill an optimistic placeholder with its fetched article, or drop it on failure.
	 * Refilling the prefetch buffer waits until the card resolves so the chain never
	 * builds from a tip that turned out not to exist.
	 */
	async #resolveCardInto(
		id: string,
		title: string,
		opts: { clickthrough?: boolean } = {}
	): Promise<void> {
		// Drain any inflight build, then discard whatever it buffered — it was built
		// from the pre-dive tip and would otherwise jump the chain ahead of the dive.
		await this.#tail;
		this.#buffer = [];
		const cardResult = await fetchCardApi(title);

		if (!cardResult.ok) {
			// Roll back the placeholder — the dive dead-ended (rare: a 404/redirect miss
			// or upstream hiccup). Silent, matching the old addDive's no-op-on-failure: a
			// single failed dive shouldn't flip the whole feed into the "connection hiccup"
			// banner. The feed stays where it was; the user can tap the link again.
			this.cards = this.cards.filter((c) => c.id !== id);
			this.trail = this.trail.filter((n) => n.id !== id);
			if (browser) saveTrail(this.seedTitle ?? '', this.trail);
			return;
		}

		const article = cardResult.data;
		this.cards = this.cards.map((c) =>
			c.id === id ? { ...c, article, pending: false } : c
		);
		if (opts.clickthrough) profile.recordClickthrough(article);
		profile.recordSeen(article);
		this.status = 'ready';
		void this.#refill();
	}

	/**
	 * Restore a previous session from sessionStorage.
	 * Returns true if rehydration was performed (caller skips start()).
	 * Returns false if no matching trail exists (caller should call start()).
	 */
	async rehydrate(seedParam: string | null): Promise<boolean> {
		if (!browser) return false;
		const stored = loadTrail();
		if (!stored) return false;

		if (seedParam !== null && seedParam !== stored.seedTitle) {
			clearTrail();
			return false;
		}

		const token = ++this.#abortToken;
		this.status = 'loading';
		this.rehydrating = true;
		this.cards = [];
		this.#buffer = [];
		this.trail = stored.trail;
		this.seedTitle = stored.seedTitle;
		this.displayTitle = stored.trail[0]?.title ?? stored.seedTitle;
		this.error = null;
		this.showStartOver = false;

		// Restore only the most recent N nodes to bound cold-cache fetch time.
		// Older nodes are kept in the trail for the panel but skipped in cards.
		const restoreSlice = stored.trail.slice(-FEED.rehydrateRestoreCap);

		// Fetch in batches of 4 to parallelize without overwhelming the server.
		for (let i = 0; i < restoreSlice.length; i += REHYDRATE_BATCH) {
			if (this.#abortToken !== token) return false;
			const batch = restoreSlice.slice(i, i + REHYDRATE_BATCH);
			const results = await Promise.all(batch.map((node) => fetchCardApi(node.title)));

			if (this.#abortToken !== token) return false;

			for (let j = 0; j < batch.length; j++) {
				const node = batch[j];
				const result = results[j];
				if (result.ok) {
					const card = this.#cardFromNode(result.data, node);
					this.cards = [...this.cards, card];
					profile.recordSeen(result.data);
				}
				// Null fetches: trail node is kept (shows in panel as tombstone); card skipped.
			}
		}

		if (this.#abortToken !== token) return false;

		this.rehydrating = false;
		this.status = 'ready';
		void this.#refill();
		return true;
	}

	/**
	 * Attempt a related jump from the chain tip before giving up.
	 * Called from the exhausted state to offer one more hop before start-over.
	 */
	async jumpRelated(): Promise<string | null> {
		const tip = chainTip(this.trail);
		if (!tip) return null;

		const linksResult = await fetchLinksApi(tip.title, 'related');
		if (!linksResult.ok) return null;

		const selection = selectNext(linksResult.data, this.#context({ noSurprise: true }));
		if (!selection) return null;

		const cardResult = await fetchCardApi(selection.candidate.title);
		if (!cardResult.ok) return null;

		const built = this.#card(cardResult.data, { fromTitle: tip.title, relation: 'related' });
		this.cards = [...this.cards, built];
		this.trail = [...this.trail, this.#trailNode(built)];
		if (browser) saveTrail(this.seedTitle ?? '', this.trail);
		profile.recordSeen(cardResult.data);
		this.status = 'ready';
		void this.#refill();
		return built.id;
	}

	/**
	 * Reset from a stalled state and retry the prefetch buffer.
	 */
	retry(): void {
		if (this.status !== 'stalled') return;
		this.status = 'ready';
		void this.#refill();
	}

	/** User changed explicit taste steering; discard stale prefetched picks. */
	retune(): void {
		this.#buffer = [];
		if (this.status === 'ready') void this.#refill();
	}

	#refill(): Promise<void> {
		return (async () => {
			while (this.#buffer.length < PREFETCH_TARGET && this.status !== 'exhausted') {
				const ok = await this.#buildNext();
				if (!ok) {
					// A build came up dry. If nothing is buffered and we're still 'ready'
					// (not a retryable network 'stalled'), the hole has run out of links —
					// flip to 'exhausted' so the "run dry" UI shows instead of an eternal
					// skeleton, which it otherwise would when the sentinel stays in view and
					// the IntersectionObserver never re-fires to call more() again.
					if (
						this.#buffer.length === 0 &&
						this.cards.length > 0 &&
						this.status === 'ready'
					) {
						this.status = 'exhausted';
					}
					break;
				}
			}
		})();
	}

	/** Serialized: build one card from the chain tip and push it to the buffer. */
	#buildNext(): Promise<boolean> {
		const run = this.#tail.then(() => this.#doBuild());
		this.#tail = run.catch(() => false);
		return run;
	}

	async #doBuild(): Promise<boolean> {
		// The effective tip skips surprise detours so a dud jump self-heals:
		// the next card after a surprise fetches from the pre-surprise chain tip.
		// Consecutive surprises share the same pre-surprise tip (intentional — the
		// user can adopt a detour via "More like this" if they want it as the new root).
		const tip = this.#effectiveTip();
		if (!tip) return false;

		const linksResult = await fetchLinksApi(tip.article.title);
		if (!linksResult.ok) {
			if (linksResult.kind === 'network') this.status = 'stalled';
			return false;
		}

		const blocked = new Set<string>();
		for (let attempt = 0; attempt < MAX_CARD_ATTEMPTS; attempt++) {
			const selection = selectNext(linksResult.data, this.#context({ blocked }));
			if (!selection) return false;

			const cardResult = await fetchCardApi(selection.candidate.title);
			if (cardResult.ok) {
				const relation: Relation = selection.surprised ? 'surprise' : selection.candidate.relation;
				// Surprise: breadcrumb says "Tangent from <actual previous card>", not the tip.
				const rawTip = this.#buffer.at(-1) ?? this.cards.at(-1);
				const fromTitle = selection.surprised
					? (rawTip?.article.title ?? tip.article.title)
					: tip.article.title;
				this.#buffer.push(this.#card(cardResult.data, { fromTitle, relation }));
				return true;
			}
			if (cardResult.kind === 'network') {
				this.status = 'stalled';
				return false;
			}
			blocked.add(selection.candidate.title);
		}
		return false;
	}

	/**
	 * The last non-detour card in cards+buffer.
	 * Surprise cards are detours; the chain continues from before them so a dud jump self-heals.
	 * Falls back to the last card if everything in view is a detour (pathological case).
	 */
	#effectiveTip(): FeedCard | null {
		const all = [...this.cards, ...this.#buffer];
		for (let i = all.length - 1; i >= 0; i--) {
			if (all[i].connection.relation !== 'surprise') return all[i];
		}
		return all.at(-1) ?? null;
	}

	/** Assemble the engine context from the current chain + engagement profile. */
	#context(opts: { blocked?: Set<string>; noSurprise?: boolean } = {}): EngineContext {
		const all = [...this.cards, ...this.#buffer];
		const seenTitles = new Set(all.map((c) => c.article.title));
		if (opts.blocked) for (const t of opts.blocked) seenTitles.add(t);

		// Exclude the immediate parent (last card) from recentTokens so candidates aren't
		// penalized for sharing tokens with the article that links them. The window still
		// catches repetition loops — just one level further back.
		const recentTokens = new Set<string>();
		for (const card of all.slice(-(FEED.recentWindow + 1), -1)) {
			for (const token of tokenize(`${card.article.title} ${card.article.description ?? ''}`)) {
				recentTokens.add(token);
			}
		}

		return {
			tokenWeights: profile.tokenWeights,
			tokenAvoidWeights: profile.tokenAvoidWeights,
			tokenDocFreq: profile.tokenDocFreq,
			taste: profile.taste,
			recentTokens,
			seenTitles,
			noSurprise: opts.noSurprise ?? false,
			stepIndex: all.length,
			rng: Math.random
		};
	}

	#card(article: Article, connection: Connection): FeedCard {
		return { id: `${article.title}#${this.#counter++}`, article, connection };
	}

	/**
	 * A placeholder card for an optimistic dive: we know the title (the link the reader
	 * tapped), so the card renders its title + breadcrumb immediately and shows a skeleton
	 * body until {@link #resolveCardInto} swaps in the fetched article.
	 */
	#pendingCard(title: string, connection: Connection): FeedCard {
		const article: Article = {
			title,
			description: null,
			extract: '',
			thumbnail: null,
			wikiUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
			lang: 'en',
			tokens: []
		};
		return { id: `${title}#${this.#counter++}`, article, connection, pending: true };
	}

	#cardFromNode(article: Article, node: TrailNode): FeedCard {
		return {
			id: node.id,
			article,
			connection: { fromTitle: node.fromTitle, relation: node.relation }
		};
	}

	#trailNode(card: FeedCard, seen = false): TrailNode {
		return {
			id: card.id,
			title: card.article.title,
			relation: card.connection.relation,
			fromTitle: card.connection.fromTitle,
			// Surprises are detours: the next build fetches from the pre-surprise tip.
			isDetour: card.connection.relation === 'surprise',
			seen
		};
	}

	/**
	 * Mark a card as seen (it scrolled into view) so it joins the user-facing trail.
	 * The full chain stays in `trail` for mechanics/rehydration; only the display
	 * filters to seen nodes, so the trail reflects where you've actually been.
	 */
	markSeen(id: string): void {
		const node = this.trail.find((n) => n.id === id);
		if (!node || node.seen) return;
		this.trail = this.trail.map((n) => (n.id === id ? { ...n, seen: true } : n));
		if (browser) saveTrail(this.seedTitle ?? '', this.trail);
	}
}

export const feed = new FeedState();
