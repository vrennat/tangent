import type { Article, Candidate } from '$lib/wikipedia/types';
import type { Connection, EngineContext, FeedCard, Relation } from './types';
import { FEED } from './config';
import { selectNext } from './select';
import { tokenize } from './tokens';
import { profile } from '$lib/engagement/profile.svelte';

type Status = 'idle' | 'loading' | 'ready' | 'error' | 'exhausted';

const PREFETCH_TARGET = 3;
const MAX_CARD_ATTEMPTS = 3;

async function fetchCardApi(title: string): Promise<Article | null> {
	try {
		const res = await fetch(`/api/card?title=${encodeURIComponent(title)}`);
		if (!res.ok) return null;
		return ((await res.json()) as { article: Article | null }).article;
	} catch {
		return null;
	}
}

async function fetchLinksApi(from: string, mode?: 'related'): Promise<Candidate[]> {
	try {
		const q = mode ? `&mode=${mode}` : '';
		const res = await fetch(`/api/links?from=${encodeURIComponent(from)}${q}`);
		if (!res.ok) return [];
		return ((await res.json()) as { candidates: Candidate[] }).candidates ?? [];
	} catch {
		return [];
	}
}

/**
 * Drives the feed on the client: owns the visible card chain, runs the pure feed
 * engine against the user's engagement profile, and keeps a small buffer of
 * prefetched cards so scrolling stays smooth.
 */
class FeedState {
	cards = $state<FeedCard[]>([]);
	status = $state<Status>('idle');
	error = $state<string | null>(null);
	seedTitle = $state<string | null>(null);

	#buffer: FeedCard[] = [];
	#counter = 0;
	/** Serializes builds so each one sees a consistent chain tip. */
	#tail: Promise<boolean> = Promise.resolve(false);

	get isExhausted(): boolean {
		return this.status === 'exhausted';
	}

	/** Begin a new rabbit hole from a seed article. */
	async start(seedTitle: string): Promise<void> {
		this.cards = [];
		this.#buffer = [];
		this.error = null;
		this.seedTitle = seedTitle;
		this.status = 'loading';

		const article = await fetchCardApi(seedTitle);
		if (!article) {
			this.status = 'error';
			this.error = `Couldn't open "${seedTitle}". Try another starting point.`;
			return;
		}

		this.cards = [this.#card(article, { fromTitle: '', relation: 'seed' })];
		this.status = 'ready';
		void this.#refill();
	}

	/** Reveal the next card. Called as the user scrolls toward the end. */
	async more(): Promise<void> {
		if (this.status === 'exhausted' || this.status === 'loading') return;
		if (this.#buffer.length === 0) await this.#buildNext();

		const next = this.#buffer.shift();
		if (next) {
			this.cards = [...this.cards, next];
			void this.#refill();
		} else if (this.cards.length > 0) {
			this.status = 'exhausted';
		}
	}

	/** "More like this": steer the hole toward a card via its related pages. */
	async branchFrom(card: FeedCard): Promise<string | null> {
		const candidates = await fetchLinksApi(card.article.title, 'related');
		const selection = selectNext(candidates, this.#context());
		if (!selection) return null;

		const article = await fetchCardApi(selection.candidate.title);
		if (!article) return null;

		this.#buffer = [];
		const built = this.#card(article, { fromTitle: card.article.title, relation: 'related' });
		this.cards = [...this.cards, built];
		void this.#refill();
		return built.id;
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
		const tip = this.#buffer.at(-1) ?? this.cards.at(-1);
		if (!tip) return false;

		const candidates = await fetchLinksApi(tip.article.title);
		if (candidates.length === 0) return false;

		const blocked = new Set<string>();
		for (let attempt = 0; attempt < MAX_CARD_ATTEMPTS; attempt++) {
			const selection = selectNext(candidates, this.#context(blocked));
			if (!selection) return false;

			const article = await fetchCardApi(selection.candidate.title);
			if (article) {
				const relation: Relation = selection.surprised
					? 'surprise'
					: selection.candidate.relation;
				this.#buffer.push(
					this.#card(article, { fromTitle: tip.article.title, relation })
				);
				return true;
			}
			// Chosen page wouldn't load — block it and pick again.
			blocked.add(selection.candidate.title);
		}
		return false;
	}

	/** Assemble the engine context from the current chain + engagement profile. */
	#context(blocked?: Set<string>): EngineContext {
		const all = [...this.cards, ...this.#buffer];
		const seenTitles = new Set(all.map((c) => c.article.title));
		if (blocked) for (const t of blocked) seenTitles.add(t);

		const recentTokens = new Set<string>();
		for (const card of all.slice(-FEED.recentWindow)) {
			for (const token of tokenize(`${card.article.title} ${card.article.description ?? ''}`)) {
				recentTokens.add(token);
			}
		}

		return {
			tokenWeights: profile.tokenWeights,
			recentTokens,
			seenTitles,
			rng: Math.random
		};
	}

	#card(article: Article, connection: Connection): FeedCard {
		return { id: `${article.title}#${this.#counter++}`, article, connection };
	}
}

export const feed = new FeedState();
