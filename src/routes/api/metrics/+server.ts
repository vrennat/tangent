import type { RequestHandler } from './$types';
import { recordEvent } from '$lib/server/metrics';

/**
 * POST /api/metrics — anonymous, unauthenticated endpoint for client-side event tracking.
 * - Same-origin guard: rejects cross-site writes.
 * - Validates event names against an allowlist.
 * - Extracts only string props, truncated to 64 chars, max 8 of them.
 * - Calls recordEvent to write to Analytics Engine.
 * - Always returns 204, never leaking validation failures (abuse only pollutes aggregate counts).
 *
 * This endpoint is intentionally unauthenticated because anonymous visitors use the feed.
 * Each datapoint is PII-free: indexes and blobs are non-identifying event names + dimensions;
 * doubles are always [1], never client counts.
 */
export const POST: RequestHandler = async ({ request, url, platform }) => {
	// Same-origin guard.
	const origin = request.headers.get('origin');
	if (origin) {
		try {
			const originUrl = new URL(origin);
			const requestUrl = new URL(request.url);
			if (originUrl.host !== requestUrl.host) {
				return new Response(null, { status: 204 });
			}
		} catch {
			return new Response(null, { status: 204 });
		}
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return new Response(null, { status: 204 });
	}
	// JSON.parse('null') / a bare array parses without throwing — guard before property access
	// so a hostile body can't crash the handler (it must always 204, never log a 500).
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return new Response(null, { status: 204 });
	}

	const event = (body as { event?: unknown }).event;
	// Client-postable events only. 'feed_served' and 'sign_in' are written server-side from
	// trusted handlers, so they're deliberately excluded here — a client can't inflate them.
	const allowlist = new Set(['like', 'skip', 'branch', 'theme_change', 'article_opened']);
	if (typeof event !== 'string' || !allowlist.has(event)) {
		return new Response(null, { status: 204 });
	}

	// Collect props: string values only, each truncated to 64 chars, max 8 of them.
	const props: string[] = [];
	const rawProps = (body as { props?: unknown }).props;
	if (rawProps && typeof rawProps === 'object') {
		for (const val of Object.values(rawProps)) {
			if (props.length >= 8) break;
			if (typeof val === 'string') props.push(val.slice(0, 64));
		}
	}

	recordEvent(platform, event, props);
	return new Response(null, { status: 204 });
};
