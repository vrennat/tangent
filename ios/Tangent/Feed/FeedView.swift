import SwiftUI

/// The vertical, full-screen paging feed. Native scroll physics + page snapping via
/// `.scrollTargetBehavior(.paging)` (iOS 17). Prefetch fires as the user approaches
/// the end of the loaded chain, so the next card is ready before they reach it.
struct FeedView: View {
	@State private var store: FeedStore
	private let profile: EngagementProfile

	@State private var currentID: String?
	@State private var readArticle: Article?
	@State private var showLiked = false

	init(profile: EngagementProfile) {
		self.profile = profile
		_store = State(initialValue: FeedStore(profile: profile))
	}

	var body: some View {
		ZStack {
			Theme.void.ignoresSafeArea()

			GeometryReader { proxy in
				ScrollView(.vertical) {
					LazyVStack(spacing: 0) {
						ForEach(Array(store.cards.enumerated()), id: \.element.id) { index, card in
							ArticleCardView(card: card, profile: profile) { readArticle = $0 }
								.frame(width: proxy.size.width, height: proxy.size.height)
								.clipped()
								.id(card.id)
								.onAppear { store.didReveal(card, at: index) }
						}

						if store.status == .exhausted {
							exhaustedFooter
								.frame(width: proxy.size.width, height: proxy.size.height)
						}
					}
					.scrollTargetLayout()
				}
				.frame(width: proxy.size.width, height: proxy.size.height)
				.scrollTargetBehavior(.paging)
				.scrollIndicators(.hidden)
				.ignoresSafeArea()
				.scrollPosition(id: $currentID)
			}

			if store.cards.isEmpty {
				overlayState
			}

			topBar
		}
		.task { if store.cards.isEmpty { await store.start(Seeds.cold().title) } }
		.sensoryFeedback(.selection, trigger: currentID)
		.fullScreenCover(item: $readArticle) { article in
			ReaderContainer(
				rootTitle: article.title,
				onDive: { title in
					// Card-based dive: close the reader, drop the linked article as a fresh
					// card at the tail, then page to it — the feed stays the rabbit hole.
					readArticle = nil
					Task {
						if let id = await store.dive(into: title, from: article.title) {
							// Let the new page materialize before snapping the pager to it.
							try? await Task.sleep(for: .milliseconds(50))
							withAnimation { currentID = id }
						}
					}
				},
				onClose: { readArticle = nil }
			)
		}
		.sheet(isPresented: $showLiked) {
			LikedView(profile: profile) { showLiked = false }
		}
		.preferredColorScheme(.dark)
	}

	@ViewBuilder private var overlayState: some View {
		switch store.status {
		case .loading, .idle:
			ProgressView().tint(Theme.accent)
		case .error:
			VStack(spacing: 12) {
				Text("Couldn't load the feed.").font(Theme.serif(20)).foregroundStyle(Theme.ink)
				Button("Try again") { Task { await store.start(Seeds.cold().title) } }
					.foregroundStyle(Theme.accent)
			}
		default:
			EmptyView()
		}
	}

	private var exhaustedFooter: some View {
		VStack(spacing: 12) {
			Text("End of the rabbit hole").font(Theme.serif(22)).foregroundStyle(Theme.ink)
			Text("for now").font(Theme.serif(16)).italic().foregroundStyle(Theme.muted)
		}
	}

	private var topBar: some View {
		VStack {
			HStack {
				Text("Tangent")
					.font(Theme.serif(17, .semibold))
					.foregroundStyle(Theme.ink.opacity(0.85))
				Spacer()
				likedButton
			}
			.padding(.horizontal, 28)
			.padding(.top, 8)
			Spacer()
		}
	}

	/// Opens the Liked collection. Fills + warms once you have likes, with a count badge,
	/// so the feature is discoverable from the otherwise chrome-free feed.
	private var likedButton: some View {
		let count = profile.likedArticles.count
		return Button { showLiked = true } label: {
			Image(systemName: count == 0 ? "star" : "star.fill")
				.font(.system(size: 18))
				.foregroundStyle(count == 0 ? Theme.muted : Theme.like)
				.overlay(alignment: .topTrailing) {
					if count > 0 {
						Text("\(count)")
							.font(Theme.ui(10, .semibold))
							.foregroundStyle(Theme.ink)
							.padding(.horizontal, 4)
							.padding(.vertical, 1)
							.background(Theme.surface, in: Capsule())
							.overlay(Capsule().strokeBorder(Theme.hairline, lineWidth: 1))
							.offset(x: 11, y: -9)
						}
				}
		}
		.buttonStyle(.plain)
		.accessibilityLabel("Liked articles, \(count)")
	}
}
