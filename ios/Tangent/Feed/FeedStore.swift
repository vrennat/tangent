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

	private var counter = 0
	private var building = false

	private let api = APIClient.shared
	private let profile: EngagementProfile

	/// How many cards to keep fetched beyond the one currently in view.
	private let lookahead = 3
	private let recentWindow = 5

	init(profile: EngagementProfile) {
		self.profile = profile
	}

	/// Begin a new rabbit hole from a seed article.
	func start(_ seed: String) async {
		cards = []
		seedTitle = seed
		status = .loading

		do {
			guard let article = try await api.card(title: seed) else {
				status = .error
				return
			}
			cards = [makeCard(article, from: "", relation: .seed)]
			status = .ready
			// Stock the chain ahead so the pager has pages to scroll into immediately.
			await ensureAhead(from: 0)
		} catch {
			status = .error
		}
	}

	/// A card scrolled into view: record engagement, then keep the chain stocked ahead.
	func didReveal(_ card: FeedCard, at index: Int) {
		profile.recordSeen(card.article)
		Task { await ensureAhead(from: index) }
	}

	/// Dive into an in-article link: append the linked article as a fresh card at the tail
	/// (relation `.dive`) and steer the hole through it — mirrors the web reader, where
	/// following a link drops a card into the feed rather than deepening a reader stack.
	/// `from` is the article being read, for the new card's "Dove in from …" breadcrumb.
	/// A dive is an intentional read, so it feeds both signals (clickthrough + seen).
	/// Returns the new card's id to scroll to, or nil if the article couldn't be fetched.
	func dive(into title: String, from: String) async -> String? {
		do {
			guard let article = try await api.card(title: title) else { return nil }
			let card = makeCard(article, from: from, relation: .dive)
			cards.append(card)
			profile.recordClickthrough(article)
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

		let req = NextRequest(
			fromTitle: tip.article.title,
			mode: nil,
			interest: profile.interestPayload,
			session: SessionPayload(
				seenTitles: cards.map { $0.article.title },
				recentTokens: recentTokens(),
				noSurprise: false
			)
		)

		do {
			let res = try await api.next(req)
			if res.exhausted == true { status = .exhausted; return false }
			guard let article = res.article else { return false }

			// Surprise breadcrumbs reference the card the user was actually on, not the
			// (possibly earlier) effective tip the engine explored from.
			let from = res.surprised ? (cards.last?.article.title ?? tip.article.title) : tip.article.title
			cards.append(makeCard(article, from: from, relation: res.relation))
			return true
		} catch {
			status = .error
			return false
		}
	}

	/// Last non-surprise card, so a dud detour self-heals (the next card builds from
	/// the pre-surprise tip rather than chasing the tangent).
	private func effectiveTip() -> FeedCard? {
		cards.last(where: { $0.relation != .surprise }) ?? cards.last
	}

	/// Tokens from the recent window, excluding the immediate parent (mirrors the web's
	/// slice that catches repetition loops one level back from the linking article).
	private func recentTokens() -> [String] {
		guard cards.count > 1 else { return [] }
		let window = cards.suffix(recentWindow + 1).dropLast()
		var tokens = Set<String>()
		for card in window { tokens.formUnion(card.article.tokens) }
		return Array(tokens)
	}

	private func makeCard(_ article: Article, from: String, relation: Relation) -> FeedCard {
		defer { counter += 1 }
		return FeedCard(id: "\(article.title)#\(counter)", article: article, fromTitle: from, relation: relation)
	}
}
