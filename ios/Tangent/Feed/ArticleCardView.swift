import SwiftUI

/// One full-screen feed card. Text-first editorial layout: the title and hook lead,
/// the image is a supporting element. Tracks dwell time for the engagement profile.
struct ArticleCardView: View {
	let card: FeedCard
	let profile: EngagementProfile
	var onRead: (Article) -> Void

	@State private var appearedAt: Date?

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

			Text(article.extract)
				.font(Theme.serif(18))
				.foregroundStyle(Theme.ink.opacity(0.92))
				.lineSpacing(5)
				.lineLimit(article.thumbnail == nil ? 12 : 6)
				.padding(.top, 18)

			Spacer(minLength: 0)

			actions
		}
		.padding(.horizontal, 28)
		.padding(.vertical, 64)
		.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
		.background(Theme.void)
		.sensoryFeedback(.impact(weight: .medium), trigger: isLiked)
		.onAppear { appearedAt = Date() }
		.onDisappear {
			if let start = appearedAt {
				profile.recordDwell(article, ms: Date().timeIntervalSince(start) * 1000)
			}
		}
	}

	private var actions: some View {
		HStack(spacing: 20) {
			Button {
				profile.toggleLike(article)
			} label: {
				Image(systemName: isLiked ? "heart.fill" : "heart")
					.font(.system(size: 22))
					.foregroundStyle(isLiked ? Theme.like : Theme.muted)
			}
			.buttonStyle(.plain)

			Spacer()

			Button {
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
