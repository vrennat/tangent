import type { Candidate } from '$lib/wikipedia/types';

export type TasteId =
	| 'balanced'
	| 'technology'
	| 'oddities'
	| 'culture'
	| 'science'
	| 'history'
	| 'nature'
	| 'people';

type WeightedPattern = readonly [RegExp, number];
type FocusTasteId = Exclude<TasteId, 'balanced'>;

export const TASTE_OPTIONS: readonly { id: TasteId; label: string; description: string }[] = [
	{
		id: 'balanced',
		label: 'Balanced',
		description: 'Keep the tangent broad and let engagement guide it.'
	},
	{
		id: 'technology',
		label: 'Technology',
		description: 'Prefer engineering, computing, inventions, and built systems.'
	},
	{
		id: 'oddities',
		label: 'Oddities',
		description: 'Prefer strange histories, anomalies, legends, and mysteries.'
	},
	{
		id: 'culture',
		label: 'Culture',
		description: 'Prefer art, music, food, language, religion, and media.'
	},
	{
		id: 'science',
		label: 'Science',
		description: 'Prefer research, natural sciences, medicine, and theory.'
	},
	{
		id: 'history',
		label: 'History',
		description: 'Prefer eras, empires, archaeology, wars, and old places.'
	},
	{
		id: 'nature',
		label: 'Nature',
		description: 'Prefer animals, plants, geography, ecosystems, and geology.'
	},
	{
		id: 'people',
		label: 'People',
		description: 'Prefer biographies — leaders, artists, explorers, and notable lives.'
	}
] as const;

const TASTE_IDS = new Set<TasteId>(TASTE_OPTIONS.map((option) => option.id));

const TASTE_PATTERNS: Record<FocusTasteId, WeightedPattern[]> = {
	technology: [
		[
			/\b(technology|technologies|engineering|computer|computing|software|hardware|internet|robotics?|electronics?|semiconductor|telecommunications?|aerospace|spacecraft|cryptography|algorithm|programming|artificial intelligence|machine learning|invention|device|aviation|railway)\b/i,
			1
		],
		[/\b(category:)?(technology|computing|engineering|electronics|software|internet)\b/i, 0.7]
	],
	oddities: [
		[
			/\b(unusual|strange|mysterious|unexplained|paradox|hoax|folklore|legend|urban legend|cryptid|paranormal|occult|anomaly|bizarre|unsolved|lost|secret|miracle)\b/i,
			1
		],
		[/\b(myth|mythology|pseudoscience|conspiracy|world record|curiosity|supernatural)\b/i, 0.7]
	],
	culture: [
		[
			/\b(culture|cultural|art|artist|music|film|cinema|literature|novel|poetry|theatre|theater|cuisine|food|fashion|religion|ritual|festival|language|architecture|museum|subculture|game|sport)\b/i,
			1
		],
		[/\b(category:)?(arts|culture|music|films|literature|religion|languages|food)\b/i, 0.7]
	],
	science: [
		[
			/\b(science|scientific|physics|chemistry|biology|mathematics|astronomy|geology|medicine|medical|neuroscience|evolution|species|genus|ecosystem|experiment|research|theory)\b/i,
			1
		],
		[/\b(category:)?(science|biology|physics|chemistry|astronomy|medicine|mathematics)\b/i, 0.7]
	],
	history: [
		[
			/\b(history|historical|ancient|medieval|archaeology|civilization|empire|kingdom|dynasty|war|battle|revolution|conquest|century|monarch|colony|exploration)\b/i,
			1
		],
		[/\b(category:)?(history|archaeology|empires|wars|battles|civilizations)\b/i, 0.7]
	],
	nature: [
		[
			/\b(animal|plant|species|bird|fish|mammal|reptile|amphibian|insect|tree|forest|river|mountain|island|ocean|marine|geography|ecosystem|fungus|mollusc|wildlife|volcano|earthquake)\b/i,
			1
		],
		[/\b(category:)?(animals|plants|biology|geography|ecosystems|geology|wildlife)\b/i, 0.7]
	],
	people: [
		[
			/\b(biography|born|died|politician|statesman|monarch|king|queen|emperor|empress|president|prime minister|general|admiral|explorer|inventor|philosopher|theologian|novelist|poet|playwright|painter|sculptor|composer|conductor|actor|actress|singer|athlete|activist|revolutionary|saint|aristocrat|nobleman|dynasty|reign)\b/i,
			1
		],
		[/\b(category:)?(\d{3,4} (births|deaths)|people|biography|biographies|writers|artists|musicians|politicians)\b/i, 0.7]
	]
};

const CURIOSITY_PATTERNS: WeightedPattern[] = [
	[
		/\b(unusual|strange|mysterious|unexplained|paradox|hoax|folklore|legend|urban legend|unsolved|lost|secret|bizarre)\b/i,
		0.75
	],
	[/\b(first|oldest|largest|smallest|invented|discovered|expedition|ritual|festival|subculture|experimental|accidental|failed)\b/i, 0.35]
];

const INTRIGUE_PATTERNS: WeightedPattern[] = [
	[
		/\b(disappearance|lost|abandoned|forgotten|secret|hidden|underground|forbidden|illegal|scandal|controversial|disputed|failed|accidental|hoax|fraud|mystery|unsolved|unexplained|paradox|anomaly|miracle|curse|ritual|cult|outlaw|pirate|spy|assassination|expedition)\b/i,
		0.9
	],
	[
		/\b(first|last|only|oldest|newest|largest|smallest|longest|shortest|deadliest|rarest|invented|discovered|extinct|prehistoric|ancient|medieval|experimental|prototype)\b/i,
		0.45
	]
];

const HOOKY_TITLE = /[!?]|\b(vs\.?|v\.)\b|\b(the|a) (lost|secret|forgotten|last|first|only)\b/i;

export function normalizeTaste(value: unknown): TasteId {
	return typeof value === 'string' && TASTE_IDS.has(value as TasteId)
		? (value as TasteId)
		: 'balanced';
}

function textFor(candidate: Candidate): string {
	return `${candidate.title} ${candidate.description ?? ''} ${(candidate.categories ?? []).join(' ')}`;
}

function patternScore(text: string, patterns: WeightedPattern[]): number {
	let score = 0;
	for (const [pattern, weight] of patterns) {
		if (pattern.test(text)) score += weight;
	}
	return score;
}

export function tasteAffinity(candidate: Candidate, taste: TasteId): number {
	const normalized = normalizeTaste(taste);
	if (normalized === 'balanced') return 0;
	return Math.min(2.2, patternScore(textFor(candidate), TASTE_PATTERNS[normalized]));
}

export function curiosity(candidate: Candidate): number {
	return Math.min(1.4, patternScore(textFor(candidate), CURIOSITY_PATTERNS));
}

export function intrigue(candidate: Candidate): number {
	const text = textFor(candidate);
	const titleBoost = HOOKY_TITLE.test(candidate.title) ? 0.35 : 0;
	return Math.min(2.6, curiosity(candidate) + patternScore(text, INTRIGUE_PATTERNS) + titleBoost);
}
