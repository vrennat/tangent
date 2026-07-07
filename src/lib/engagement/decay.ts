/**
 * Pure decay math extracted so it can be unit-tested without DOM/browser APIs.
 *
 * Decay is applied once per session (gated by a sessionStorage sentinel in the
 * caller) to prevent stale interests from permanently dominating the feed.
 */

interface DecayConfig {
	sessionDecay: number;
	sessionDecayFloor: number;
	tokenWeightCap: number;
}

/**
 * Apply session decay to a token weight map.
 *
 * - Multiplies each weight by `sessionDecay`.
 * - Removes tokens that fall below `sessionDecayFloor` (they've faded to noise).
 * - Caps any weight exceeding `tokenWeightCap` (so bump-time capping is reflected after decay too).
 */
export function applySessionDecay(
	weights: Record<string, number>,
	config: DecayConfig
): Record<string, number> {
	const result: Record<string, number> = {};
	for (const [token, weight] of Object.entries(weights)) {
		const decayed = weight * config.sessionDecay;
		if (decayed >= config.sessionDecayFloor) {
			result[token] = Math.min(decayed, config.tokenWeightCap);
		}
	}
	return result;
}

/**
 * Apply session decay to the token document-frequency map.
 *
 * Interest weights are capped (tokenWeightCap) and decay each session, but df used
 * to only ever grow — so the DF discount deepened forever and relevance faded toward
 * zero for long-lived profiles, while the map itself grew without bound (it rides in
 * every /api/next payload and every localStorage write). Aging df at the same
 * cadence keeps the weight/discount ratio stable and the map bounded to recently
 * seen vocabulary. Counts below `floor` (less than one document's worth) are noise
 * and dropped; fractional counts are fine — dfWeight's log takes them as-is.
 */
export function applyDfDecay(
	docFreq: Record<string, number>,
	decay: number,
	floor: number
): Record<string, number> {
	const result: Record<string, number> = {};
	for (const [token, count] of Object.entries(docFreq)) {
		const decayed = count * decay;
		if (decayed >= floor) result[token] = decayed;
	}
	return result;
}
