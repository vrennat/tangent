import type { TasteId } from '$lib/feed/taste';
import { normalizeTaste } from '$lib/feed/taste';

/**
 * The persistent half of the engagement profile — the interest vector and the title sets
 * the feed engine reads. This is the shape stored in localStorage (web), UserDefaults
 * (iOS), and the D1 `profiles` blob. The ephemeral session (seenTitles/recentTokens) is
 * deliberately NOT here: it's always client-sent and never synced.
 *
 * Shared so the client profile and the server-side sync/merge agree on one definition.
 */
export interface Persisted {
	likedTitles: string[];
	clickthroughs: string[];
	branchedTitles: string[];
	skippedTitles: string[];
	engagedTitles: string[];
	tokenWeights: Record<string, number>;
	tokenAvoidWeights: Record<string, number>;
	taste: TasteId;
	dwellMsByTitle: Record<string, number>;
	tokenDocFreq: Record<string, number>;
	seenCount: number;
	seenForDfTitles: string[];
}

export const EMPTY_PERSISTED: Persisted = {
	likedTitles: [],
	clickthroughs: [],
	branchedTitles: [],
	skippedTitles: [],
	engagedTitles: [],
	tokenWeights: {},
	tokenAvoidWeights: {},
	taste: 'balanced',
	dwellMsByTitle: {},
	tokenDocFreq: {},
	seenCount: 0,
	seenForDfTitles: []
};

/** Fill missing keys from EMPTY so a partial/old blob decodes safely, and sanitize `taste`
 * (the one constrained field) so an untrusted/old blob can't persist an invalid value. */
export function hydratePersisted(partial: Partial<Persisted> | null | undefined): Persisted {
	const merged = { ...structuredClone(EMPTY_PERSISTED), ...(partial ?? {}) };
	merged.taste = normalizeTaste(merged.taste);
	return merged;
}

const ARRAY_KEYS = [
	'likedTitles',
	'clickthroughs',
	'branchedTitles',
	'skippedTitles',
	'engagedTitles',
	'seenForDfTitles'
] as const satisfies readonly (keyof Persisted)[];

const RECORD_MAX_KEYS = [
	'tokenWeights',
	'tokenAvoidWeights',
	'tokenDocFreq',
	'dwellMsByTitle'
] as const satisfies readonly (keyof Persisted)[];

function unionList(a: string[], b: string[]): string[] {
	return [...new Set([...a, ...b])];
}

function maxMergeRecord(
	a: Record<string, number>,
	b: Record<string, number>
): Record<string, number> {
	const out: Record<string, number> = { ...a };
	for (const [k, v] of Object.entries(b)) {
		out[k] = Math.max(out[k] ?? 0, v);
	}
	return out;
}

/**
 * Reconcile two profiles without losing accumulation — the merge that matters at first
 * login, when the device's local profile and the server's stored profile both hold real
 * history and neither should be clobbered.
 *
 * Title sets are unioned. Token weights / doc-frequency / dwell are merged by taking the
 * per-key MAX rather than summing: weights are capped running sums, and the same article
 * counted on two devices shouldn't double a capped value. `seenCount` takes the max (a
 * lower bound on articles seen). Taste prefers an explicit choice over the default.
 *
 * Steady-state single-device sync does NOT use this — it's plain last-write-wins. This is
 * only for combining two genuinely independent histories.
 */
export function mergePersisted(a: Persisted, b: Persisted): Persisted {
	const out = hydratePersisted({});
	for (const key of ARRAY_KEYS) {
		out[key] = unionList(a[key], b[key]);
	}
	for (const key of RECORD_MAX_KEYS) {
		out[key] = maxMergeRecord(a[key], b[key]);
	}
	out.seenCount = Math.max(a.seenCount, b.seenCount);
	// Prefer an explicit taste; if both are explicit, `b` (treated as the newer side) wins.
	out.taste = pickTaste(a.taste, b.taste);
	return out;
}

function pickTaste(a: TasteId, b: TasteId): TasteId {
	const an = normalizeTaste(a);
	const bn = normalizeTaste(b);
	if (bn !== 'balanced') return bn;
	if (an !== 'balanced') return an;
	return 'balanced';
}
