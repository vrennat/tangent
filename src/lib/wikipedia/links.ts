/**
 * Decide whether a link inside rendered article HTML points at a real Wikipedia
 * article we can open as a new wormhole.
 *
 * Returns the article title (spaces, no section anchor) for main-namespace article
 * links, or null for everything else — non-article namespaces (File:, Category:,
 * Special:, …), edit/history links, and off-wiki citations — which should just open
 * externally instead.
 */

// Titles beginning with one of these namespaces are not articles. A leading token
// like "Mission" in "Mission: Impossible" is NOT a namespace, so that stays an article.
const NON_ARTICLE_NAMESPACE =
	/^(Media|Special|Talk|User|User talk|Wikipedia|Wikipedia talk|WP|Project|File|File talk|Image|MediaWiki|MediaWiki talk|Template|Template talk|Help|Help talk|Category|Category talk|Portal|Portal talk|Draft|Draft talk|TimedText|TimedText talk|Module|Module talk|Book|Gadget|Gadget definition|Education Program|Topic):/i;

export function wormholeTitleFromHref(href: string): string | null {
	try {
		const url = new URL(href, 'https://en.wikipedia.org');
		if (url.hostname !== 'en.wikipedia.org') return null;

		const match = url.pathname.match(/^\/wiki\/(.+)$/);
		if (!match) return null; // /w/index.php (edit/history), etc.

		const title = decodeURIComponent(match[1]).replace(/_/g, ' ').trim();
		if (!title || NON_ARTICLE_NAMESPACE.test(title)) return null;

		return title;
	} catch {
		return null;
	}
}
