import type { Candidate } from '$lib/wikipedia/types';
import type { EngineContext } from './types';
import { FEED } from './config';
import { isPolitical } from './politics';
import { tokenize } from './tokens';

/** DF-discounted token weight — w / (1 + ln(1 + df)). Same form as TF-IDF's IDF. */
export function dfWeight(weight: number, df: number): number {
	return weight / (1 + Math.log(1 + df));
}

/**
 * Score a single candidate as the next step. Pure: same inputs -> same output.
 *
 * Returns -Infinity for candidates we must never pick (already seen, disambiguation),
 * so callers can filter them out uniformly.
 */
export function scoreCandidate(candidate: Candidate, ctx: EngineContext): number {
	if (ctx.seenTitles.has(candidate.title)) return -Infinity;
	if (candidate.isDisambiguation) return -Infinity;

	const tokens = tokenize(`${candidate.title} ${candidate.description ?? ''}`);

	let relevance = 0;
	let overlap = 0;
	for (const token of tokens) {
		const weight = ctx.tokenWeights[token] ?? 0;
		const df = ctx.tokenDocFreq[token] ?? 0;
		relevance += dfWeight(weight, df);
		if (ctx.recentTokens.has(token)) overlap += 1;
	}

	let score = FEED.base;
	// tanh(x/2) softens the squash: one matched token gives ~0.46 of max instead of 0.76
	// so moderate interest doesn't immediately dominate the score.
	score += FEED.relevanceWeight * Math.tanh(relevance / 2);
	score += overlap * FEED.varietyPenalty;
	if (candidate.thumbnail) score += FEED.imageBonus;
	if (candidate.relation === 'related') score += FEED.relatedPenalty;

	// Prominence: links earlier in the article (lead section) are the real rabbit-hole
	// connections. Exponential decay so the first handful get a strong, tapering boost.
	const position = candidate.position ?? FEED.positionHalfLife;
	score += FEED.positionWeight * Math.exp(-position / FEED.positionHalfLife);

	// Dampen politics, matching title + description + (when present) categories.
	const categories = candidate.categories ?? [];
	const blob = `${candidate.title} ${candidate.description ?? ''} ${categories.join(' ')}`;
	if (isPolitical(blob)) score += FEED.politicalPenalty;

	return score;
}
