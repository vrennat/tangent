import Foundation

/// How a card arrived in the feed — drives the breadcrumb. Mirrors the server `Relation`.
enum Relation: String, Codable, Hashable {
	case seed, link, related, surprise, dive

	/// Breadcrumb verb shown above a card, e.g. "Linked from", "Tangent from".
	func kicker(from: String) -> String? {
		switch self {
		case .seed: return nil
		case .link: return "Linked from \(from)"
		case .related: return "More like \(from)"
		case .surprise: return "Tangent from \(from)"
		case .dive: return "Dove in from \(from)"
		}
	}
}

/// One entry in the visible feed. `id` is unique per appearance so SwiftUI keys stay stable.
struct FeedCard: Identifiable, Hashable {
	let id: String
	let article: Article
	let fromTitle: String
	let relation: Relation
	/// True when this card started a new run (seed, tangent, drift, branch, dive) —
	/// the anchor for the run accounting sent back to the engine.
	var runStart: Bool = false
	/// Server-normalized category tokens of the candidate that won selection; feeds
	/// the run's category accumulation. Empty for seeds/dives/restored cards.
	var categoryTokens: [String] = []
	/// True while an optimistic dive placeholder is still loading its real article.
	/// The card renders title + breadcrumb + a skeleton body until the swap.
	var pending: Bool = false
}

// MARK: - /api/next wire types

/// The persistent, syncable half of the profile (the interest vector).
/// Mirrors `InterestPayload` in src/lib/feed/types.ts field-for-field.
struct InterestPayload: Codable {
	let tokenWeights: [String: Double]
	/// Avoidance vector learned from quick skips — without it the server can never
	/// score "the user keeps skipping this topic".
	let tokenAvoidWeights: [String: Double]
	/// Fractional after session decay (df ages like the weights it discounts).
	let tokenDocFreq: [String: Double]
	/// Explicit tangent flavor ("balanced" | "technology" | ...). Server-normalized.
	let taste: String
}

/// The ephemeral per-session half the client always tracks and sends.
/// Mirrors `SessionPayload` in src/lib/feed/types.ts field-for-field.
struct SessionPayload: Codable {
	let seenTitles: [String]
	let noSurprise: Bool?
	/// Cards served this session (seed included). Same semantics as the web's
	/// cards+buffer count; identifies the session's first run (runDepth == stepIndex).
	let stepIndex: Int
	/// Cards served since the current run began, boundary card included.
	let runDepth: Int
	/// Tokens accumulated from the current run's cards (server-computed article tokens).
	let runTokens: [String]
	/// Normalized category tokens accumulated from the current run's cards.
	let runCategories: [String]
}

/// POST body for `/api/next`.
struct NextRequest: Codable {
	let fromTitle: String
	let mode: String?
	let interest: InterestPayload
	let session: SessionPayload
}

/// `/api/next` response: the fully-resolved next card plus how it was chosen.
struct NextResponse: Codable {
	let article: Article?
	let surprised: Bool
	let relation: Relation
	/// True when this pick starts a new run — the client resets run accounting on it.
	let runReset: Bool?
	/// The pick's normalized category tokens, for the run-category accumulation.
	let categoryTokens: [String]?
	let exhausted: Bool?
}
