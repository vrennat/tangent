import Foundation
import Observation

/// Tunables mirrored from the web `FEED` config (src/lib/feed/config.ts). Only the knobs
/// the *client* needs to build the interest vector live here; the scoring knobs stay
/// server-side. Keep values in lockstep with config.ts — drift silently skews scoring.
enum Tune {
	static let likeTokenWeight = 1.0
	static let clickthroughTokenWeight = 0.7
	static let dwellTokenWeight = 0.2
	static let skipTokenWeight = 0.28
	static let dwellThresholdMs = 4000.0
	static let skipMinVisibleMs = 350.0
	static let skipThresholdMs = 1400.0
	static let sessionDecay = 0.85
	static let avoidSessionDecay = 0.65
	static let sessionDecayFloor = 0.05
	static let tokenWeightCap = 3.0
	static let avoidTokenWeightCap = 1.8
	static let dfSessionDecay = 0.85
	static let dfDecayFloor = 1.0
	static let dfSeenTitlesCap = 500
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
	/// Avoidance vector, built from quickly-skipped cards. Decays faster than positive
	/// interest (avoidSessionDecay) so skips stay reversible.
	private(set) var tokenAvoidWeights: [String: Double] = [:]
	/// Fractional after session decay — dfWeight's log takes non-integer counts as-is.
	private(set) var tokenDocFreq: [String: Double] = [:]
	private(set) var likedTitles: Set<String> = []
	/// Liked articles, most-recent-first, backing the Liked collection screen. Kept in
	/// lockstep with `likedTitles`; stores the full `Article` so unliking from the list
	/// still has the server tokens to decrement.
	private(set) var likedArticles: [Article] = []
	/// Explicit tangent flavor sent with every /api/next request. "balanced" = default.
	private(set) var taste: String = "balanced"
	private(set) var seenCount = 0

	private var clickthroughs: Set<String> = []
	private var engaged: Set<String> = []
	private var skipped: [String: [String]] = [:] // title -> tokens bumped, so clearSkip can undo exactly
	/// Insertion-ordered so the session cap keeps the most recent titles (a bare Set
	/// loses recency and would evict arbitrarily).
	private var seenForDfOrder: [String] = []
	private var seenForDf: Set<String> = []
	private var dwellMs: [String: Double] = [:]

	private let storeKey = "tangent.profile.v1"
	private let store: UserDefaults

	/// `store` is injectable so tests can use an isolated suite instead of .standard.
	init(store: UserDefaults = .standard) {
		self.store = store
		load()
		// One decay per launch (a launch ≈ the web's tab session).
		applySessionDecay()
		save()
	}

	func isLiked(_ title: String) -> Bool { likedTitles.contains(title) }

	func toggleLike(_ article: Article) {
		if likedTitles.contains(article.title) {
			likedTitles.remove(article.title)
			likedArticles.removeAll { $0.title == article.title }
			bump(article.tokens, by: -Tune.likeTokenWeight)
		} else {
			likedTitles.insert(article.title)
			likedArticles.insert(article, at: 0)
			clearSkip(article.title)
			bump(article.tokens, by: Tune.likeTokenWeight)
		}
		save()
	}

	/// The user actively opened the article to read it.
	func recordClickthrough(_ article: Article) {
		let clearedSkip = clearSkip(article.title)
		if !clickthroughs.contains(article.title) {
			clickthroughs.insert(article.title)
			bump(article.tokens, by: Tune.clickthroughTokenWeight)
			save()
		} else if clearedSkip {
			save()
		}
	}

	/// The card was revealed in the feed — updates document-frequency for DF discounting.
	func recordSeen(_ article: Article) {
		guard !seenForDf.contains(article.title) else { return }
		seenForDf.insert(article.title)
		seenForDfOrder.append(article.title)
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
			clearSkip(article.title)
			bump(article.tokens, by: Tune.dwellTokenWeight)
		}
		save()
	}

	/// A quick pass with no read/like/dwell. Weak negative signal, deduped by title,
	/// suppressed entirely once the title has any positive signal.
	func recordSkip(_ article: Article) {
		guard !hasPositiveSignal(article.title), skipped[article.title] == nil else { return }
		skipped[article.title] = article.tokens
		bumpAvoid(article.tokens, by: Tune.skipTokenWeight)
		save()
	}

	func setTaste(_ id: String) {
		guard taste != id else { return }
		taste = id
		save()
	}

	func reset() {
		tokenWeights = [:]; tokenAvoidWeights = [:]; tokenDocFreq = [:]
		likedTitles = []; likedArticles = []; taste = "balanced"; seenCount = 0
		clickthroughs = []; engaged = []; skipped = [:]
		seenForDf = []; seenForDfOrder = []; dwellMs = [:]
		save()
	}

	/// The wire payload `/api/next` scores against.
	var interestPayload: InterestPayload {
		InterestPayload(
			tokenWeights: tokenWeights,
			tokenAvoidWeights: tokenAvoidWeights,
			tokenDocFreq: tokenDocFreq,
			taste: taste
		)
	}

	// MARK: - Internals

	private func bump(_ tokens: [String], by delta: Double) {
		bump(tokens, by: delta, cap: Tune.tokenWeightCap, into: &tokenWeights)
	}

	private func bumpAvoid(_ tokens: [String], by delta: Double) {
		bump(tokens, by: delta, cap: Tune.avoidTokenWeightCap, into: &tokenAvoidWeights)
	}

	private func bump(_ tokens: [String], by delta: Double, cap: Double, into target: inout [String: Double]) {
		for token in Set(tokens) {
			let value = (target[token] ?? 0) + delta
			if value <= 0 {
				target[token] = nil
			} else {
				target[token] = min(value, cap)
			}
		}
	}

	@discardableResult
	private func clearSkip(_ title: String) -> Bool {
		guard let tokens = skipped.removeValue(forKey: title) else { return false }
		bumpAvoid(tokens, by: -Tune.skipTokenWeight)
		return true
	}

	private func hasPositiveSignal(_ title: String) -> Bool {
		likedTitles.contains(title) || clickthroughs.contains(title) || engaged.contains(title)
	}

	private func applySessionDecay() {
		tokenWeights = decayed(tokenWeights, by: Tune.sessionDecay, floor: Tune.sessionDecayFloor, cap: Tune.tokenWeightCap)
		tokenAvoidWeights = decayed(tokenAvoidWeights, by: Tune.avoidSessionDecay, floor: Tune.sessionDecayFloor, cap: Tune.avoidTokenWeightCap)
		// DF ages with the interests it discounts; entries below one document's worth are
		// noise. Without this the discount deepens forever while weights stay capped, and
		// relevance fades toward zero for long-lived installs (web fix: applyDfDecay).
		tokenDocFreq = tokenDocFreq.compactMapValues { count in
			let next = count * Tune.dfSessionDecay
			return next >= Tune.dfDecayFloor ? next : nil
		}
		if seenForDfOrder.count > Tune.dfSeenTitlesCap {
			seenForDfOrder = Array(seenForDfOrder.suffix(Tune.dfSeenTitlesCap))
			seenForDf = Set(seenForDfOrder)
		}
	}

	private func decayed(
		_ weights: [String: Double], by factor: Double, floor: Double, cap: Double
	) -> [String: Double] {
		weights.compactMapValues { weight in
			let next = min(weight * factor, cap)
			return next >= floor ? next : nil
		}
	}

	// MARK: - Persistence

	private struct Snapshot: Codable {
		var tokenWeights: [String: Double]
		// Double since the df decay landed; legacy Int values decode into Double cleanly.
		var tokenDocFreq: [String: Double]
		var likedTitles: [String]
		// Newer fields are optional so profiles saved before they existed still decode
		// (a missing non-optional field would throw, get swallowed by `try?`, and wipe
		// everything).
		var likedArticles: [Article]?
		var tokenAvoidWeights: [String: Double]?
		var skipped: [String: [String]]?
		var taste: String?
		var clickthroughs: [String]
		var engaged: [String]
		var seenForDf: [String]
		var dwellMs: [String: Double]
		var seenCount: Int
	}

	private func load() {
		guard let data = store.data(forKey: storeKey),
		      let snap = try? JSONDecoder().decode(Snapshot.self, from: data) else { return }
		tokenWeights = snap.tokenWeights
		tokenDocFreq = snap.tokenDocFreq
		likedTitles = Set(snap.likedTitles)
		likedArticles = snap.likedArticles ?? []
		tokenAvoidWeights = snap.tokenAvoidWeights ?? [:]
		skipped = snap.skipped ?? [:]
		taste = snap.taste ?? "balanced"
		clickthroughs = Set(snap.clickthroughs)
		engaged = Set(snap.engaged)
		seenForDfOrder = snap.seenForDf
		seenForDf = Set(snap.seenForDf)
		dwellMs = snap.dwellMs
		seenCount = snap.seenCount
	}

	private func save() {
		let snap = Snapshot(
			tokenWeights: tokenWeights, tokenDocFreq: tokenDocFreq,
			likedTitles: Array(likedTitles), likedArticles: likedArticles,
			tokenAvoidWeights: tokenAvoidWeights, skipped: skipped, taste: taste,
			clickthroughs: Array(clickthroughs),
			engaged: Array(engaged), seenForDf: seenForDfOrder,
			dwellMs: dwellMs, seenCount: seenCount
		)
		if let data = try? JSONEncoder().encode(snap) {
			store.set(data, forKey: storeKey)
		}
	}
}
