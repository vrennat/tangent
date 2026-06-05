/**
 * Low-level Wikipedia fetch helpers. Server-side only.
 *
 * Wikimedia asks for a descriptive User-Agent with contact info; sending one keeps
 * us in good standing and off the rate-limit naughty list.
 */

const REST_BASE = 'https://en.wikipedia.org/api/rest_v1';
const ACTION_BASE = 'https://en.wikipedia.org/w/api.php';

const USER_AGENT = 'Wormhole/0.1 (https://github.com/tanner/wormhole; tannervass@gmail.com)';

const HEADERS = {
	'User-Agent': USER_AGENT,
	'Api-User-Agent': USER_AGENT,
	Accept: 'application/json'
} as const;

export class WikiError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
		this.name = 'WikiError';
	}
}

/** Encode a title for a REST path segment ("Roman Empire" -> "Roman_Empire"). */
export function restTitlePath(title: string): string {
	return encodeURIComponent(title.replace(/ /g, '_'));
}

/** Desktop article URL for a given title. */
export function wikiUrl(title: string): string {
	return `https://en.wikipedia.org/wiki/${restTitlePath(title)}`;
}

/** GET a REST v1 endpoint, e.g. `page/summary/Roman_Empire`. Returns null on 404. */
export async function restGet<T>(path: string): Promise<T | null> {
	const res = await fetch(`${REST_BASE}/${path}`, { headers: HEADERS });
	if (res.status === 404) return null;
	if (!res.ok) throw new WikiError(`REST ${path} failed`, res.status);
	return (await res.json()) as T;
}

/** GET the Action API with the given query params (format=json is added for you). */
export async function actionGet<T>(params: Record<string, string>): Promise<T> {
	const qs = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
	const res = await fetch(`${ACTION_BASE}?${qs}`, { headers: HEADERS });
	if (!res.ok) throw new WikiError('Action API request failed', res.status);
	return (await res.json()) as T;
}
