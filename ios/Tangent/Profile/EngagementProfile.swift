import Foundation
import Observation

/// Tunables mirrored from the web `FEED` config. Only the knobs the *client* needs to
/// build the interest vector live here; the scoring knobs stay server-side.
private enum Tune {
	static let likeTokenWeight = 1.0
	static let clickthroughTokenWeight = 0.7
	static let dwellTokenWeight = 0.2
	static let dwellThresholdMs = 4000.0
	static let sessionDecay = 0.85
	static let sessionDecayFloor = 0.05
	static let tokenWeightCap = 3.0
}

/// The user's engagement profile, persisted to UserDefaults.
///
/// This is the iOS analogue of the web's `profile.svelte.ts`, with one deliberate
/// difference: it NEVER tokenizes. It bumps/decays numeric weights keyed on the
/// `article.tokens` the server already computed, so the interest vocabulary can't
/// drift between platforms. Session decay runs once per app launch.
@MainActor
@Observable
final class EngagementProfile {
	private(set) var tokenWeights: [String: Double] = [:]
	private(set) var tokenDocFreq: [String: Int] = [:]
	private(set) var likedTitles: Set<String> = []
	private(set) var seenCount = 0

	private var clickthroughs: Set<String> = []
	private var engaged: Set<String> = []
	private var seenForDf: Set<String> = []
	private var dwellMs: [String: Double] = [:]

	private let storeKey = "tangent.profile.v1"

	init() {
		load()
		// One decay per launch (a launch ≈ the web's tab session).
		applySessionDecay()
		save()
	}

	func isLiked(_ title: String) -> Bool { likedTitles.contains(title) }

	func toggleLike(_ article: Article) {
		if likedTitles.contains(article.title) {
			likedTitles.remove(article.title)
			bump(article.tokens, by: -Tune.likeTokenWeight)
		} else {
			likedTitles.insert(article.title)
			bump(article.tokens, by: Tune.likeTokenWeight)
		}
		save()
	}

	/// The user actively opened the article to read it.
	func recordClickthrough(_ article: Article) {
		guard !clickthroughs.contains(article.title) else { return }
		clickthroughs.insert(article.title)
		bump(article.tokens, by: Tune.clickthroughTokenWeight)
		save()
	}

	/// The card was revealed in the feed — updates document-frequency for DF discounting.
	func recordSeen(_ article: Article) {
		guard !seenForDf.contains(article.title) else { return }
		seenForDf.insert(article.title)
		seenCount += 1
		for token in Set(article.tokens) {
			tokenDocFreq[token, default: 0] += 1
		}
		save()
	}

	/// Accumulate dwell; once past the threshold, count it lightly (once).
	func recordDwell(_ article: Article, ms: Double) {
		let next = (dwellMs[article.title] ?? 0) + ms
		dwellMs[article.title] = next
		if next >= Tune.dwellThresholdMs && !engaged.contains(article.title) {
			engaged.insert(article.title)
			bump(article.tokens, by: Tune.dwellTokenWeight)
		}
		save()
	}

	func reset() {
		tokenWeights = [:]; tokenDocFreq = [:]; likedTitles = []; seenCount = 0
		clickthroughs = []; engaged = []; seenForDf = []; dwellMs = [:]
		save()
	}

	/// The wire payload `/api/next` scores against.
	var interestPayload: InterestPayload {
		InterestPayload(tokenWeights: tokenWeights, tokenDocFreq: tokenDocFreq)
	}

	// MARK: - Internals

	private func bump(_ tokens: [String], by delta: Double) {
		for token in Set(tokens) {
			let value = (tokenWeights[token] ?? 0) + delta
			if value <= 0 {
				tokenWeights[token] = nil
			} else {
				tokenWeights[token] = min(value, Tune.tokenWeightCap)
			}
		}
	}

	private func applySessionDecay() {
		guard !tokenWeights.isEmpty else { return }
		var next: [String: Double] = [:]
		for (token, weight) in tokenWeights {
			let decayed = min(weight * Tune.sessionDecay, Tune.tokenWeightCap)
			if decayed >= Tune.sessionDecayFloor { next[token] = decayed }
		}
		tokenWeights = next
	}

	// MARK: - Persistence

	private struct Snapshot: Codable {
		var tokenWeights: [String: Double]
		var tokenDocFreq: [String: Int]
		var likedTitles: [String]
		var clickthroughs: [String]
		var engaged: [String]
		var seenForDf: [String]
		var dwellMs: [String: Double]
		var seenCount: Int
	}

	private func load() {
		guard let data = UserDefaults.standard.data(forKey: storeKey),
		      let snap = try? JSONDecoder().decode(Snapshot.self, from: data) else { return }
		tokenWeights = snap.tokenWeights
		tokenDocFreq = snap.tokenDocFreq
		likedTitles = Set(snap.likedTitles)
		clickthroughs = Set(snap.clickthroughs)
		engaged = Set(snap.engaged)
		seenForDf = Set(snap.seenForDf)
		dwellMs = snap.dwellMs
		seenCount = snap.seenCount
	}

	private func save() {
		let snap = Snapshot(
			tokenWeights: tokenWeights, tokenDocFreq: tokenDocFreq,
			likedTitles: Array(likedTitles), clickthroughs: Array(clickthroughs),
			engaged: Array(engaged), seenForDf: Array(seenForDf),
			dwellMs: dwellMs, seenCount: seenCount
		)
		if let data = try? JSONEncoder().encode(snap) {
			UserDefaults.standard.set(data, forKey: storeKey)
		}
	}
}
