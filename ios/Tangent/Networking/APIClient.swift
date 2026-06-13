import Foundation

/// Thin client over Tangent's existing Cloudflare API. All feed intelligence lives
/// server-side behind `/api/next`; this just performs requests and decodes JSON.
struct APIClient {
	static let shared = APIClient()

	private let base = Config.baseURL
	private let session: URLSession
	private let decoder = JSONDecoder()
	private let encoder = JSONEncoder()

	init(session: URLSession = .shared) {
		self.session = session
	}

	enum APIError: Error {
		case badStatus(Int)
		case transport(Error)
	}

	private struct CardResponse: Decodable { let article: Article? }
	private struct SearchResponse: Decodable { let results: [SearchResult] }
	private struct ArticleResponse: Decodable { let html: String? }

	/// GET /api/card?title=… — a fully-resolved card (or nil if the page doesn't exist).
	func card(title: String) async throws -> Article? {
		var comps = URLComponents(url: base.appendingPathComponent("api/card"), resolvingAgainstBaseURL: false)!
		comps.queryItems = [URLQueryItem(name: "title", value: title)]
		let res: CardResponse = try await get(comps.url!)
		return res.article
	}

	/// POST /api/next — the server feed engine picks and resolves the next card.
	func next(_ req: NextRequest) async throws -> NextResponse {
		var request = URLRequest(url: base.appendingPathComponent("api/next"))
		request.httpMethod = "POST"
		request.setValue("application/json", forHTTPHeaderField: "Content-Type")
		request.httpBody = try encoder.encode(req)
		return try await send(request)
	}

	/// GET /api/article?title=… — sanitized full-article HTML body for inline reading.
	func article(title: String) async throws -> String? {
		var comps = URLComponents(url: base.appendingPathComponent("api/article"), resolvingAgainstBaseURL: false)!
		comps.queryItems = [URLQueryItem(name: "title", value: title)]
		let res: ArticleResponse = try await get(comps.url!)
		return res.html
	}

	/// GET /api/search?q=… — typeahead for the seed picker.
	func search(_ query: String) async throws -> [SearchResult] {
		var comps = URLComponents(url: base.appendingPathComponent("api/search"), resolvingAgainstBaseURL: false)!
		comps.queryItems = [URLQueryItem(name: "q", value: query)]
		let res: SearchResponse = try await get(comps.url!)
		return res.results
	}

	// MARK: - Plumbing

	private func get<T: Decodable>(_ url: URL) async throws -> T {
		try await send(URLRequest(url: url))
	}

	private func send<T: Decodable>(_ request: URLRequest) async throws -> T {
		let data: Data
		let response: URLResponse
		do {
			(data, response) = try await session.data(for: request)
		} catch {
			throw APIError.transport(error)
		}
		if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
			throw APIError.badStatus(http.statusCode)
		}
		return try decoder.decode(T.self, from: data)
	}
}
