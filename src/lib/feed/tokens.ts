/** Minimal tokenizer for building/matching the user's interest vector. */

const STOPWORDS = new Set([
	'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'was', 'are',
	'were', 'be', 'by', 'as', 'at', 'from', 'that', 'this', 'it', 'its', 'their', 'his', 'her',
	'which', 'who', 'whom', 'into', 'also', 'has', 'had', 'have', 'but', 'not', 'they', 'them',
	'these', 'those', 'such', 'than', 'then', 'one', 'two', 'first', 'used', 'using', 'known',
	'between', 'during', 'after', 'before', 'about', 'over', 'under', 'other', 'some', 'may',
	'can', 'will', 'would', 'been', 'more', 'most', 'all', 'both', 'each', 'when', 'where'
]);

/** Lowercased, de-stopworded word tokens of length >= 3. Unicode-aware: accented
 *  letters stay inside their token ("Zürich" is one word, not a fabricated "rich"). */
export function tokenize(text: string | null | undefined): string[] {
	if (!text) return [];
	const matches = text.toLowerCase().match(/\p{L}[\p{L}'’-]{2,}/gu);
	if (!matches) return [];
	return matches.filter((t) => !STOPWORDS.has(t));
}

/** Unique tokens, useful for set membership and overlap checks. */
export function tokenSet(text: string | null | undefined): Set<string> {
	return new Set(tokenize(text));
}

/**
 * Normalized tokens of category names, the raw material of the run-coherence
 * signal. Unlike {@link tokenize}, digit-bearing tokens are kept — the era and
 * region information categories carry is digit-laden ("1st-century BC births",
 * "States and territories established in 27 BC"), and dropping it would blind
 * the signal to exactly the same-time-same-place overlap it exists to detect.
 */
export function categoryTokenSet(categories: readonly string[] | null | undefined): Set<string> {
	const out = new Set<string>();
	for (const cat of categories ?? []) {
		const name = cat.replace(/^Category:/, '').toLowerCase();
		for (const m of name.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []) {
			if (STOPWORDS.has(m)) continue;
			// bc/ad are kept despite the length rule — without them "27 BC" and
			// "27 AD" collapse into the same era.
			if (m.length >= 3 || /\d/.test(m) || m === 'bc' || m === 'ad') out.add(m);
		}
	}
	return out;
}
