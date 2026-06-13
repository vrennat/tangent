import SwiftUI

/// The vertical, full-screen paging feed. Native scroll physics + page snapping via
/// `.scrollTargetBehavior(.paging)` (iOS 17). Prefetch fires as the user approaches
/// the end of the loaded chain, so the next card is ready before they reach it.
struct FeedView: View {
	@State private var store: FeedStore
	private let profile: EngagementProfile

	@State private var currentID: String?
	@State private var readArticle: Article?

	init(profile: EngagementProfile) {
		self.profile = profile
		_store = State(initialValue: FeedStore(profile: profile))
	}

	var body: some View {
		ZStack {
			Theme.void.ignoresSafeArea()

			ScrollView(.vertical) {
				LazyVStack(spacing: 0) {
					ForEach(Array(store.cards.enumerated()), id: \.element.id) { index, card in
						ArticleCardView(card: card, profile: profile) { readArticle = $0 }
							.containerRelativeFrame([.horizontal, .vertical])
							.id(card.id)
							.onAppear { store.didReveal(card, at: index) }
					}

					if store.status == .exhausted {
						exhaustedFooter.containerRelativeFrame([.horizontal, .vertical])
					}
				}
				.scrollTargetLayout()
			}
			.scrollTargetBehavior(.paging)
			.scrollIndicators(.hidden)
			.ignoresSafeArea()
			.scrollPosition(id: $currentID)

			if store.cards.isEmpty {
				overlayState
			}

			wordmark
		}
		.task { if store.cards.isEmpty { await store.start(Seeds.cold().title) } }
		.sensoryFeedback(.selection, trigger: currentID)
		.fullScreenCover(item: $readArticle) { article in
			ReaderContainer(rootTitle: article.title, profile: profile) { readArticle = nil }
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

	private var wordmark: some View {
		VStack {
			HStack {
				Text("Tangent")
					.font(Theme.serif(17, .semibold))
					.foregroundStyle(Theme.ink.opacity(0.85))
				Spacer()
			}
			.padding(.horizontal, 28)
			.padding(.top, 8)
			Spacer()
		}
	}
}
