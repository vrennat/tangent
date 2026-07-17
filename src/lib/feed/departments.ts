import type { Candidate } from '$lib/wikipedia/types';
import { candidateText } from './taste';

/**
 * Recurring "columns" a tangent card can be filed under — the Uncle John's
 * Bathroom Reader move: a named department turns a topic jump into a curated
 * page-turn instead of an algorithmic lurch.
 *
 * Precision beats coverage: a mislabeled department reads worse than the plain
 * "Tangent" fallback, so patterns are deliberately narrow. Measured against the
 * sim's 3,761 real tangent landings (2026-07-17): ~20% labeled, samples
 * hand-checked. Priority-ordered, first match wins — Deep Time outranks
 * Disasters so "Cambrian explosion" files as an epoch, not an accident.
 */
type Department = {
	name: string;
	pattern: RegExp;
	/**
	 * Match title+description only, ignoring categories. Deep Time needs this:
	 * living taxa carry paleontological categories ("Cambrian first appearances"
	 * sits on extant phyla), which would file ordinary animals under geology.
	 */
	titleDescOnly?: boolean;
};

const DEPARTMENTS: readonly Department[] = [
	{
		name: 'Origins',
		pattern: /\b(etymolog\w*|origin of|originated as|named after|coined|first attested|derives its name)\b/i
	},
	{
		name: 'Hoaxes & Blunders',
		pattern: /\b(hoax\w*|forger\w*|frauds?|counterfeit\w*|impostors?|blunders?|fiascos?)\b/i
	},
	{
		// Narrow on purpose: "executed"/"assassinated" alone would file crucifixions
		// and royal beheadings here — technically deaths, tonally a disaster.
		name: 'Strange Deaths',
		pattern: /\b(unsolved|unusual|mysterious|unexplained) deaths?\b/i
	},
	{
		name: 'Deep Time',
		pattern:
			/\b(extinct|prehistoric|fossil\w*|pal(a?)eo\w+|\w+ozoic|\w+ocene|cretaceous|jurassic|triassic|cambrian|devonian|permian|ordovician|silurian|carboniferous|mass extinction|geologic\w*)\b/i,
		titleDescOnly: true
	},
	{
		name: 'Disasters',
		pattern:
			/\b(disasters?|shipwrecks?|sinking of|earthquakes?|eruptions?|great fire|explosions?|air crash\w*|derailment|avalanche|famine|plague)\b/i
	},
	{
		name: 'Lost & Found',
		pattern:
			/\b(lost|missing|disappear\w*|rediscover\w*|unearthed|excavat\w*|ruins of|buried|sunken)\b/i
	},
	{
		name: 'Firsts & Failures',
		pattern:
			/\b(first (ever|woman|man|person|flight|expedition|voyage)|failed|failures?|never (built|completed|finished)|prototypes?)\b/i
	}
];

/** The department a tangent card files under, or null for the plain divider. */
export function department(candidate: Candidate): string | null {
	const full = candidateText(candidate);
	const titleDesc = `${candidate.title} ${candidate.description ?? ''}`;
	for (const d of DEPARTMENTS) {
		if (d.pattern.test(d.titleDescOnly ? titleDesc : full)) return d.name;
	}
	return null;
}
