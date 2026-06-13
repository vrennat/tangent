import type { EngineContext, InterestPayload, SessionPayload } from './types';

/**
 * Rebuild a pure {@link EngineContext} from the wire payload `/api/next` receives.
 *
 * The client sends arrays (JSON has no Set); the engine wants Sets for O(1) membership.
 * `extraSeen` lets the endpoint's retry loop block dud candidates without the client
 * resending its whole seen list each attempt. Pure and deterministic given `rng`.
 */
export function buildEngineContext(
	interest: InterestPayload,
	session: SessionPayload,
	rng: () => number = Math.random,
	extraSeen?: Iterable<string>
): EngineContext {
	const seenTitles = new Set(session.seenTitles ?? []);
	if (extraSeen) for (const t of extraSeen) seenTitles.add(t);

	return {
		tokenWeights: interest.tokenWeights ?? {},
		tokenDocFreq: interest.tokenDocFreq ?? {},
		recentTokens: new Set(session.recentTokens ?? []),
		seenTitles,
		noSurprise: session.noSurprise ?? false,
		rng
	};
}
