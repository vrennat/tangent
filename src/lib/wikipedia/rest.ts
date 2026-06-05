import type { Article, Thumbnail } from './types';
import { restGet, restTitlePath, wikiUrl } from './client';

/** Shape of the REST `/page/summary` response (the fields we use). */
interface SummaryResponse {
	type: string;
	title: string;
	displaytitle?: string;
	description?: string;
	extract?: string;
	thumbnail?: Thumbnail;
	lang?: string;
	content_urls?: { desktop?: { page?: string } };
}

/**
 * Fetch a renderable article via the REST summary endpoint.
 * Returns null when the page doesn't exist (404).
 */
export async function fetchArticle(title: string): Promise<Article | null> {
	const data = await restGet<SummaryResponse>(`page/summary/${restTitlePath(title)}`);
	if (!data || !data.extract) return null;

	return {
		title: data.title,
		description: data.description ?? null,
		extract: data.extract,
		thumbnail: data.thumbnail ?? null,
		wikiUrl: data.content_urls?.desktop?.page ?? wikiUrl(data.title),
		lang: data.lang ?? 'en'
	};
}
