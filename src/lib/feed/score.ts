import type { Candidate } from '$lib/wikipedia/types';
import type { EngineContext } from './types';
import { FEED } from './config';
import { isPolitical } from './politics';
import { tokenize } from './tokens';

/** DF-discounted token weight — w / (1 + ln(1 + df)). Same form as TF-IDF's IDF. */
export function dfWeight(weight: number, df: number): number {
	return weight / (1 + Math.log(1 + df));
}

/** Title shape of a specific named entity: 2+ capitalized words, an identifier number,
 *  or a court-case "v." — "New Orleans", "Cygnus X-1", "Miranda v. Arizona". */
const NAMED_TITLE = /\b[A-Z][a-z]+\b.*\b[A-Z][a-z]+|\d| v\. /;

/** Wikidata-description openings that mark a bare definitional abstraction — the
 *  "sinks" a position-only ranking climbs into (Order=Taxonomic rank, Language=
 *  Structured system…, Science=The study…). Deliberately narrow: taxonomic *parents*
 *  ("Class of mollusks", "Genus of…") are good laterals, left to a future graph layer. */
const ABSTRACT_LEAD =
	/^(taxonomic rank|basic (taste|unit)|aspect of|study of|branch of|field of|the study|academic discipline|structured system|system of communication|something that exists|one or more words|amount of matter|period of time|measure of|unit of|set of|natural physical (entity|object))/i;

/** Enumeration / bare-chronology titles ("List of…", "Timeline of…", "1994"). */
const LISTY_TITLE = /^(lists? of|outline of|index of|timeline of|glossary of)\b|^\d{3,4}(s|\b)/i;

/** Description carries a concrete year (a lifespan, a dated event). */
const HAS_YEAR = /\b1\d{3}\b|\b20\d{2}\b/;
/** Description carries a dated era. BC/AD are case-sensitive so "ad hoc" / "ad-supported"
 *  don't read as era markers; "century" is the lowercase form descriptions actually use. */
const HAS_ERA = /\bBC\b|\bAD\b|\bcentur(y|ies)\b/;

/**
 * Intrinsic specificity of a candidate, a signed signal in roughly [-2, +2].
 * Positive = concrete/named/dated (people, places, events, works); negative = generic
 * abstraction or enumeration. Pure over title + description — no extra I/O.
 *
 * Counters the position-ranking drift toward generality: the earliest lead links are
 * always the broadest "X is a [category]" parents, so without this the rabbit hole
 * climbs the abstraction ladder to its root.
 */
export function specificity(candidate: Candidate): number {
	const desc = candidate.description ?? '';
	const title = candidate.title;
	let s = 0;

	// Concreteness nudges (kept small: a strong year bonus turns the feed into an
	// absorbing well of dated war history — every WWII article carries a year).
	if (HAS_YEAR.test(desc)) s += 0.6; // a year -> a life, a dated event
	if (HAS_ERA.test(desc)) s += 0.4;
	if (NAMED_TITLE.test(title)) s += 0.5;

	if (ABSTRACT_LEAD.test(desc)) s -= 1;
	if (LISTY_TITLE.test(title)) s -= 1.2;

	return s;
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

	// Pull toward vivid specifics, away from the abstraction sinks a position-only
	// ranking climbs into (Entity / Language / Science). Tapered by relevance (1/(1+r)):
	// it steers hardest at cold start, where it's the only signal, and steps aside once
	// the user has expressed interest — otherwise it would demote the "Branch of
	// linguistics" / "Study of X" articles a linguistics fan actually wants. See specificity().
	score += (FEED.specificityWeight * specificity(candidate)) / (1 + relevance);

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
