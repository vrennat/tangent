import { browser } from '$app/environment';
import type { Article } from '$lib/wikipedia/types';
import { FEED } from '$lib/feed/config';
import { tokenize } from '$lib/feed/tokens';

const STORAGE_KEY = 'wormhole:profile:v1';

interface Persisted {
	likedTitles: string[];
	clickthroughs: string[];
	engagedTitles: string[];
	tokenWeights: Record<string, number>;
	dwellMsByTitle: Record<string, number>;
}

const EMPTY: Persisted = {
	likedTitles: [],
	clickthroughs: [],
	engagedTitles: [],
	tokenWeights: {},
	dwellMsByTitle: {}
};

function load(): Persisted {
	if (!browser) return structuredClone(EMPTY);
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return structuredClone(EMPTY);
		return { ...structuredClone(EMPTY), ...JSON.parse(raw) };
	} catch {
		return structuredClone(EMPTY);
	}
}

/**
 * The user's engagement profile, persisted to localStorage.
 *
 * It owns the interest vector (`tokenWeights`) that the feed engine reads to bias
 * relevance. Likes weigh heavily; passive dwell weighs lightly. Reactive ($state)
 * so the UI updates instantly when a card is liked.
 */
class EngagementProfile {
	likedTitles = $state<string[]>([]);
	clickthroughs = $state<string[]>([]);
	tokenWeights = $state<Record<string, number>>({});

	#engaged = new Set<string>();
	#dwellMs: Record<string, number> = {};

	constructor() {
		const data = load();
		this.likedTitles = data.likedTitles;
		this.clickthroughs = data.clickthroughs;
		this.tokenWeights = data.tokenWeights;
		this.#engaged = new Set(data.engagedTitles);
		this.#dwellMs = data.dwellMsByTitle;
	}

	isLiked(title: string): boolean {
		return this.likedTitles.includes(title);
	}

	toggleLike(article: Article): void {
		if (this.isLiked(article.title)) {
			this.likedTitles = this.likedTitles.filter((t) => t !== article.title);
			this.#bumpTokens(article, -FEED.likeTokenWeight);
		} else {
			this.likedTitles = [...this.likedTitles, article.title];
			this.#bumpTokens(article, FEED.likeTokenWeight);
		}
		this.#save();
	}

	recordClickthrough(title: string): void {
		if (!this.clickthroughs.includes(title)) {
			this.clickthroughs = [...this.clickthroughs, title];
			this.#save();
		}
	}

	/** Accumulate dwell time; once an article crosses the threshold, count it lightly. */
	recordDwell(article: Article, ms: number): void {
		const next = (this.#dwellMs[article.title] ?? 0) + ms;
		this.#dwellMs[article.title] = next;
		if (next >= FEED.dwellThresholdMs && !this.#engaged.has(article.title)) {
			this.#engaged.add(article.title);
			this.#bumpTokens(article, FEED.dwellTokenWeight);
		}
		this.#save();
	}

	reset(): void {
		this.likedTitles = [];
		this.clickthroughs = [];
		this.tokenWeights = {};
		this.#engaged = new Set();
		this.#dwellMs = {};
		this.#save();
	}

	#bumpTokens(article: Article, delta: number): void {
		const tokens = new Set(tokenize(`${article.title} ${article.description ?? ''}`));
		const next = { ...this.tokenWeights };
		for (const token of tokens) {
			const value = (next[token] ?? 0) + delta;
			if (value <= 0) delete next[token];
			else next[token] = value;
		}
		this.tokenWeights = next;
	}

	#save(): void {
		if (!browser) return;
		const data: Persisted = {
			likedTitles: this.likedTitles,
			clickthroughs: this.clickthroughs,
			engagedTitles: [...this.#engaged],
			tokenWeights: this.tokenWeights,
			dwellMsByTitle: this.#dwellMs
		};
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
		} catch {
			// localStorage full or unavailable — degrade silently, engagement is best-effort.
		}
	}
}

export const profile = new EngagementProfile();
