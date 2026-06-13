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
		case .dive: return "Dove from \(from)"
		}
	}
}

/// One entry in the visible feed. `id` is unique per appearance so SwiftUI keys stay stable.
struct FeedCard: Identifiable, Hashable {
	let id: String
	let article: Article
	let fromTitle: String
	let relation: Relation
}

// MARK: - /api/next wire types

/// The persistent, syncable half of the profile (the interest vector).
struct InterestPayload: Codable {
	let tokenWeights: [String: Double]
	let tokenDocFreq: [String: Int]
}

/// The ephemeral per-session half the client always tracks and sends.
struct SessionPayload: Codable {
	let seenTitles: [String]
	let recentTokens: [String]
	let noSurprise: Bool?
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
	let exhausted: Bool?
}
