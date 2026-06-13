import Foundation

/// A Wikipedia thumbnail. Mirrors the server `Thumbnail` shape.
struct Thumbnail: Codable, Hashable {
	let source: String
	let width: Int
	let height: Int
}

/// A fully-formed article card body. Decoded straight from `/api/card` and `/api/next`.
///
/// `tokens` is computed server-side (the single source of truth for the interest
/// vocabulary). The client NEVER tokenizes — it only does numeric vector math keyed
/// on these tokens — so the scoring brain can't drift from the web client.
struct Article: Codable, Hashable, Identifiable {
	let title: String
	let description: String?
	let extract: String
	let thumbnail: Thumbnail?
	let wikiUrl: String
	let lang: String
	let tokens: [String]

	var id: String { title }

	/// Web URL for "Read full article".
	var readURL: URL? { URL(string: wikiUrl) }
}

/// A typeahead search hit for the seed picker (`/api/search`).
struct SearchResult: Codable, Hashable, Identifiable {
	let title: String
	let description: String?
	let thumbnail: Thumbnail?

	var id: String { title }
}
