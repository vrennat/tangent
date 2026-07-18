/**
 * Wikipedia's Main Page, turned into Tangent seed sections.
 *
 * The daily "featured content" REST feed (https://en.wikipedia.org/api/rest_v1/feed/
 * featured/YYYY/MM/DD, no auth) is what the front page is built from: today's featured
 * article, "Did you know…", "On this day", "In the news", and the most-read articles.
 * It's exactly the editorially-curated, changes-every-day material a "get sucked into
 * Wikipedia" app should lean on — and every item is already in the REST page-summary
 * shape we use elsewhere, so it maps straight onto {@link Candidate}.
 *
 * We rank each section through {@link rankSeeds} so "good for Tangent" stays defined in
 * one place: the same intrinsic scoring (specificity / intrigue) and the same politics
 * dampening the live feed uses, applied here as a clean removal. The Main Page skews
 * heavily toward current events, elections, and recent deaths — the very gravity well
 * the feed engine is built to avoid — so filtering at the seed is what keeps a fresh,
 * topical entry point from immediately collapsing into politics on the next step.
 *
 * Server-side only (uses the Wikipedia fetch helpers).
 */

import type { Candidate, Thumbnail } from './types';
import { restGet } from './client';
import { articleTitleFromHref } from './links';
import { enrichByTitles } from './action';
import { rankSeeds } from '$lib/feed/score';

/** A REST page-summary, as embedded in the featured feed (only the fields we use). */
interface FeedSummary {
	title: string;
	normalizedtitle?: string;
	titles?: { normalized?: string };
	description?: string;
	/** Plain-text lead paragraph — present on the tfa summary, used as the hero teaser. */
	extract?: string;
	thumbnail?: Thumbnail;
}
interface FeedNews {
	story: string;
	links?: FeedSummary[];
}
interface FeedOnThisDay {
	text?: string;
	year?: number;
	pages?: FeedSummary[];
}
interface FeedDyk {
	html: string;
	text: string;
}
interface FeaturedResponse {
	tfa?: FeedSummary;
	mostread?: { articles?: FeedSummary[] };
	news?: FeedNews[];
	onthisday?: FeedOnThisDay[];
	dyk?: FeedDyk[];
}

export type TodaySectionId = 'featured' | 'dyk' | 'onthisday' | 'news' | 'trending';

/** One seed offered on the start page. */
export interface TodayPick {
	title: string;
	description: string | null;
	/** Section-specific teaser: the DYK hook, the news headline, the "on this day" event. */
	hook: string | null;
	/** For "On this day" — the year the event happened. */
	year: number | null;
	thumbnail: Thumbnail | null;
}

export interface TodaySection {
	id: TodaySectionId;
	label: string;
	picks: TodayPick[];
}

export interface TodayFeed {
	/** ISO date (UTC) the feed is for, e.g. "2026-06-14". */
	date: string;
	sections: TodaySection[];
}

/** How many picks each section shows (one for the single featured article). */
const SECTION_CAP = 8;
const NEWS_CAP = 6;

/**
 * Perennial Wikipedia housekeeping pages that dominate "most read" but make terrible
 * rabbit-hole starts: the portal itself, the rolling obituary, the "year in X" indexes,
 * and any non-article namespace that slips through.
 */
const NOT_A_SEED =
	/^(Main Page|Deaths in \d{4}|\d{4} in \w|Wikipedia:|Portal:|Special:|Category:|File:|Template:|Help:)/;

function isArticleSeed(title: string): boolean {
	return !NOT_A_SEED.test(title);
}

/** Spaced display title, preferring the feed's own normalized form. */
function displayTitle(s: FeedSummary): string {
	return s.normalizedtitle ?? s.titles?.normalized ?? s.title.replace(/_/g, ' ');
}

/** A feed summary as a uniform-position candidate (so rankSeeds orders on merit alone). */
function summaryToCandidate(s: FeedSummary): Candidate {
	return {
		title: displayTitle(s),
		description: s.description ?? null,
		thumbnail: s.thumbnail ?? null,
		isDisambiguation: false,
		relation: 'link',
		categories: [],
		position: 0
	};
}

function toPick(c: Candidate, hook: string | null = null, year: number | null = null): TodayPick {
	return { title: c.title, description: c.description, hook, year, thumbnail: c.thumbnail };
}

/** Strip tags + HTML comments from a feed blurb down to display text. */
function stripHtml(html: string): string {
	return html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]+>/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * The article a "Did you know…" hook is about. Wikipedia bolds the new/expanded article,
 * so the link inside `<b>…</b>` is the subject; the feed renders these as absolute
 * `/wiki/` URLs, which {@link articleTitleFromHref} resolves directly. Falls back to the
 * first article link in the hook, then null.
 */
function dykSubject(html: string): string | null {
	for (const bold of html.match(/<b\b[^>]*>[\s\S]*?<\/b>/gi) ?? []) {
		const m = bold.match(/<a\b[^>]*?\shref="([^"]+)"/i);
		const title = m ? articleTitleFromHref(m[1]) : null;
		if (title) return title;
	}
	const anchor = /<a\b[^>]*?\shref="([^"]+)"/gi;
	let m: RegExpExecArray | null;
	while ((m = anchor.exec(html)) !== null) {
		const title = articleTitleFromHref(m[1]);
		if (title) return title;
	}
	return null;
}

function featuredSection(tfa?: FeedSummary): TodaySection | null {
	if (!tfa) return null;
	const picks = rankSeeds([summaryToCandidate(tfa)]).map((c) => toPick(c, tfa.extract ?? null));
	return picks.length ? { id: 'featured', label: "Today's featured article", picks } : null;
}

function trendingSection(articles: FeedSummary[]): TodaySection | null {
	const candidates = articles.map(summaryToCandidate).filter((c) => isArticleSeed(c.title));
	const picks = rankSeeds(candidates)
		.slice(0, SECTION_CAP)
		.map((c) => toPick(c));
	return picks.length ? { id: 'trending', label: 'Trending today', picks } : null;
}

/**
 * One pick per event/story: the best (ranked) page from that group plus the group's
 * headline as the hook. Keeps the "here's what happened, here's where to start" framing
 * instead of flattening a story's every link into the shelf.
 */
function bestPerGroup(
	groups: { candidates: Candidate[]; hook: string | null; year: number | null }[],
	cap: number
): TodayPick[] {
	const picks: TodayPick[] = [];
	const seen = new Set<string>();
	for (const group of groups) {
		const [best] = rankSeeds(group.candidates);
		if (!best || seen.has(best.title)) continue;
		seen.add(best.title);
		picks.push(toPick(best, group.hook, group.year));
		if (picks.length >= cap) break;
	}
	return picks;
}

function newsSection(stories: FeedNews[]): TodaySection | null {
	const picks = bestPerGroup(
		stories.map((story) => ({
			candidates: (story.links ?? []).map(summaryToCandidate).filter((c) => isArticleSeed(c.title)),
			hook: stripHtml(story.story) || null,
			year: null
		})),
		NEWS_CAP
	);
	return picks.length ? { id: 'news', label: 'In the news', picks } : null;
}

function onThisDaySection(events: FeedOnThisDay[]): TodaySection | null {
	const picks = bestPerGroup(
		events.map((event) => ({
			candidates: (event.pages ?? []).map(summaryToCandidate).filter((c) => isArticleSeed(c.title)),
			hook: event.text ?? null,
			year: event.year ?? null
		})),
		SECTION_CAP
	);
	return picks.length ? { id: 'onthisday', label: 'On this day', picks } : null;
}

/**
 * "Did you know…" hooks. The feed gives only the hook HTML/text (no thumbnail), so we
 * resolve each bolded subject to a full candidate via the Action API to get an image and
 * a Wikidata description for ranking, then re-attach the hook for display.
 */
async function dykSection(items: FeedDyk[]): Promise<TodaySection | null> {
	const hooks = new Map<string, string>();
	const titles: string[] = [];
	for (const item of items) {
		const subject = dykSubject(item.html);
		if (!subject || hooks.has(subject)) continue;
		hooks.set(subject, item.text);
		titles.push(subject);
	}
	if (titles.length === 0) return null;

	const enriched = await enrichByTitles(titles);
	const picks = rankSeeds(enriched)
		.slice(0, SECTION_CAP)
		.map((c) => toPick(c, hooks.get(c.title) ?? null));
	return picks.length ? { id: 'dyk', label: 'Did you know…', picks } : null;
}

/** Today's UTC date as the feed path expects: YYYY/MM/DD. */
function feedDatePath(date: Date): string {
	const y = date.getUTCFullYear();
	const m = String(date.getUTCMonth() + 1).padStart(2, '0');
	const d = String(date.getUTCDate()).padStart(2, '0');
	return `${y}/${m}/${d}`;
}

/**
 * Wikipedia's Main Page picks for a given day, mapped into Tangent seed sections and
 * ranked through the feed's own judgment. Returns empty sections if the day's feed isn't
 * published (a 404), so the start page just falls back to its evergreen seeds.
 */
export async function fetchToday(date: Date): Promise<TodayFeed> {
	const path = feedDatePath(date);
	const isoDate = path.replace(/\//g, '-');

	const feed = await restGet<FeaturedResponse>(`feed/featured/${path}`);
	if (!feed) return { date: isoDate, sections: [] };

	// Order by fit for the "get sucked in" mission, not by the front page's own hierarchy:
	// the surprising DYK hooks and historical "on this day" entries lead, so the block opens
	// on its most on-mission content. (It also keeps a single divisive featured article — the
	// front page is often headlined by current political figures — out of the lead slot.)
	const dyk = await dykSection(feed.dyk ?? []);
	const sections = [
		dyk,
		onThisDaySection(feed.onthisday ?? []),
		featuredSection(feed.tfa),
		newsSection(feed.news ?? []),
		trendingSection(feed.mostread?.articles ?? [])
	].filter((s): s is TodaySection => s !== null);

	return { date: isoDate, sections };
}

// Exported for unit tests; not part of the section-building surface.
export const _internal = { dykSubject, isArticleSeed, stripHtml };
