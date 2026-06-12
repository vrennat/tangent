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
	seedTitle = $state<string | null>(null);
	rehydrating = $state(false);
	/** When true, jumpRelated also failed — only start-over remains. */
	showStartOver = $state(false);

	#buffer: FeedCard[] = [];
	#counter = 0;
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
		this.status = 'loading';
		this.rehydrating = false;
		this.showStartOver = false;

		const result = await fetchCardApi(seedTitle);
		if (!result.ok) {
			this.status = 'error';
			this.error = `Couldn't open "${seedTitle}". Try another starting point.`;
			return;
		}

		const seedCard = this.#card(result.data, { fromTitle: '', relation: 'seed' });
		this.cards = [seedCard];
		this.trail = [this.#trailNode(seedCard)];
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
		const linksResult = await fetchLinksApi(card.article.title, 'related');
		if (!linksResult.ok) return null;

		// branchFrom is a deliberate steering action — never surprise here.
		const selection = selectNext(linksResult.data, this.#context({ noSurprise: true }));
		if (!selection) return null;

		const cardResult = await fetchCardApi(selection.candidate.title);
		if (!cardResult.ok) return null;

		this.#buffer = [];
		const built = this.#card(cardResult.data, { fromTitle: card.article.title, relation: 'related' });
		this.cards = [...this.cards, built];
		this.trail = [...this.trail, this.#trailNode(built)];
		if (browser) saveTrail(this.seedTitle ?? '', this.trail);
		profile.recordSeen(cardResult.data);
		void this.#refill();
		return built.id;
	}

	/**
	 * Dive into an in-article link: appends to the trail and re-roots the chain.
	 * Unlike surprises, dives are deliberate — the chain continues from here.
	 * Drains inflight builds first to avoid race conditions on the buffer.
	 */
	async addDive(title: string): Promise<string | null> {
		// Drain any inflight build before mutating the buffer.
		await this.#tail;

		const prevCard = this.cards.at(-1) ?? this.#buffer.at(-1);
		this.#buffer = [];

		const cardResult = await fetchCardApi(title);
		if (!cardResult.ok) return null;

		const built = this.#card(cardResult.data, {
			fromTitle: prevCard?.article.title ?? '',
			relation: 'dive'
		});
		this.cards = [...this.cards, built];
		this.trail = [...this.trail, this.#trailNode(built)];
		if (browser) saveTrail(this.seedTitle ?? '', this.trail);
		profile.recordSeen(cardResult.data);
		this.status = 'ready';
		void this.#refill();
		return built.id;
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

	#refill(): Promise<void> {
		return (async () => {
			while (this.#buffer.length < PREFETCH_TARGET && this.status !== 'exhausted') {
				const ok = await this.#buildNext();
				if (!ok) break;
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
			tokenDocFreq: profile.tokenDocFreq,
			recentTokens,
			seenTitles,
			noSurprise: opts.noSurprise ?? false,
			rng: Math.random
		};
	}

	#card(article: Article, connection: Connection): FeedCard {
		return { id: `${article.title}#${this.#counter++}`, article, connection };
	}

	#cardFromNode(article: Article, node: TrailNode): FeedCard {
		return {
			id: node.id,
			article,
			connection: { fromTitle: node.fromTitle, relation: node.relation }
		};
	}

	#trailNode(card: FeedCard): TrailNode {
		return {
			id: card.id,
			title: card.article.title,
			relation: card.connection.relation,
			fromTitle: card.connection.fromTitle,
			// Surprises are detours: the next build fetches from the pre-surprise tip.
			isDetour: card.connection.relation === 'surprise'
		};
	}
}

export const feed = new FeedState();
