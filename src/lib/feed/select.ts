import type { Candidate } from '$lib/wikipedia/types';
import type { EngineContext, Selection } from './types';
import { FEED } from './config';
import { scoreCandidate, specificity } from './score';
import { isPolitical } from './politics';
import { candidateText, intrigue, tasteAffinity } from './taste';

type PaceSlot = (typeof FEED.pacingPattern)[number];
type Scored = { candidate: Candidate; score: number };
type Ranked = Scored & { selectionScore: number };

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

/** Softmax pick over ranked candidates. */
function pickWeighted(
	ranked: Ranked[],
	rng: () => number,
	temperature: number = FEED.temperature,
	surprised = false
): Selection {
	const top = ranked[0].selectionScore;
	const weights = ranked.map((s) => Math.exp((s.selectionScore - top) / temperature));
	const idx = weightedIndex(weights, rng);
	return { candidate: ranked[idx].candidate, surprised };
}

function paceSlot(ctx: EngineContext): PaceSlot {
	const slot =
		ctx.stepIndex < FEED.pacingColdOpen.length
			? FEED.pacingColdOpen[ctx.stepIndex]
			: FEED.pacingPattern[
					(ctx.stepIndex - FEED.pacingColdOpen.length) % FEED.pacingPattern.length
				];
	// A balanced user has no flavor for the taste slot to boost — substitute so the
	// slot isn't a no-op.
	return slot === 'taste' && ctx.taste === 'balanced' ? FEED.pacingBalancedFallback : slot;
}

function pacedScore(scored: Scored, ctx: EngineContext, slot: PaceSlot): number {
	switch (slot) {
		case 'taste':
			return scored.score + FEED.pacingTasteBoost * tasteAffinity(scored.candidate, ctx.taste);
		case 'intrigue':
			return scored.score + FEED.pacingIntrigueBoost * intrigue(scored.candidate);
		case 'specific':
			return scored.score + FEED.pacingSpecificityBoost * Math.max(0, specificity(scored.candidate));
		case 'close':
			return scored.score;
	}
}

function rankedForSlot(scored: Scored[], ctx: EngineContext): Ranked[] {
	const slot = paceSlot(ctx);
	return scored
		.map((s) => ({ ...s, selectionScore: pacedScore(s, ctx, slot) }))
		.sort((a, b) => b.selectionScore - a.selectionScore);
}

/**
 * The surprise pool: mid-tier candidates with a strong hook, enough base quality,
 * and low political risk, ranked by hook-boosted score and capped at surpriseTopK.
 *
 * Eligibility is filtered BEFORE the cap. Filtering after would let hookless
 * high scorers (strong relevance/position, zero intrigue) occupy the capped slots
 * and then be discarded — starving out eligible hooky candidates further down and
 * silently killing surprises the epsilon meant to fire.
 */
function surpriseRanked(scored: Scored[], excludedTitles: Set<string>): Ranked[] {
	return scored
		.filter((s) => !excludedTitles.has(s.candidate.title) && s.score >= FEED.surpriseFloor)
		.map((s) => ({ scored: s, hook: intrigue(s.candidate) }))
		.filter(
			({ scored: s, hook }) =>
				hook >= FEED.surpriseIntrigueFloor && !isPolitical(candidateText(s.candidate))
		)
		.map(({ scored: s, hook }) => ({
			...s,
			selectionScore: s.score + FEED.surpriseIntrigueBoost * hook
		}))
		.sort((a, b) => b.selectionScore - a.selectionScore)
		.slice(0, FEED.surpriseTopK);
}

/**
 * Choose the next article from a candidate pool.
 *
 * Two modes:
 *  - Surprise (probability `surpriseEpsilonSchedule[stepIndex]`, falling back to the
 *    steady-state `surpriseEpsilon`; never when `ctx.noSurprise`): pick from
 *    candidates outside the paced top-K that still have enough base score and a
 *    strong hook/intrigue signal. Falls through when that pool is too shallow.
 *  - Default: score everyone, apply the current pacing slot (close, taste,
 *    intrigue, specific), keep the top-K, then softmax-weighted-random among them.
 *
 * Returns null only when nothing is eligible (true dead end).
 */
export function selectNext(candidates: Candidate[], ctx: EngineContext): Selection | null {
	const pool = eligible(candidates, ctx);
	if (pool.length === 0) return null;

	// Selection order is owned by rankedForSlot / surpriseRanked; no pre-sort needed.
	const scored = pool.map((candidate) => ({ candidate, score: scoreCandidate(candidate, ctx) }));

	const ranked = rankedForSlot(scored, ctx);
	const topKScored = ranked.slice(0, FEED.topK);

	const epsilon = FEED.surpriseEpsilonSchedule[ctx.stepIndex] ?? FEED.surpriseEpsilon;
	if (!ctx.noSurprise && ctx.rng() < epsilon) {
		// Smart surprise: look outside the normal top-K for candidates with a strong
		// hook, enough base quality, and low political risk. Surprise should read as
		// "wait, what?" rather than an unscored random page from the middle.
		const excluded = new Set(topKScored.map((s) => s.candidate.title));
		const surprisePool = surpriseRanked(scored, excluded);

		// If the pool is too shallow, fall through to normal picks — a dud surprise is worse than none.
		if (surprisePool.length >= FEED.surpriseMinPool) {
			return pickWeighted(surprisePool, ctx.rng, FEED.surpriseTemperature, true);
		}
	}

	// Normal path: softmax over top-K.
	if (topKScored.length === 0) return null;
	return pickWeighted(topKScored, ctx.rng);
}
