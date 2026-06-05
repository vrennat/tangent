/**
 * Hand-picked starting points for a rabbit hole.
 *
 * Wikipedia's `list=random` returns mostly obscure stubs ("Uniform Securities Act"),
 * which makes for a terrible first card. These are dense, image-rich, heavily-linked
 * articles that fan out into interesting territory — a much better cold start.
 */
export interface Seed {
	title: string;
	emoji: string;
}

export const SEEDS: Seed[] = [
	{ title: 'Roman Empire', emoji: '🏛️' },
	{ title: 'Black hole', emoji: '🕳️' },
	{ title: 'Octopus', emoji: '🐙' },
	{ title: 'Silk Road', emoji: '🐫' },
	{ title: 'Chernobyl disaster', emoji: '☢️' },
	{ title: 'Jazz', emoji: '🎷' },
	{ title: 'Volcano', emoji: '🌋' },
	{ title: 'Library of Alexandria', emoji: '📜' },
	{ title: 'Mycology', emoji: '🍄' },
	{ title: 'Antarctica', emoji: '🧊' },
	{ title: 'Cryptography', emoji: '🔐' },
	{ title: 'Renaissance', emoji: '🎨' },
	{ title: 'Deep sea', emoji: '🌊' },
	{ title: 'Samurai', emoji: '⚔️' },
	{ title: 'Quantum mechanics', emoji: '⚛️' },
	{ title: 'Coffee', emoji: '☕' },
	{ title: 'Pyramids of Giza', emoji: '🔺' },
	{ title: 'Fermi paradox', emoji: '👽' },
	{ title: 'Plate tectonics', emoji: '🌍' },
	{ title: 'Vikings', emoji: '🛶' },
	{ title: 'Human brain', emoji: '🧠' },
	{ title: 'Spice trade', emoji: '🌶️' },
	{ title: 'Aurora', emoji: '🌌' },
	{ title: 'Chess', emoji: '♟️' },
	{ title: 'Tardigrade', emoji: '🐻' },
	{ title: 'Great Barrier Reef', emoji: '🐠' },
	{ title: 'Aztecs', emoji: '🗿' },
	{ title: 'Internet', emoji: '🌐' },
	{ title: 'Bioluminescence', emoji: '✨' },
	{ title: 'Mount Everest', emoji: '🏔️' }
];

/** Pick a random curated seed (for "Surprise me"). */
export function randomSeed(): Seed {
	return SEEDS[Math.floor(Math.random() * SEEDS.length)];
}
