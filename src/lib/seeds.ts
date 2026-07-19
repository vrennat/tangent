/**
 * Hand-picked starting points for a rabbit hole.
 *
 * Wikipedia's `list=random` returns mostly obscure stubs ("Uniform Securities Act"),
 * which makes for a terrible first card. These are dense, image-rich, heavily-linked
 * articles that fan out into interesting territory — a much better cold start.
 *
 * Each seed files under a mood category so the start page can offer "I'm in the
 * mood for animals" as an entry point, not just an undifferentiated chip pile.
 */
export type SeedCategory = 'history' | 'animals' | 'geography' | 'culture' | 'space' | 'science';

export interface Seed {
	title: string;
	category: SeedCategory;
}

/** Display order for the category row (Ben's five, plus Science — the seed list
 *  is a third technology/science and filing those under Culture reads wrong). */
export const SEED_CATEGORIES: readonly { id: SeedCategory; label: string }[] = [
	{ id: 'history', label: 'History' },
	{ id: 'animals', label: 'Animals' },
	{ id: 'geography', label: 'Geography' },
	{ id: 'culture', label: 'Culture' },
	{ id: 'space', label: 'Space' },
	{ id: 'science', label: 'Science' }
];

export const SEEDS: Seed[] = [
	{ title: 'Roman Empire', category: 'history' },
	{ title: 'Silk Road', category: 'history' },
	{ title: 'Chernobyl disaster', category: 'history' },
	{ title: 'Library of Alexandria', category: 'history' },
	{ title: 'Samurai', category: 'history' },
	{ title: 'Pyramids of Giza', category: 'history' },
	{ title: 'Vikings', category: 'history' },
	{ title: 'Spice trade', category: 'history' },
	{ title: 'Aztecs', category: 'history' },
	{ title: 'Antikythera mechanism', category: 'history' },
	{ title: 'Octopus', category: 'animals' },
	{ title: 'Tardigrade', category: 'animals' },
	{ title: 'Great Barrier Reef', category: 'animals' },
	{ title: 'Bioluminescence', category: 'animals' },
	{ title: 'Honey bee', category: 'animals' },
	{ title: 'Volcano', category: 'geography' },
	{ title: 'Antarctica', category: 'geography' },
	{ title: 'Deep sea', category: 'geography' },
	{ title: 'Plate tectonics', category: 'geography' },
	{ title: 'Mount Everest', category: 'geography' },
	{ title: 'Mariana Trench', category: 'geography' },
	{ title: 'Jazz', category: 'culture' },
	{ title: 'Renaissance', category: 'culture' },
	{ title: 'Coffee', category: 'culture' },
	{ title: 'Chess', category: 'culture' },
	{ title: 'Hokusai', category: 'culture' },
	{ title: 'Black hole', category: 'space' },
	{ title: 'Fermi paradox', category: 'space' },
	{ title: 'Aurora', category: 'space' },
	{ title: 'Voyager 1', category: 'space' },
	{ title: 'Saturn', category: 'space' },
	{ title: 'Mycology', category: 'science' },
	{ title: 'Cryptography', category: 'science' },
	{ title: 'Quantum mechanics', category: 'science' },
	{ title: 'Human brain', category: 'science' },
	{ title: 'Internet', category: 'science' },
	{ title: 'Penicillin', category: 'science' }
];

/** Pick a random curated seed (for "Surprise me"), optionally within one category. */
export function randomSeed(category?: SeedCategory): Seed {
	const pool = category ? SEEDS.filter((s) => s.category === category) : SEEDS;
	return pool[Math.floor(Math.random() * pool.length)];
}
