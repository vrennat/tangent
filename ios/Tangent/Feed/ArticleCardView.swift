import SwiftUI

/// One full-screen feed card. Text-first editorial layout: the title and hook lead,
/// the image is a supporting element. Tracks dwell time for the engagement profile.
struct ArticleCardView: View {
	let card: FeedCard
	let profile: EngagementProfile
	var onRead: (Article) -> Void

	@State private var appearedAt: Date?
	/// Total on-screen time across appearances, for skip detection (mirrors the web's
	/// visibleTotalMs): a card seen long enough to register but left quickly with no
	/// interaction reads as a weak "not this" signal.
	@State private var visibleTotalMs: Double = 0
	@State private var interacted = false

	private var article: Article { card.article }
	private var isLiked: Bool { profile.isLiked(article.title) }

	var body: some View {
		VStack(alignment: .leading, spacing: 0) {
			Spacer(minLength: 0)

			if let kicker = card.relation.kicker(from: card.fromTitle) {
				Text(kicker.uppercased())
					.font(Theme.ui(12, .semibold))
					.tracking(0.8)
					.foregroundStyle(card.relation == .surprise ? Theme.spark : Theme.accent)
					.padding(.bottom, 10)
			}

			Text(article.title)
				.font(Theme.serif(34, .semibold))
				.foregroundStyle(Theme.ink)
				.fixedSize(horizontal: false, vertical: true)

			if let description = article.description {
				Text(description)
					.font(Theme.serif(17))
					.italic()
					.foregroundStyle(Theme.muted)
					.padding(.top, 6)
			}

			if let thumb = article.thumbnail, let url = URL(string: thumb.source) {
				AsyncImage(url: url) { image in
					image.resizable().scaledToFill()
				} placeholder: {
					Theme.surface
				}
				.frame(maxWidth: .infinity)
				.frame(height: 200)
				.clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
				.overlay(
					RoundedRectangle(cornerRadius: 14, style: .continuous)
						.strokeBorder(Theme.hairline, lineWidth: 1)
				)
				.padding(.top, 18)
			}

			if card.pending {
				skeletonBody
			} else {
				Text(article.extract)
					.font(Theme.serif(18))
					.foregroundStyle(Theme.ink.opacity(0.92))
					.lineSpacing(5)
					.lineLimit(article.thumbnail == nil ? 12 : 6)
					.padding(.top, 18)
			}

			Spacer(minLength: 0)

			if !card.pending {
				actions
			}
		}
		.padding(.horizontal, 28)
		.padding(.vertical, 64)
		.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
		.background(Theme.void)
		.sensoryFeedback(.impact(weight: .medium), trigger: isLiked)
		.onAppear {
			appearedAt = Date()
			Task { _ = try? await ArticleHTMLCache.shared.html(for: article.title) }
		}
		.onDisappear {
			guard let start = appearedAt else { return }
			appearedAt = nil
			let ms = Date().timeIntervalSince(start) * 1000
			visibleTotalMs += ms
			profile.recordDwell(article, ms: ms)
			if visibleTotalMs >= Tune.skipMinVisibleMs,
			   visibleTotalMs < Tune.skipThresholdMs,
			   !interacted {
				profile.recordSkip(article)
			}
		}
	}

	/// Calm static placeholder lines while a dived card's body loads. Kept shorter than
	/// any real extract so the swap only ever grows the card downward.
	private var skeletonBody: some View {
		VStack(alignment: .leading, spacing: 10) {
			ForEach(0..<5, id: \.self) { line in
				RoundedRectangle(cornerRadius: 4)
					.fill(Theme.surface)
					.frame(height: 14)
					.frame(maxWidth: .infinity)
					.padding(.trailing, line == 4 ? 120 : CGFloat((line * 23) % 56))
			}
		}
		.padding(.top, 18)
		.accessibilityLabel("Loading article")
	}

	private var actions: some View {
		HStack(spacing: 20) {
			Button {
				interacted = true
				profile.toggleLike(article)
			} label: {
				Image(systemName: isLiked ? "star.fill" : "star")
					.font(.system(size: 22))
					.foregroundStyle(isLiked ? Theme.like : Theme.muted)
			}
			.buttonStyle(.plain)

			Spacer()

			Button {
				interacted = true
				profile.recordClickthrough(article)
				onRead(article)
			} label: {
				HStack(spacing: 6) {
					Text("Read")
					Image(systemName: "arrow.up.right")
				}
				.font(Theme.ui(15, .medium))
				.foregroundStyle(Theme.accent)
			}
			.buttonStyle(.plain)
		}
	}
}
