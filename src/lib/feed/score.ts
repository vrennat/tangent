import type { Candidate } from '$lib/wikipedia/types';
import type { EngineContext } from './types';
import { FEED } from './config';
import { tokenize } from './tokens';

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
		relevance += ctx.tokenWeights[token] ?? 0;
		if (ctx.recentTokens.has(token)) overlap += 1;
	}

	let score = FEED.base;
	// tanh squashes the interest sum into [-1, 1] so a few hot tokens can't dominate.
	score += FEED.relevanceWeight * Math.tanh(relevance);
	score += overlap * FEED.varietyPenalty;
	if (candidate.thumbnail) score += FEED.imageBonus;
	if (candidate.relation === 'related') score += FEED.relatedPenalty;

	return score;
}
