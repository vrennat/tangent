import type { Candidate } from '$lib/wikipedia/types';
import type { EngineContext, Selection } from './types';
import { FEED } from './config';
import { scoreCandidate } from './score';

/** Candidates we're allowed to land on at all. */
function eligible(candidates: Candidate[], ctx: EngineContext): Candidate[] {
	return candidates.filter((c) => !c.isDisambiguation && !ctx.seenTitles.has(c.title));
}

/** Weighted-random index into `weights` (assumed non-negative, not all zero). */
function weightedIndex(weights: number[], rng: () => number): number {
	const total = weights.reduce((a, b) => a + b, 0);
	let r = rng() * total;
	for (let i = 0; i < weights.length; i++) {
		r -= weights[i];
		if (r <= 0) return i;
	}
	return weights.length - 1;
}

/**
 * Choose the next article from a candidate pool.
 *
 * Two modes:
 *  - Surprise (probability `surpriseEpsilon`): pick uniformly at random among
 *    eligible candidates, deliberately ignoring relevance to escape filter bubbles.
 *  - Default: score everyone, keep the top-K, then softmax-weighted-random among
 *    them so the feed favors strong matches without being robotically predictable.
 *
 * Returns null only when nothing is eligible (true dead end).
 */
export function selectNext(candidates: Candidate[], ctx: EngineContext): Selection | null {
	const pool = eligible(candidates, ctx);
	if (pool.length === 0) return null;

	if (ctx.rng() < FEED.surpriseEpsilon) {
		const candidate = pool[Math.floor(ctx.rng() * pool.length)];
		return { candidate, surprised: true };
	}

	const scored = pool
		.map((candidate) => ({ candidate, score: scoreCandidate(candidate, ctx) }))
		.sort((a, b) => b.score - a.score)
		.slice(0, FEED.topK);

	// Softmax over the top scores, shifted by the max for numerical stability.
	const top = scored[0].score;
	const weights = scored.map((s) => Math.exp((s.score - top) / FEED.temperature));
	const idx = weightedIndex(weights, ctx.rng);

	return { candidate: scored[idx].candidate, surprised: false };
}
