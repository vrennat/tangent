/**
 * Sensitive-hub detection for feed dampening.
 *
 * Cold-start rabbit holes slide into two attractors: (1) presidential elections and
 * party politics, and (2) the WWII / Nazi / authoritarian cluster (simulation: ~20%
 * of cold-start walks reach the Soviet/WWII basin, ~3% the Hitler/Nazi core within
 * 30 steps). The second one sailed straight past the old electoral-only list — real
 * candidates dodge every stem ("Adolf Hitler" = "Dictator of Germany 1933–1945",
 * "Nazi Germany" cats = Fascist/Nazism/Totalitarian) — while specificity() actively
 * rewarded their concrete date ranges. We match a candidate's title + description +
 * categories against these stems and apply a heavy (but non-blocking) score penalty
 * so neither attractor dominates the rabbit hole.
 *
 * Stems are deliberately broad ("politic" catches political/politician/politics,
 * "president" catches presidential/presidency). Tune here.
 */
export const POLITICAL_STEMS = [
	'election',
	'electoral',
	'president',
	'politic', // political, politician, politics, political party
	'senat', // senate, senator
	'congress',
	'parliament',
	'governor',
	'prime minister',
	'vice president',
	'ballot',
	'referend', // referendum, referenda
	'legislat', // legislature, legislator, legislative
	'political campaign',
	'democratic party',
	'republican party'
] as const;

/**
 * The WWII / Nazi / authoritarian-regime attractor. Caught via title, Wikidata
 * description, OR category, so Hitler ("dictator"), Nazi Germany ("nazi"/"fascis"/
 * "totalitarian"), the Soviet Union ("totalitarian"), and WWI/WWII ("world war") all
 * sink. "third reich" (not bare "reich") avoids dampening composers/surnames like
 * Steve Reich; no bare "war" (every battle is legitimately interesting) — only the
 * world-war hubs.
 */
export const AUTHORITARIAN_STEMS = [
	'nazi',
	'hitler',
	'fascis', // fascism, fascist
	'holocaust',
	'wehrmacht',
	'gestapo',
	'third reich',
	'dictator', // dictatorship; also Hitler/Stalin/Mussolini Wikidata descriptions
	'totalitarian',
	'genocide',
	'world war' // World War I/II, "World wars" category
] as const;

const PATTERN = new RegExp(`\\b(${[...POLITICAL_STEMS, ...AUTHORITARIAN_STEMS].join('|')})`, 'i');

/** True if the text reads as a sensitive hub the feed shouldn't steer into
 *  (elections/presidents/parties, or the WWII/Nazi/authoritarian cluster). */
export function isPolitical(text: string): boolean {
	return PATTERN.test(text);
}
