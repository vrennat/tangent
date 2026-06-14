import type { Candidate } from '$lib/wikipedia/types';
import type { EngineContext } from './types';
import { FEED } from './config';
import { isPolitical } from './politics';
import { intrigue, tasteAffinity } from './taste';
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

/** Polity headword — a country / state / dependency. Continent names in these read as
 *  *location* ("Country in East Asia"), never as the subject, so this gates the
 *  geographic-abstraction test below: "South Africa" (country) survives while "Southern
 *  Africa" (region) does not. */
const POLITY = /\b(countr(y|ies)|nation|sovereign state|U\.S\. state|state of|part of)\b/i;
/** Description whose subject is fundamentally "[a] region / subregion / continent",
 *  optionally led by a compass direction ("Northern region of…", "Subregion of…"). */
const REGION_HEAD =
	/^(the |a )?(large )?(north|south|east|west|central)(ern)?\s+region\b|^(the |a )?(large )?(geographical |geographic )?(sub)?regions?\b|^(the )?continent\b/i;
/** A bare "<Direction> <Continent>" title (e.g. "Eastern Europe", whose Wikidata
 *  description is often empty). Continent names are matched here only as the *whole*
 *  title, so non-continent "North Korea" / "Northern Ireland" and polity-gated
 *  "South Africa" are untouched. */
const CONTINENTAL_TITLE =
	/^(north|south|east|west|central|northern|southern|eastern|western|northwestern|northeastern|southwestern|southeastern)\s+(europe|asia|africa|america|americas|oceania|antarctica)$/i;
/** The region's container is a whole continent / ocean. Continent names are matched
 *  only as the *scope* of a region head (right after of/in/across), never bare, so a
 *  country scope ("Region of Italy", "…of Russia…") keeps the region concrete. */
const CONTINENTAL_SCOPE =
	/\b(of|in|across)\s+(the\s+)?(north(ern)?|south(ern)?|east(ern)?|west(ern)?|central\s+)*\s*(continents?|europe(an)?|asia(n)?|africa(n)?|oceania|antarctica|americas|america|eurasia|sahara|pacific ocean|arctic)\b/i;

/**
 * A continental abstraction rung — the "X is a region of [continent]" parents a position
 * ranking climbs into (United Kingdom → Northwestern Europe → Northern Europe → Continent).
 * The geographic analogue of ABSTRACT_LEAD: NAMED_TITLE wrongly rewards "Northern Europe"
 * (+0.5) as a proper noun and ABSTRACT_LEAD never covered regions, so the climb went
 * unchecked. Boundary verified against real Wikidata descriptions: continental regions
 * fall, countries/states and sub-continental named regions (Tuscany, Siberia, New England)
 * stay; continental-scope named regions (Scandinavia, Balkans, Polynesia) fall knowingly —
 * the relevance taper in scoreCandidate restores them for a geography-interested reader.
 */
function isContinentalRegion(title: string, desc: string): boolean {
	if (POLITY.test(desc)) return false;
	if (CONTINENTAL_TITLE.test(title)) return true;
	if (!REGION_HEAD.test(desc)) return false;
	// A region descriptor with no container clause is the bare abstraction itself
	// ("Geographical region", "Continent"); a scoped one is a sink only when the
	// container is a whole continent/ocean, not a country ("Region of Italy" stays).
	if (!/\b(of|in|across)\b/i.test(desc)) return true;
	return CONTINENTAL_SCOPE.test(desc);
}

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
	if (isContinentalRegion(title, desc)) s -= 1.2; // continent / region-of-continent rungs

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
	let avoidance = 0;
	let overlap = 0;
	for (const token of tokens) {
		const weight = ctx.tokenWeights[token] ?? 0;
		const avoidWeight = ctx.tokenAvoidWeights[token] ?? 0;
		const df = ctx.tokenDocFreq[token] ?? 0;
		relevance += dfWeight(weight, df);
		avoidance += dfWeight(avoidWeight, df);
		if (ctx.recentTokens.has(token)) overlap += 1;
	}

	let score = FEED.base;
	// tanh(x/2) softens the squash: one matched token gives ~0.46 of max instead of 0.76
	// so moderate interest doesn't immediately dominate the score.
	score += FEED.relevanceWeight * Math.tanh(relevance / 2);
	score -= FEED.avoidanceWeight * Math.tanh(avoidance / 2);
	score += overlap * FEED.varietyPenalty;
	if (candidate.thumbnail) score += FEED.imageBonus;
	if (candidate.relation === 'related') score += FEED.relatedPenalty;
	score += FEED.tasteWeight * tasteAffinity(candidate, ctx.taste);
	score += FEED.intrigueWeight * intrigue(candidate);

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

/**
 * A user-free context for judging a candidate purely on its own merits. Everything keyed
 * to a reader (interest/avoidance vectors, taste, history) is empty/neutral, so
 * scoreCandidate collapses to its intrinsic terms — specificity + intrigue + image,
 * minus the politics penalty — plus a constant position offset that cancels in any sort.
 */
const NEUTRAL_CONTEXT: EngineContext = {
	tokenWeights: {},
	tokenAvoidWeights: {},
	tokenDocFreq: {},
	taste: 'balanced',
	recentTokens: new Set(),
	seenTitles: new Set(),
	noSurprise: true,
	stepIndex: 0,
	rng: () => 0
};

/**
 * Rank a pool of candidates as standalone starting points, best first. Reuses
 * scoreCandidate's intrinsic judgment so "good for Tangent" has a single definition,
 * and removes the two kinds we never want a rabbit hole to *begin* on:
 *
 *  - disambiguation pages (no there there), and
 *  - the political / authoritarian hubs the live feed already dampens (-500). Here it's a
 *    clean removal rather than a penalty: a seed surface has plenty of alternatives, and
 *    seeding on such a hub would make the very next /api/next step yank hard away from it.
 *
 * Pure: candidates should share a uniform `position` so ordering reflects merit, not the
 * arbitrary order they arrived in.
 */
export function rankSeeds(candidates: Candidate[]): Candidate[] {
	return candidates
		.filter((c) => !c.isDisambiguation)
		.filter(
			(c) => !isPolitical(`${c.title} ${c.description ?? ''} ${(c.categories ?? []).join(' ')}`)
		)
		.map((candidate) => ({ candidate, score: scoreCandidate(candidate, NEUTRAL_CONTEXT) }))
		.sort((a, b) => b.score - a.score)
		.map((entry) => entry.candidate);
}
