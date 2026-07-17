import Foundation
import Observation

/// Drives the feed: owns the card chain and keeps it stocked a few cards ahead of
/// wherever the user is, so the next page is always fetched, rendered, and ready
/// before they swipe to it. Prefetched cards live directly in `cards` (the pager
/// always has somewhere to scroll); engagement is recorded only when a card actually
/// scrolls into view. The `/api/next` round trip happens ahead of the user, never on
/// the swipe — that's what keeps scrolling smooth with the engine server-side.
@MainActor
@Observable
final class FeedStore {
	enum Status: Equatable { case idle, loading, ready, error, exhausted }

	private(set) var cards: [FeedCard] = []
	private(set) var status: Status = .idle
	private(set) var seedTitle: String?
	/// Highest index the user has actually paged to. Cards beyond it are prefetch —
	/// safe to drop when a dive or retune changes the chain tip.
	private(set) var lastRevealedIndex = 0

	private var counter = 0
	private var building = false
	/// Bumped whenever the chain is redirected (start, dive, retune). In-flight builds
	/// capture the version before awaiting and discard their result if it moved — an
	/// append built from a stale tip must not land after the chain has turned.
	private var chainVersion = 0

	private let api = APIClient.shared
	private let profile: EngagementProfile
	private let defaults: UserDefaults

	/// How many cards to keep fetched beyond the one currently in view.
	private let lookahead = 3
	/// Trail persistence: revealed chain capped like the web's trailCap; on relaunch the
	/// most recent few cards are refetched (cold-cache budget) if the trail is fresh.
	/// The freshness window stands in for the web's sessionStorage lifetime — a trail
	/// from days ago shouldn't resurrect.
	private let trailCap = 100
	private let rehydrateRestoreCap = 8
	private let trailMaxAge: TimeInterval = 6 * 3600
	private let trailKey = "tangent.trail.v1"

	init(profile: EngagementProfile, defaults: UserDefaults = .standard) {
		self.profile = profile
		self.defaults = defaults
	}

	/// Begin a new rabbit hole from a seed article.
	func start(_ seed: String) async {
		chainVersion += 1
		cards = []
		seedTitle = seed
		lastRevealedIndex = 0
		status = .loading

		do {
			guard let article = try await api.card(title: seed) else {
				status = .error
				return
			}
			cards = [makeCard(article, from: "", relation: .seed, runStart: true)]
			status = .ready
			// Stock the chain ahead so the pager has pages to scroll into immediately.
			await ensureAhead(from: 0)
		} catch {
			status = .error
		}
	}

	/// A card scrolled into view: record engagement, then keep the chain stocked ahead.
	func didReveal(_ card: FeedCard, at index: Int) {
		lastRevealedIndex = max(lastRevealedIndex, index)
		profile.recordSeen(card.article)
		saveTrail()
		Task { await ensureAhead(from: index) }
	}

	/// The user-facing trail: cards actually paged to (prefetch excluded), oldest first.
	var revealedTrail: [FeedCard] {
		Array(cards.prefix(lastRevealedIndex + 1)).filter { !$0.pending }
	}

	/// Restore the previous session's chain from the persisted trail. Returns false
	/// when there is nothing fresh to restore (caller starts a new hole instead).
	/// Only the most recent nodes are refetched; recordSeen dedupes via the profile's
	/// persisted seen list, so a restore doesn't double-count df.
	func rehydrate() async -> Bool {
		guard let snap = loadTrail(),
		      Date().timeIntervalSince(snap.savedAt) < trailMaxAge,
		      !snap.nodes.isEmpty else { return false }

		chainVersion += 1
		let version = chainVersion
		status = .loading
		seedTitle = snap.seedTitle

		let restore = Array(snap.nodes.suffix(rehydrateRestoreCap))
		let fetched: [Article?] = await withTaskGroup(of: (Int, Article?).self) { group in
			for (index, node) in restore.enumerated() {
				group.addTask { [api] in (index, try? await api.card(title: node.title)) }
			}
			var out = [Article?](repeating: nil, count: restore.count)
			for await (index, article) in group { out[index] = article }
			return out
		}
		guard version == chainVersion else { return true }

		var restored: [FeedCard] = []
		for (node, article) in zip(restore, fetched) {
			// Fetch misses drop out of the chain (the web keeps them as tombstones in the
			// panel; here the trail is derived from cards, so they simply vanish).
			guard let article else { continue }
			restored.append(makeCard(
				article, from: node.fromTitle, relation: node.relation,
				// Pre-run-accounting snapshots lack the flag: boundary relations stand in.
				runStart: node.runStart ?? (node.relation != .link)
			))
		}
		guard !restored.isEmpty else {
			status = .idle
			return false
		}

		cards = restored
		lastRevealedIndex = cards.count - 1
		status = .ready
		await ensureAhead(from: lastRevealedIndex)
		return true
	}

	/// Dive into an in-article link: append the linked article as a fresh card at the tail
	/// (relation `.dive`) and steer the hole through it — mirrors the web reader, where
	/// following a link drops a card into the feed rather than deepening a reader stack.
	/// `from` is the article being read, for the new card's "Dove in from …" breadcrumb.
	///
	/// Optimistic: the destination title is already known, so the placeholder card is
	/// appended SYNCHRONOUSLY and its id returned at once — the caller can page to it
	/// immediately while the real body (and the clickthrough + seen signals, which need
	/// the server tokens) is patched in by `resolvePending` in the background.
	/// Unrevealed prefetched tail cards were built from the pre-dive tip, so they're
	/// dropped first (the web clears its prefetch buffer at the same point).
	func dive(into title: String, from: String) -> String {
		chainVersion += 1
		if lastRevealedIndex + 1 < cards.count {
			cards.removeSubrange((lastRevealedIndex + 1)...)
		}
		let placeholder = makeCard(
			.pendingStub(title: title), from: from, relation: .dive, runStart: true, pending: true
		)
		cards.append(placeholder)
		status = .ready
		Task { await resolvePending(id: placeholder.id, title: title) }
		return placeholder.id
	}

	/// Fill an optimistic placeholder with its fetched article, or drop it on failure
	/// (silent rollback — a single failed dive shouldn't flip the feed into the error
	/// banner; the user can tap the link again).
	private func resolvePending(id: String, title: String) async {
		do {
			guard let article = try await api.card(title: title) else {
				cards.removeAll { $0.id == id }
				return
			}
			guard let index = cards.firstIndex(where: { $0.id == id }) else { return }
			cards[index] = FeedCard(
				id: id, article: article, fromTitle: cards[index].fromTitle,
				relation: .dive, runStart: true
			)
			profile.recordClickthrough(article)
			profile.recordSeen(article)
			status = .ready
			await ensureAhead(from: cards.count - 1)
		} catch {
			cards.removeAll { $0.id == id }
		}
	}

	/// Explicit taste changed: prefetched picks were scored under the old flavor, so
	/// drop the unrevealed tail and restock from the user's actual position.
	func retune() {
		chainVersion += 1
		if lastRevealedIndex + 1 < cards.count {
			cards.removeSubrange((lastRevealedIndex + 1)...)
		}
		guard status == .ready || status == .exhausted else { return }
		status = .ready
		Task { await ensureAhead(from: lastRevealedIndex) }
	}

	/// Reset a mid-scroll error and try stocking the chain again.
	func retry() {
		guard status == .error else { return }
		status = .ready
		Task { await ensureAhead(from: lastRevealedIndex) }
	}

	/// One more hop before giving up: ask the engine for a *related* page from the chain
	/// tip (deliberate steering, so no surprise). Returns the new card's id, or nil when
	/// even the related pool is dry — the caller falls back to start-over.
	func jumpRelated() async -> String? {
		guard let tip = effectiveTip() else { return nil }
		let req = NextRequest(
			fromTitle: tip.article.title,
			mode: "related",
			interest: profile.interestPayload,
			session: sessionPayload(noSurprise: true)
		)
		do {
			let res = try await api.next(req)
			guard let article = res.article else { return nil }
			let card = makeCard(
				article, from: tip.article.title, relation: .related,
				runStart: true, categoryTokens: res.categoryTokens ?? []
			)
			cards.append(card)
			profile.recordSeen(article)
			status = .ready
			await ensureAhead(from: cards.count - 1)
			return card.id
		} catch {
			return nil
		}
	}

	/// Ensure at least `lookahead` cards exist beyond `index`, fetching as needed.
	func ensureAhead(from index: Int) async {
		guard !building else { return }
		building = true
		defer { building = false }
		let target = index + 1 + lookahead
		while cards.count < target && status != .exhausted {
			if !(await buildAppend()) { break }
		}
	}

	// MARK: - Building

	/// Fetch one more card from the effective chain tip and append it to `cards`.
	private func buildAppend() async -> Bool {
		guard let tip = effectiveTip() else { return false }
		let version = chainVersion

		let req = NextRequest(
			fromTitle: tip.article.title,
			mode: nil,
			interest: profile.interestPayload,
			session: sessionPayload(noSurprise: false)
		)

		do {
			let res = try await api.next(req)
			// The chain turned (dive/retune/restart) while this build was in flight —
			// its card was picked from a stale tip, so drop it.
			guard version == chainVersion else { return false }
			if res.exhausted == true { status = .exhausted; return false }
			guard let article = res.article else { return false }

			// Tangent breadcrumbs reference the card the user was actually on, not the
			// (possibly earlier) effective tip the engine explored from.
			let from = res.surprised ? (cards.last?.article.title ?? tip.article.title) : tip.article.title
			cards.append(makeCard(
				article, from: from, relation: res.relation,
				runStart: res.runReset ?? res.surprised,
				categoryTokens: res.categoryTokens ?? []
			))
			return true
		} catch {
			guard version == chainVersion else { return false }
			status = .error
			return false
		}
	}

	/// The chain tip. Tangents re-root the feed (run-based engine); the web's
	/// fast-skip heal has no equivalent here yet, so the tip is simply the last card.
	private func effectiveTip() -> FeedCard? {
		cards.last
	}

	/// Run accounting sent to the engine: the current run starts at the last
	/// runStart card and accumulates article tokens + category tokens from there.
	/// Mirrors the web's feedState.#runState.
	private func sessionPayload(noSurprise: Bool) -> SessionPayload {
		let start = cards.lastIndex(where: { $0.runStart }) ?? 0
		var runTokens = Set<String>()
		var runCategories = Set<String>()
		for card in cards[start...] {
			runTokens.formUnion(card.article.tokens)
			runCategories.formUnion(card.categoryTokens)
		}
		return SessionPayload(
			seenTitles: cards.map { $0.article.title },
			noSurprise: noSurprise,
			stepIndex: cards.count,
			runDepth: cards.count - start,
			runTokens: Array(runTokens),
			runCategories: Array(runCategories)
		)
	}

	private func makeCard(
		_ article: Article, from: String, relation: Relation,
		runStart: Bool = false, categoryTokens: [String] = [], pending: Bool = false
	) -> FeedCard {
		defer { counter += 1 }
		return FeedCard(
			id: "\(article.title)#\(counter)", article: article,
			fromTitle: from, relation: relation,
			runStart: runStart, categoryTokens: categoryTokens, pending: pending
		)
	}

	// MARK: - Trail persistence

	private struct TrailSnapshot: Codable {
		struct Node: Codable {
			let title: String
			let relation: Relation
			let fromTitle: String
			/// Optional so snapshots saved before run accounting still decode; restore
			/// falls back to boundary relations for those.
			let runStart: Bool?
		}
		let seedTitle: String
		let nodes: [Node]
		let savedAt: Date
	}

	private func saveTrail() {
		guard let seedTitle, !cards.isEmpty else { return }
		let nodes = revealedTrail.suffix(trailCap).map {
			TrailSnapshot.Node(
				title: $0.article.title, relation: $0.relation,
				fromTitle: $0.fromTitle, runStart: $0.runStart
			)
		}
		let snap = TrailSnapshot(seedTitle: seedTitle, nodes: Array(nodes), savedAt: Date())
		if let data = try? JSONEncoder().encode(snap) {
			defaults.set(data, forKey: trailKey)
		}
	}

	private func loadTrail() -> TrailSnapshot? {
		guard let data = defaults.data(forKey: trailKey) else { return nil }
		return try? JSONDecoder().decode(TrailSnapshot.self, from: data)
	}
}
