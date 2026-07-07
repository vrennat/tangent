import XCTest
@testable import Tangent

/// The profile mirrors web profile maintenance (src/lib/feed/config.ts values); these
/// tests pin the numeric parity so server-side config changes can't silently drift.
@MainActor
final class EngagementProfileTests: XCTestCase {
	private func makeDefaults() throws -> UserDefaults {
		let name = "tangent.tests.\(UUID().uuidString)"
		let defaults = try XCTUnwrap(UserDefaults(suiteName: name))
		addTeardownBlock { defaults.removePersistentDomain(forName: name) }
		return defaults
	}

	private func article(_ title: String, tokens: [String]) -> Article {
		Article(
			title: title, description: nil, extract: "", thumbnail: nil,
			wikiUrl: "https://en.wikipedia.org/wiki/x", lang: "en", tokens: tokens
		)
	}

	private func seed(_ defaults: UserDefaults, json: String) {
		defaults.set(Data(json.utf8), forKey: "tangent.profile.v1")
	}

	// MARK: - Session decay

	func testSessionDecayAppliesToWeightsAvoidanceAndDocFreq() throws {
		let defaults = try makeDefaults()
		seed(defaults, json: """
		{"tokenWeights":{"rome":2.0},"tokenAvoidWeights":{"jazz":1.0},"tokenDocFreq":{"rome":10},
		 "likedTitles":[],"clickthroughs":[],"engaged":[],"seenForDf":[],"dwellMs":{},"seenCount":0}
		""")

		let profile = EngagementProfile(store: defaults)

		XCTAssertEqual(try XCTUnwrap(profile.tokenWeights["rome"]), 2.0 * 0.85, accuracy: 1e-9)
		XCTAssertEqual(try XCTUnwrap(profile.tokenAvoidWeights["jazz"]), 1.0 * 0.65, accuracy: 1e-9)
		XCTAssertEqual(try XCTUnwrap(profile.tokenDocFreq["rome"]), 10 * 0.85, accuracy: 1e-9)
	}

	func testDocFreqEntriesBelowOneDocumentAreDropped() throws {
		let defaults = try makeDefaults()
		seed(defaults, json: """
		{"tokenWeights":{},"tokenDocFreq":{"once":1,"twice":2},
		 "likedTitles":[],"clickthroughs":[],"engaged":[],"seenForDf":[],"dwellMs":{},"seenCount":0}
		""")

		let profile = EngagementProfile(store: defaults)

		XCTAssertNil(profile.tokenDocFreq["once"]) // 0.85 < 1 — one-off tokens fade out
		XCTAssertEqual(try XCTUnwrap(profile.tokenDocFreq["twice"]), 1.7, accuracy: 1e-9)
	}

	func testLegacyIntDocFreqSnapshotDecodes() throws {
		let defaults = try makeDefaults()
		// Pre-avoidance shape: Int df counts, no tokenAvoidWeights/skipped/taste keys.
		seed(defaults, json: """
		{"tokenWeights":{"rome":1.0},"tokenDocFreq":{"rome":4},
		 "likedTitles":["Rome"],"clickthroughs":[],"engaged":[],"seenForDf":["Rome"],"dwellMs":{},"seenCount":1}
		""")

		let profile = EngagementProfile(store: defaults)

		XCTAssertEqual(profile.seenCount, 1)
		XCTAssertEqual(profile.taste, "balanced")
		XCTAssertTrue(profile.tokenAvoidWeights.isEmpty)
		XCTAssertEqual(try XCTUnwrap(profile.tokenDocFreq["rome"]), 3.4, accuracy: 1e-9)
	}

	func testSeenForDfCapsAtMostRecent500() throws {
		let defaults = try makeDefaults()
		let titles = (0..<600).map { "t\($0)" }
		let json = try XCTUnwrap(String(
			data: JSONSerialization.data(withJSONObject: [
				"tokenWeights": [:], "tokenDocFreq": [:],
				"likedTitles": [], "clickthroughs": [], "engaged": [],
				"seenForDf": titles, "dwellMs": [:], "seenCount": 600
			]),
			encoding: .utf8
		))
		seed(defaults, json: json)

		let profile = EngagementProfile(store: defaults)

		// Recent title still deduped; evicted title counts as fresh again.
		profile.recordSeen(article("t599", tokens: ["a"]))
		XCTAssertEqual(profile.seenCount, 600)
		profile.recordSeen(article("t50", tokens: ["a"]))
		XCTAssertEqual(profile.seenCount, 601)
	}

	// MARK: - Skip / avoidance

	func testSkipBumpsAvoidanceOncePerTitle() throws {
		let profile = EngagementProfile(store: try makeDefaults())
		let volcano = article("Volcano", tokens: ["volcano", "mountain"])

		profile.recordSkip(volcano)
		profile.recordSkip(volcano)

		XCTAssertEqual(try XCTUnwrap(profile.tokenAvoidWeights["volcano"]), 0.28, accuracy: 1e-9)
		XCTAssertEqual(try XCTUnwrap(profile.tokenAvoidWeights["mountain"]), 0.28, accuracy: 1e-9)
	}

	func testLikeClearsAnEarlierSkip() throws {
		let profile = EngagementProfile(store: try makeDefaults())
		let volcano = article("Volcano", tokens: ["volcano"])

		profile.recordSkip(volcano)
		profile.toggleLike(volcano)

		XCTAssertNil(profile.tokenAvoidWeights["volcano"])
		XCTAssertEqual(try XCTUnwrap(profile.tokenWeights["volcano"]), 1.0, accuracy: 1e-9)
	}

	func testSkipIsSuppressedByPositiveSignal() throws {
		let profile = EngagementProfile(store: try makeDefaults())
		let volcano = article("Volcano", tokens: ["volcano"])

		profile.recordClickthrough(volcano)
		profile.recordSkip(volcano)

		XCTAssertNil(profile.tokenAvoidWeights["volcano"])
	}

	func testAvoidanceWeightIsCapped() throws {
		let profile = EngagementProfile(store: try makeDefaults())
		for i in 0..<8 {
			profile.recordSkip(article("Card \(i)", tokens: ["shared"]))
		}
		// 8 * 0.28 = 2.24, capped at 1.8.
		XCTAssertEqual(try XCTUnwrap(profile.tokenAvoidWeights["shared"]), 1.8, accuracy: 1e-9)
	}

	// MARK: - Taste

	func testTastePersistsAcrossInstances() throws {
		let defaults = try makeDefaults()
		EngagementProfile(store: defaults).setTaste("oddities")
		XCTAssertEqual(EngagementProfile(store: defaults).taste, "oddities")
	}

	// MARK: - Sync

	func testPersistedDTOMatchesTheWebPersistedShapeExactly() throws {
		// This JSON lands in the shared D1 profiles blob; key drift corrupts merges
		// with web devices. Mirror of Persisted in src/lib/engagement/persisted.ts.
		let profile = EngagementProfile(store: try makeDefaults())
		let data = try JSONEncoder().encode(profile.persistedDTO())
		let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])

		XCTAssertEqual(Set(json.keys), [
			"likedTitles", "clickthroughs", "branchedTitles", "skippedTitles",
			"engagedTitles", "tokenWeights", "tokenAvoidWeights", "taste",
			"dwellMsByTitle", "tokenDocFreq", "seenCount", "seenForDfTitles"
		])
	}

	func testAdoptReplacesLocalStateAndMarksSynced() throws {
		let profile = EngagementProfile(store: try makeDefaults())
		profile.recordSkip(article("Volcano", tokens: ["volcano"]))

		var dto = profile.persistedDTO()
		dto.tokenWeights = ["silk": 2.0]
		dto.taste = "history"
		dto.likedTitles = ["Silk Road"]
		dto.skippedTitles = []
		dto.tokenAvoidWeights = [:]
		profile.adopt(dto)

		XCTAssertEqual(try XCTUnwrap(profile.tokenWeights["silk"]), 2.0, accuracy: 1e-9)
		XCTAssertEqual(profile.taste, "history")
		XCTAssertTrue(profile.isLiked("Silk Road"))
		XCTAssertTrue(profile.tokenAvoidWeights.isEmpty)
		XCTAssertFalse(profile.pendingSync) // adopted state must not echo back as a push
	}

	func testMutationAfterPushReadsAsPending() throws {
		let profile = EngagementProfile(store: try makeDefaults())
		let rev = profile.rev
		profile.markPushed(rev)
		XCTAssertFalse(profile.pendingSync)

		profile.setTaste("nature")
		XCTAssertTrue(profile.pendingSync)
	}
}
