/** Minimal tokenizer for building/matching the user's interest vector. */

const STOPWORDS = new Set([
	'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'was', 'are',
	'were', 'be', 'by', 'as', 'at', 'from', 'that', 'this', 'it', 'its', 'their', 'his', 'her',
	'which', 'who', 'whom', 'into', 'also', 'has', 'had', 'have', 'but', 'not', 'they', 'them',
	'these', 'those', 'such', 'than', 'then', 'one', 'two', 'first', 'used', 'using', 'known',
	'between', 'during', 'after', 'before', 'about', 'over', 'under', 'other', 'some', 'may',
	'can', 'will', 'would', 'been', 'more', 'most', 'all', 'both', 'each', 'when', 'where'
]);

/** Lowercased, de-stopworded word tokens of length >= 3. */
export function tokenize(text: string | null | undefined): string[] {
	if (!text) return [];
	const matches = text.toLowerCase().match(/[a-z][a-z'-]{2,}/g);
	if (!matches) return [];
	return matches.filter((t) => !STOPWORDS.has(t));
}

/** Unique tokens, useful for set membership and overlap checks. */
export function tokenSet(text: string | null | undefined): Set<string> {
	return new Set(tokenize(text));
}
