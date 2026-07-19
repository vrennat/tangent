import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { NextRequest, NextResponse, Relation } from '$lib/feed/types';
import { fetchExploreCandidates, fetchRelated } from '$lib/wikipedia/action';
import { selectNext } from '$lib/feed/select';
import { buildEngineContext } from '$lib/feed/context';
import { department } from '$lib/feed/departments';
import { eraBuckets, placeTokens } from '$lib/feed/directions';
import { categoryTokenSet } from '$lib/feed/tokens';
import { resolveCard } from '$lib/server/resolveCard';
import { cached, TTL } from '$lib/server/cache';

/** Matches the web client's per-build retry budget for dud candidates. */
const MAX_CARD_ATTEMPTS = 3;

/**
 * POST /api/next — the feed engine, server-side.
 *
 * Body: { fromTitle, mode?, interest, session }. The server fetches candidates from
 * the chain tip, scores them against the caller's interest vector with the same
 * `selectNext` the web uses, resolves the chosen card, and returns it in ONE round
 * trip. The whole scoring brain (score/select/tokens/politics) lives here only, so a
 * native (Swift) and web (TS) client can't drift — clients just render and track
 * numeric weights.
 *
 * Latency is hidden by the client's prefetch buffer: this decides the *next* card
 * while the user reads the current one, so the round trip never blocks a swipe.
 */
export const POST: RequestHandler = async ({ request, setHeaders }) => {
	let body: NextRequest;
	try {
		body = (await request.json()) as NextRequest;
	} catch {
		return json({ article: null, error: 'invalid body' }, { status: 400 });
	}

	const from = body.fromTitle?.trim();
	if (!from) return json({ article: null, error: 'missing fromTitle' }, { status: 400 });

	const interest = body.interest ?? { tokenWeights: {}, tokenDocFreq: {} };
	const session = body.session ?? { seenTitles: [] };
	const related = body.mode === 'related';
	const key = `links:${related ? 'related' : 'explore'}:${from}`;

	let candidates;
	try {
		candidates = await cached(key, TTL.long, () =>
			related ? fetchRelated(from) : fetchExploreCandidates(from)
		);
	} catch {
		return json({ article: null, error: 'upstream error' }, { status: 502 });
	}

	// Personalized by the caller's interest vector — never HTTP-cache the response.
	// (The candidate fetch and card resolve are already memoized server-side.)
	setHeaders({ 'cache-control': 'private, no-store' });

	// Re-select on each dud so a missing/404 candidate self-heals, exactly like the
	// web's #doBuild loop. blocked accumulates titles we've already failed to resolve.
	const blocked = new Set<string>();
	for (let attempt = 0; attempt < MAX_CARD_ATTEMPTS; attempt++) {
		const ctx = buildEngineContext(interest, session, Math.random, blocked);
		const selection = selectNext(candidates, ctx);
		if (!selection) {
			return json({ article: null, surprised: false, relation: 'link', exhausted: true } satisfies NextResponse);
		}

		let resolved;
		try {
			resolved = await resolveCard(selection.candidate.title);
		} catch {
			return json({ article: null, error: 'upstream error' }, { status: 502 });
		}

		if (resolved.article) {
			const relation: Relation = selection.surprised ? 'surprise' : selection.candidate.relation;
			return json({
				article: resolved.article,
				surprised: selection.surprised,
				relation,
				runReset: selection.runReset,
				categoryTokens: [...categoryTokenSet(selection.candidate.categories)],
				// Era/place run-accumulation fuel, pre-computed like categoryTokens so
				// native clients never need their own extractor.
				eraTokens: [...eraBuckets(selection.candidate)],
				placeTokens: [...placeTokens(selection.candidate)],
				department: (selection.surprised && department(selection.candidate)) || undefined,
				direction: selection.direction,
				foot: selection.foot
					? { title: selection.foot.title, description: selection.foot.description }
					: undefined
			} satisfies NextResponse);
		}
		blocked.add(selection.candidate.title);
	}

	// Burned the attempt budget on duds — treat as exhausted for this tip.
	return json({ article: null, surprised: false, relation: 'link', exhausted: true } satisfies NextResponse);
};
