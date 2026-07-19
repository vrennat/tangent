import type { EngineContext, InterestPayload, SessionPayload } from './types';
import { FEED } from './config';
import { normalizeTaste } from './taste';

/**
 * Rebuild a pure {@link EngineContext} from the wire payload `/api/next` receives.
 *
 * The client sends arrays (JSON has no Set); the engine wants Sets for O(1) membership.
 * `extraSeen` lets the endpoint's retry loop block dud candidates without the client
 * resending its whole seen list each attempt. Pure and deterministic given `rng`.
 *
 * Older clients predate run accounting. Their fallbacks: run tokens approximate to
 * the recent-tokens window they do send, and runDepth cycles on stepIndex so the
 * run/break rhythm still happens at a fixed cadence — degraded pacing, not degraded
 * safety (the anti-orbit break still fires every cycle).
 */
export function buildEngineContext(
	interest: InterestPayload,
	session: SessionPayload,
	rng: () => number = Math.random,
	extraSeen?: Iterable<string>
): EngineContext {
	const seenTitles = new Set(session.seenTitles ?? []);
	if (extraSeen) for (const t of extraSeen) seenTitles.add(t);

	const stepIndex = session.stepIndex ?? seenTitles.size;
	const runCycle = FEED.runMinLength + FEED.runBreakRamp.length;

	return {
		tokenWeights: interest.tokenWeights ?? {},
		tokenAvoidWeights: interest.tokenAvoidWeights ?? {},
		tokenDocFreq: interest.tokenDocFreq ?? {},
		taste: normalizeTaste(interest.taste),
		runDepth: session.runDepth ?? stepIndex % runCycle,
		runTokens: new Set(session.runTokens ?? session.recentTokens ?? []),
		runCategories: new Set(session.runCategories ?? []),
		// Absent on older clients: directions simply never fire (wild-card behavior).
		runEras: new Set(session.runEras ?? []),
		runPlaces: new Set(session.runPlaces ?? []),
		seenTitles,
		noSurprise: session.noSurprise ?? false,
		stepIndex,
		rng
	};
}
