import type { Candidate } from '$lib/wikipedia/types';
import type { EngineContext, Selection } from './types';
import { FEED } from './config';
import { classifyDirection, type TangentDirection } from './directions';
import { categoryAffinity, coherence, runVariety, scoreCandidate } from './score';
import { isPolitical } from './politics';
import { candidateText, intrigue } from './taste';

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
	temperature: number = FEED.temperature
): Candidate {
	const top = ranked[0].selectionScore;
	const weights = ranked.map((s) => Math.exp((s.selectionScore - top) / temperature));
	return ranked[weightedIndex(weights, rng)].candidate;
}

/**
 * Probability that this pick breaks the run for a tangent.
 *
 * Zero until the run has served runMinLength cards, then the ramp — with 1 at the
 * end as the anti-orbit guarantee (coherence bonuses strengthen gravity wells, so
 * termination must not stay probabilistic forever). The session's FIRST run
 * (runDepth === stepIndex: no boundary has occurred since the seed) breaks at
 * exactly runMinLength, so a first session reliably meets a tangent at card 4 —
 * the moment that shows what the product is.
 */
function breakProbability(ctx: EngineContext): number {
	const past = ctx.runDepth - FEED.runMinLength;
	if (past < 0) return 0;
	if (ctx.runDepth === ctx.stepIndex) return 1;
	return FEED.runBreakRamp[Math.min(past, FEED.runBreakRamp.length - 1)];
}

/**
 * The gated tangent pool: candidates with a strong hook, enough base quality
 * after the break-step variety penalty (which sinks the neighborhood the run
 * just covered), and low political risk, ranked by hook-boosted score.
 *
 * Eligibility is filtered BEFORE any cap. Filtering after would let hookless
 * high scorers (strong relevance/position, zero intrigue) occupy the capped slots
 * and then be discarded — starving out eligible hooky candidates further down and
 * silently killing the tangent the break meant to fire. The same logic keeps the
 * surpriseTopK cap OUT of this function: capping before the direction partition
 * would starve directional pools whose members rank below the global top-K.
 */
function tangentGated(breakScored: Ranked[]): Ranked[] {
	return breakScored
		.filter((s) => s.selectionScore >= FEED.surpriseFloor)
		.map((s) => ({ s, hook: intrigue(s.candidate) }))
		.filter(
			({ s, hook }) =>
				hook >= FEED.surpriseIntrigueFloor && !isPolitical(candidateText(s.candidate))
		)
		.map(({ s, hook }) => ({
			...s,
			selectionScore: s.selectionScore + FEED.surpriseIntrigueBoost * hook
		}))
		.sort((a, b) => b.selectionScore - a.selectionScore);
}

/**
 * Split the gated tangent pool by direction and choose which pool this break
 * jumps from (docs/specs/2026-07-19-directional-tangents-design.md): a tangent
 * that holds one nameable dimension of the run (same era elsewhere, same place
 * another time, a shared thread) reads as a curated page-turn; the undirected
 * wild pool — today's behavior — stays in the mix so serendipity survives.
 *
 * One rng roll covers both decisions (wild-vs-directed, then which direction),
 * so the tangent path consumes a constant number of rng calls regardless of
 * what the partition finds.
 */
function chooseTangentPool(
	gated: Ranked[],
	ctx: EngineContext
): { pool: Ranked[]; direction?: TangentDirection } {
	const wild = gated.slice(0, FEED.surpriseTopK);
	const byDirection = new Map<TangentDirection, Ranked[]>();
	for (const s of gated) {
		const d = classifyDirection(s.candidate, ctx);
		if (!d) continue;
		const pool = byDirection.get(d) ?? [];
		// `gated` arrives sorted, so each pool is its direction's top-K by rank.
		if (pool.length < FEED.surpriseTopK) pool.push(s);
		byDirection.set(d, pool);
	}

	const available: { direction: TangentDirection; pool: Ranked[] }[] = [];
	for (const direction of ['era', 'place', 'theme'] as const) {
		const pool = byDirection.get(direction);
		if (pool && pool.length >= FEED.directionMinPool) available.push({ direction, pool });
	}

	const roll = ctx.rng();
	if (available.length === 0 || roll < FEED.directionWildShare) return { pool: wild };
	const span = (roll - FEED.directionWildShare) / (1 - FEED.directionWildShare);
	return available[Math.min(Math.floor(span * available.length), available.length - 1)];
}

/**
 * The running foot: the highest-intrigue eligible candidate the pick left behind.
 * A UJBR page-bottom fact — offered to clients as a one-line marginalia between
 * cards, tappable as a low-stakes tangent invitation. Deterministic (no rng), so
 * web and server offer the same foot for the same pool. Clients own cadence and
 * dedupe; the engine just surfaces the best runner-up, or nothing.
 */
function footCandidate(scored: Scored[], pickedTitle: string): Candidate | undefined {
	let best: { candidate: Candidate; hook: number } | undefined;
	for (const s of scored) {
		if (s.candidate.title === pickedTitle) continue;
		const hook = intrigue(s.candidate);
		if (hook < FEED.surpriseIntrigueFloor) continue;
		if (isPolitical(candidateText(s.candidate))) continue;
		if (!best || hook > best.hook) best = { candidate: s.candidate, hook };
	}
	return best?.candidate;
}

/**
 * Choose the next article from a candidate pool.
 *
 * The feed moves in runs: while the run is young (runDepth < runMinLength, or the
 * break roll misses), candidates sharing tokens/categories with the run so far get
 * coherence bonuses — the pick stays in the neighborhood. Once the break ramp
 * fires (never when ctx.noSurprise), the whole run's tokens become a variety
 * penalty instead and the pick is a TANGENT from the hook-gated pool; if that
 * pool is too shallow, the break falls through to a drift pick — best candidate
 * outside the neighborhood, no jump — and the run resets either way, so a thin
 * pool can never trap the feed in an orbit.
 *
 * Returns null only when nothing is eligible (true dead end).
 */
export function selectNext(candidates: Candidate[], ctx: EngineContext): Selection | null {
	const pool = eligible(candidates, ctx);
	if (pool.length === 0) return null;

	const scored: Scored[] = pool.map((candidate) => ({
		candidate,
		score: scoreCandidate(candidate, ctx)
	}));

	// One rng call per pick regardless of outcome, so call sequences (and therefore
	// reproducibility in the sim) don't depend on the run phase.
	const roll = ctx.rng();
	const breaking = !ctx.noSurprise && roll < breakProbability(ctx);

	const withFoot = (
		candidate: Candidate,
		surprised: boolean,
		runReset: boolean,
		direction?: TangentDirection
	): Selection => ({
		candidate,
		surprised,
		runReset,
		direction,
		foot: footCandidate(scored, candidate.title)
	});

	if (breaking) {
		const breakScored: Ranked[] = scored
			.map((s) => ({ ...s, selectionScore: s.score + runVariety(s.candidate, ctx) }))
			.sort((a, b) => b.selectionScore - a.selectionScore);

		const gated = tangentGated(breakScored);
		if (gated.length >= FEED.surpriseMinPool) {
			const { pool, direction } = chooseTangentPool(gated, ctx);
			return withFoot(
				pickWeighted(pool, ctx.rng, FEED.surpriseTemperature),
				true,
				true,
				direction
			);
		}

		// Drift fall-through: no jump worth taking, but still leave the neighborhood
		// (variety stays applied) and start a new run.
		return withFoot(pickWeighted(breakScored.slice(0, FEED.topK), ctx.rng), false, true);
	}

	// In-run pick: coherence pulls toward the run's neighborhood.
	const ranked: Ranked[] = scored
		.map((s) => ({
			...s,
			selectionScore:
				s.score +
				FEED.coherenceWeight * coherence(s.candidate, ctx) +
				FEED.categoryAffinityWeight * categoryAffinity(s.candidate, ctx)
		}))
		.sort((a, b) => b.selectionScore - a.selectionScore);

	return withFoot(pickWeighted(ranked.slice(0, FEED.topK), ctx.rng), false, false);
}
