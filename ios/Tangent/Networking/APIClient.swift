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
		case badURL
		case badStatus(Int)
		case transport(Error)
	}

	/// Keychain key for the bearer session token (`client: 'ios'` login flow — the app
	/// has no cookie jar, so hooks.server.ts accepts the token as an Authorization header).
	static let sessionTokenKey = "sessionToken"

	private struct CardResponse: Decodable { let article: Article? }
	private struct SearchResponse: Decodable { let results: [SearchResult] }
	private struct ArticleResponse: Decodable { let html: String? }
	private struct OkResponse: Decodable { let ok: Bool? }
	private struct MeResponse: Decodable { let user: AccountUser? }
	private struct VerifyResponse: Decodable {
		let ok: Bool
		let user: AccountUser
		let token: String
	}
	private struct ProfileResponse: Decodable { let profile: StoredProfile? }

	/// Build a GET URL for an API path with query items, without force-unwrapping —
	/// networking is the one place an odd title must degrade to a thrown error, not a crash.
	private func url(_ path: String, _ items: [URLQueryItem]) throws -> URL {
		guard var comps = URLComponents(url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false) else {
			throw APIError.badURL
		}
		comps.queryItems = items
		guard let url = comps.url else { throw APIError.badURL }
		return url
	}

	/// GET /api/card?title=… — a fully-resolved card (or nil if the page doesn't exist).
	func card(title: String) async throws -> Article? {
		let res: CardResponse = try await get(url("api/card", [URLQueryItem(name: "title", value: title)]))
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
		let res: ArticleResponse = try await get(url("api/article", [URLQueryItem(name: "title", value: title)]))
		return res.html
	}

	/// GET /api/search?q=… — typeahead for the seed picker.
	func search(_ query: String) async throws -> [SearchResult] {
		let res: SearchResponse = try await get(url("api/search", [URLQueryItem(name: "q", value: query)]))
		return res.results
	}

	// MARK: - Auth (email-code flow; passkeys need a DEVELOPMENT_TEAM and stay web-only)

	/// POST /api/auth/request-code — always generic `{ ok }` (no account enumeration).
	func requestCode(email: String) async throws {
		let _: OkResponse = try await post("api/auth/request-code", body: ["email": email])
	}

	/// POST /api/auth/verify-code with `client: 'ios'` — returns the bearer token the
	/// caller stores in the keychain. A 401 means wrong/expired code.
	func verifyCode(email: String, code: String) async throws -> (user: AccountUser, token: String) {
		let res: VerifyResponse = try await post(
			"api/auth/verify-code",
			body: ["email": email, "code": code, "client": "ios"]
		)
		return (res.user, res.token)
	}

	/// GET /api/auth/me — the account behind the current token, or nil.
	func me() async throws -> AccountUser? {
		let res: MeResponse = try await get(url("api/auth/me", []))
		return res.user
	}

	/// POST /api/auth/logout — revoke the current session server-side.
	func logout() async throws {
		let _: OkResponse = try await post("api/auth/logout", body: [String: String]())
	}

	// MARK: - Profile sync

	/// GET /api/profile — the stored profile, or nil when the account has never pushed.
	func getProfile() async throws -> StoredProfile? {
		let res: ProfileResponse = try await get(url("api/profile", []))
		return res.profile
	}

	/// PUT /api/profile — steady-state last-write-wins push.
	func putProfile(_ data: PersistedDTO) async throws -> StoredProfile {
		try await sendProfile(data, path: "api/profile", method: "PUT")
	}

	/// POST /api/profile/merge — first-login union/max reconciliation; adopt the result.
	func mergeProfile(_ data: PersistedDTO) async throws -> StoredProfile {
		try await sendProfile(data, path: "api/profile/merge", method: "POST")
	}

	private func sendProfile(_ data: PersistedDTO, path: String, method: String) async throws -> StoredProfile {
		var request = URLRequest(url: base.appendingPathComponent(path))
		request.httpMethod = method
		request.setValue("application/json", forHTTPHeaderField: "Content-Type")
		request.httpBody = try encoder.encode(["data": data])
		let res: ProfileResponse = try await send(request)
		guard let profile = res.profile else { throw APIError.badStatus(500) }
		return profile
	}

	// MARK: - Plumbing

	private func get<T: Decodable>(_ url: URL) async throws -> T {
		try await send(URLRequest(url: url))
	}

	private func post<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
		var request = URLRequest(url: base.appendingPathComponent(path))
		request.httpMethod = "POST"
		request.setValue("application/json", forHTTPHeaderField: "Content-Type")
		request.httpBody = try encoder.encode(body)
		return try await send(request)
	}

	private func send<T: Decodable>(_ request: URLRequest) async throws -> T {
		var request = request
		// Attach the session everywhere it exists — public endpoints ignore it.
		if let token = KeychainStore.get(Self.sessionTokenKey) {
			request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
		}
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
