import Foundation

/// Decide whether a link tapped inside rendered article HTML points at a real
/// Wikipedia article we can open in the app. Returns the article title (spaces, no
/// section anchor) for main-namespace links, or nil for everything else — non-article
/// namespaces (File:, Category:, Special:, …), edit/history links, and off-wiki
/// citations — which should open externally instead.
///
/// Direct port of the web's `links.ts` so in-app link following matches the web reader.
enum WikiLink {
	/// Titles beginning with one of these namespaces are not articles. A leading token
	/// like "Mission" in "Mission: Impossible" is NOT a namespace, so that stays an article.
	private static let nonArticleNamespaces: Set<String> = [
		"media", "special", "talk", "user", "user talk", "wikipedia", "wikipedia talk",
		"wp", "project", "file", "file talk", "image", "mediawiki", "mediawiki talk",
		"template", "template talk", "help", "help talk", "category", "category talk",
		"portal", "portal talk", "draft", "draft talk", "timedtext", "timedtext talk",
		"module", "module talk", "book", "gadget", "gadget definition",
		"education program", "topic"
	]

	static func articleTitle(from url: URL) -> String? {
		guard url.host == "en.wikipedia.org" else { return nil }
		guard url.path.hasPrefix("/wiki/") else { return nil } // /w/index.php (edit/history), etc.

		let slug = String(url.path.dropFirst("/wiki/".count))
		guard let decoded = slug.removingPercentEncoding else { return nil }
		let title = decoded.replacingOccurrences(of: "_", with: " ")
			.trimmingCharacters(in: .whitespaces)
		if title.isEmpty || isNonArticleNamespace(title) { return nil }
		return title
	}

	private static func isNonArticleNamespace(_ title: String) -> Bool {
		guard let colon = title.firstIndex(of: ":") else { return false }
		let ns = title[..<colon].trimmingCharacters(in: .whitespaces).lowercased()
		return nonArticleNamespaces.contains(ns)
	}
}
