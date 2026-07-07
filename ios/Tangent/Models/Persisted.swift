import Foundation

/// The synced profile blob — mirrors `Persisted` in src/lib/engagement/persisted.ts
/// FIELD-FOR-FIELD. This shape lives in the shared D1 `profiles` table, so any drift
/// here corrupts merges with web devices. Fields iOS has no feature for (branchedTitles)
/// still travel, empty, so a web pull never loses them to a hydrate default.
struct PersistedDTO: Codable {
	var likedTitles: [String]
	var clickthroughs: [String]
	var branchedTitles: [String]
	var skippedTitles: [String]
	var engagedTitles: [String]
	var tokenWeights: [String: Double]
	var tokenAvoidWeights: [String: Double]
	var taste: String
	var dwellMsByTitle: [String: Double]
	var tokenDocFreq: [String: Double]
	var seenCount: Int
	var seenForDfTitles: [String]
}

/// The signed-in account, as `/api/auth/me` and `/api/auth/verify-code` return it.
struct AccountUser: Codable, Equatable {
	let id: String
	let email: String
	let emailVerified: Bool
}

/// A stored profile row: the blob plus the server's revision counter, which gates
/// steady-state pull-vs-push (another device advanced it -> adopt; else push).
struct StoredProfile: Codable {
	let data: PersistedDTO
	let updatedAt: Double
	let revision: Int
}
