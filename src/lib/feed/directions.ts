import type { Candidate } from '$lib/wikipedia/types';
import { categoryTokenSet } from './tokens';

/**
 * Directional tangents (docs/specs/2026-07-19-directional-tangents-design.md):
 * a tangent that holds one dimension of the run fixed and varies another reads
 * as a curated page-turn; one that shares nothing nameable reads as a lurch.
 *
 *  - `era`:   same time bucket, provably different place — "Meanwhile, elsewhere"
 *  - `place`: same place, provably different time — "Same place, another time"
 *  - `theme`: neither, but a meaningful category thread — "Pulling the thread"
 *
 * Precision beats coverage, same rule as departments: a wrong direction label
 * reads worse than the plain wild-card tangent, so every detector is strict and
 * unlabelable candidates simply stay wild.
 */
export type TangentDirection = 'era' | 'place' | 'theme';

/** Ordinal century ("17th century", "1st-century BC") in prose or category names. */
const CENTURY = /\b(\d{1,2})(?:st|nd|rd|th)[-\s]centur(?:y|ies)(\s+bc)?/gi;
/** Four-digit AD year (1000–2099) — matches HAS_YEAR's judgment that 3-digit
 *  "years" are usually identifiers, not dates. */
const AD_YEAR = /\b(1\d{3}|20\d{2})\b/g;
/** A year explicitly marked BC. */
const BC_YEAR = /\b(\d{1,4})\s*bc\b/gi;
/** A bare decade ("1970s"), the form category names use. */
const DECADE = /\b(1[89]\d0|20\d0)s\b/g;

function centuryOf(year: number): number {
	return Math.floor((year - 1) / 100) + 1;
}

/** Bucket one AD year: decade when >= 1800, century before that. The felt size
 *  of "same time" scales with distance — 1914 vs 1999 is not "meanwhile", but
 *  1560s vs 1580s is. */
function bucketYear(year: number): string {
	return year >= 1800 ? `${Math.floor(year / 10) * 10}s` : `${centuryOf(year)}c`;
}

/**
 * Time buckets for a candidate, from its description and category names.
 * Titles are deliberately excluded: a number in a title is an identifier
 * ("Boeing 747", "Shenzhou 23") far more often than a date.
 */
export function eraBuckets(candidate: Pick<Candidate, 'description' | 'categories'>): Set<string> {
	const out = new Set<string>();
	const texts = [candidate.description ?? '', ...candidate.categories.map((c) => c.replace(/^Category:/, ''))];
	for (const text of texts) {
		for (const m of text.matchAll(BC_YEAR)) out.add(`${centuryOf(Number(m[1]))}c-bc`);
		// Strip BC years before the AD pass so "1200 BC" doesn't double as AD 1200.
		const ad = text.replace(BC_YEAR, ' ');
		for (const m of ad.matchAll(AD_YEAR)) out.add(bucketYear(Number(m[1])));
		for (const m of ad.matchAll(DECADE)) out.add(`${m[1]}s`);
		for (const m of text.matchAll(CENTURY)) out.add(`${Number(m[1])}c${m[2] ? '-bc' : ''}`);
	}
	return out;
}

/**
 * Flat gazetteer: countries, continents/oceans/major regions, notable islands,
 * and the historical polities that dominate history categories. Matched with
 * word boundaries against lowercased category names + description — never the
 * title ("Michael Jordan" must not read as Jordan). Bare "guinea" is omitted
 * (guinea pig); its compound forms are kept. Historical polities are their own
 * tokens (a Persia run won't place-match an Iran run) — accepted for v1.
 */
const PLACES: readonly string[] = [
	// continents, oceans, regions
	'africa', 'europe', 'asia', 'oceania', 'antarctica', 'north america', 'south america',
	'central america', 'latin america', 'caribbean', 'middle east', 'southeast asia', 'east asia',
	'south asia', 'central asia', 'western europe', 'eastern europe', 'scandinavia', 'balkans',
	'mediterranean', 'arctic', 'pacific ocean', 'atlantic ocean', 'indian ocean', 'sahara',
	'siberia', 'patagonia', 'polynesia', 'melanesia', 'anatolia', 'iberian peninsula',
	'himalayas', 'andes', 'alps',
	// countries
	'afghanistan', 'albania', 'algeria', 'angola', 'argentina', 'armenia', 'australia', 'austria',
	'azerbaijan', 'bangladesh', 'belarus', 'belgium', 'bolivia', 'bosnia', 'botswana', 'brazil',
	'bulgaria', 'burkina faso', 'burma', 'cambodia', 'cameroon', 'canada', 'chad', 'chile',
	'china', 'colombia', 'congo', 'costa rica', 'croatia', 'cuba', 'cyprus', 'czech republic',
	'czechia', 'denmark', 'ecuador', 'egypt', 'el salvador', 'england', 'eritrea', 'estonia',
	'ethiopia', 'fiji', 'finland', 'france', 'georgia', 'germany', 'ghana', 'greece', 'greenland',
	'guatemala', 'haiti', 'honduras', 'hungary', 'iceland', 'india', 'indonesia', 'iran', 'iraq',
	'ireland', 'israel', 'italy', 'ivory coast', 'jamaica', 'japan', 'jordan', 'kazakhstan',
	'kenya', 'kosovo', 'kuwait', 'laos', 'latvia', 'lebanon', 'liberia', 'libya', 'lithuania',
	'luxembourg', 'madagascar', 'malawi', 'malaysia', 'mali', 'malta', 'mauritania', 'mexico',
	'moldova', 'monaco', 'mongolia', 'montenegro', 'morocco', 'mozambique', 'myanmar', 'namibia',
	'nepal', 'netherlands', 'new zealand', 'nicaragua', 'niger', 'nigeria', 'north korea',
	'north macedonia', 'norway', 'oman', 'pakistan', 'panama', 'papua new guinea', 'paraguay',
	'peru', 'philippines', 'poland', 'portugal', 'qatar', 'romania', 'russia', 'rwanda',
	'saudi arabia', 'scotland', 'senegal', 'serbia', 'sierra leone', 'singapore', 'slovakia',
	'slovenia', 'somalia', 'south africa', 'south korea', 'south sudan', 'spain', 'sri lanka',
	'sudan', 'sweden', 'switzerland', 'syria', 'taiwan', 'tajikistan', 'tanzania', 'thailand',
	'tibet', 'tunisia', 'turkey', 'turkmenistan', 'uganda', 'ukraine', 'united arab emirates',
	'united kingdom', 'united states', 'uruguay', 'uzbekistan', 'venezuela', 'vietnam', 'wales',
	'yemen', 'zambia', 'zimbabwe',
	// notable islands / territories
	'falkland islands', 'hawaii', 'sicily', 'sardinia', 'corsica', 'crete', 'tasmania', 'alaska',
	'puerto rico', 'hong kong', 'macau',
	// historical polities
	'roman empire', 'byzantine empire', 'ottoman empire', 'soviet union', 'ussr', 'yugoslavia',
	'czechoslovakia', 'prussia', 'austria-hungary', 'persia', 'mesopotamia', 'carthage',
	'babylon', 'phoenicia', 'mughal empire', 'aztec empire', 'inca empire', 'british empire'
];

/** Longest-first alternation so compound names win over their fragments. */
const PLACE_RE = new RegExp(
	`\\b(?:${[...PLACES].sort((a, b) => b.length - a.length).join('|')})\\b`,
	'g'
);

/** Single-word gazetteer entries — used to keep place words out of theme matching. */
const PLACE_WORDS = new Set(PLACES.filter((p) => !p.includes(' ')));

/**
 * Place tokens for a candidate, from category names + description (not the
 * title — see gazetteer note). Tokens are the full matched phrase, lowercased.
 */
export function placeTokens(candidate: Pick<Candidate, 'description' | 'categories'>): Set<string> {
	const out = new Set<string>();
	const texts = [candidate.description ?? '', ...candidate.categories.map((c) => c.replace(/^Category:/, ''))];
	for (const text of texts) {
		for (const m of text.toLowerCase().matchAll(PLACE_RE)) out.add(m[0]);
	}
	return out;
}

/**
 * Category tokens too generic (or too place/era-flavored) to carry a theme on
 * their own. Demonyms are here because the gazetteer doesn't track them — a
 * shared "french" is place-sharing sneaking in under a theme label. Polity
 * furniture (united/states/kingdom/islands…) likewise. "wars", "shipwrecks",
 * "painters" and their kin stay meaningful.
 */
const THEME_STOPLIST = new Set([
	'bc', 'ad', 'century', 'centuries', 'history', 'historical', 'people', 'births', 'deaths',
	'establishments', 'disestablishments', 'involving', 'culture', 'cultural', 'national',
	'international', 'former', 'modern', 'early', 'late', 'ancient', 'united', 'states',
	'kingdom', 'islands', 'republic', 'union', 'american', 'british', 'english', 'french',
	'german', 'italian', 'spanish', 'russian', 'chinese', 'japanese', 'indian', 'roman',
	'greek', 'egyptian', 'soviet'
]);

function isThemeToken(token: string): boolean {
	return !/\d/.test(token) && !THEME_STOPLIST.has(token) && !PLACE_WORDS.has(token);
}

export interface DirectionContext {
	runEras: Set<string>;
	runPlaces: Set<string>;
	runCategories: Set<string>;
}

function intersects(a: Set<string>, b: Set<string>): boolean {
	for (const x of a) if (b.has(x)) return true;
	return false;
}

/**
 * The direction this candidate would travel relative to the run, or null when
 * no single dimension is provably held (wild-card eligible either way).
 *
 * Era and place both require the OTHER dimension to be detectable and disjoint:
 * "meanwhile, elsewhere" is only honest if there is an elsewhere. Sharing both
 * era and place is the run's own neighborhood — not a tangent direction.
 */
export function classifyDirection(
	candidate: Candidate,
	ctx: DirectionContext
): TangentDirection | null {
	const eras = eraBuckets(candidate);
	const places = placeTokens(candidate);
	const sharesEra = intersects(eras, ctx.runEras);
	const sharesPlace = intersects(places, ctx.runPlaces);

	if (sharesEra && sharesPlace) return null;
	if (sharesEra && places.size > 0) return 'era';
	if (sharesPlace && eras.size > 0) return 'place';
	if (!sharesEra && !sharesPlace) {
		for (const t of categoryTokenSet(candidate.categories)) {
			if (ctx.runCategories.has(t) && isThemeToken(t)) return 'theme';
		}
	}
	return null;
}
