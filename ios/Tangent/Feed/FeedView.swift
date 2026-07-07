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
	@State private var showTaste = false

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

			// A mid-scroll failure must not be silent — without this the feed just stops
			// producing cards and reads as broken.
			if store.status == .error && !store.cards.isEmpty {
				VStack {
					Spacer()
					errorBanner
				}
			}

			topBar
		}
		.task { if store.cards.isEmpty { await store.start(Seeds.cold().title) } }
		.sensoryFeedback(.selection, trigger: currentID)
		.fullScreenCover(item: $readArticle) { article in
			ReaderContainer(
				rootTitle: article.title,
				onDive: { title in
					// Card-based dive: close the reader, drop an optimistic placeholder at
					// the tail, and page to it at once — the body streams in behind the
					// landing animation instead of before it.
					readArticle = nil
					let id = store.dive(into: title, from: article.title)
					Task {
						// Let the new page materialize before snapping the pager to it.
						try? await Task.sleep(for: .milliseconds(50))
						withAnimation { currentID = id }
					}
				},
				onClose: { readArticle = nil }
			)
		}
		.sheet(isPresented: $showLiked) {
			LikedView(profile: profile) { showLiked = false }
		}
		.sheet(isPresented: $showTaste) {
			TastePickerView(
				profile: profile,
				onChange: { store.retune() },
				onClose: { showTaste = false }
			)
			.presentationDetents([.medium, .large])
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

	/// Dead-end recovery: offer one lateral hop before the full restart, mirroring the
	/// web's jumpRelated-then-start-over ladder.
	private var exhaustedFooter: some View {
		VStack(spacing: 20) {
			VStack(spacing: 8) {
				Text("End of the rabbit hole").font(Theme.serif(22)).foregroundStyle(Theme.ink)
				Text("for now").font(Theme.serif(16)).italic().foregroundStyle(Theme.muted)
			}
			Button {
				Task {
					if let id = await store.jumpRelated() {
						try? await Task.sleep(for: .milliseconds(50))
						withAnimation { currentID = id }
					}
				}
			} label: {
				Text("Jump somewhere related")
					.font(Theme.ui(15, .medium))
					.foregroundStyle(Theme.accent)
			}
			.buttonStyle(.plain)
			Button {
				Task { await store.start(Seeds.random(excluding: store.seedTitle).title) }
			} label: {
				Text("Start a new hole")
					.font(Theme.ui(15, .medium))
					.foregroundStyle(Theme.muted)
			}
			.buttonStyle(.plain)
		}
	}

	private var errorBanner: some View {
		HStack(spacing: 12) {
			Text("Connection hiccup")
				.font(Theme.ui(14))
				.foregroundStyle(Theme.muted)
			Button("Try again") { store.retry() }
				.font(Theme.ui(14, .semibold))
				.foregroundStyle(Theme.accent)
				.buttonStyle(.plain)
		}
		.padding(.horizontal, 18)
		.padding(.vertical, 12)
		.background(Theme.surface, in: Capsule())
		.overlay(Capsule().strokeBorder(Theme.hairline, lineWidth: 1))
		.padding(.bottom, 28)
	}

	private var topBar: some View {
		VStack {
			HStack {
				Text("Tangent")
					.font(Theme.serif(17, .semibold))
					.foregroundStyle(Theme.ink.opacity(0.85))
				Spacer()
				tasteButton
				likedButton
			}
			.padding(.horizontal, 28)
			.padding(.top, 8)
			Spacer()
		}
	}

	/// Opens the tangent-flavor picker. Warm when steering is active so the state is
	/// visible from the feed without opening the sheet.
	private var tasteButton: some View {
		let steering = profile.taste != "balanced"
		return Button { showTaste = true } label: {
			Image(systemName: "slider.horizontal.3")
				.font(.system(size: 18))
				.foregroundStyle(steering ? Theme.accent : Theme.muted)
		}
		.buttonStyle(.plain)
		.padding(.trailing, 16)
		.accessibilityLabel(steering ? "Tangent flavor: \(profile.taste)" : "Tangent flavor")
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
