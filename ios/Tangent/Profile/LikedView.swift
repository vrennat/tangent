import SwiftUI

/// Your liked articles — the collection built by tapping the star on a feed card.
///
/// The star is an engagement signal (it boosts the interest vector), so this is a
/// "Liked" list, not a neutral bookmark: removing a row unlikes the article, which
/// also decrements its taste weight. Self-contained — it presents its own reader.
struct LikedView: View {
	let profile: EngagementProfile
	var onClose: () -> Void

	@State private var reading: ReaderTitle?

	var body: some View {
		NavigationStack {
			Group {
				if profile.likedArticles.isEmpty {
					emptyState
				} else {
					list
				}
			}
			.frame(maxWidth: .infinity, maxHeight: .infinity)
			.background(Theme.void)
			.navigationTitle("Liked")
			.navigationBarTitleDisplayMode(.inline)
			.toolbarBackground(Theme.surface, for: .navigationBar)
			.toolbarBackground(.visible, for: .navigationBar)
			.toolbar {
				ToolbarItem(placement: .topBarTrailing) {
					Button("Done", action: onClose).foregroundStyle(Theme.accent)
				}
			}
		}
		.tint(Theme.accent)
		.fullScreenCover(item: $reading) { item in
			// No feed on this surface, so `onDive` is omitted — links navigate in place
			// inside the reader's NavigationStack (back-swipe to return).
			ReaderContainer(rootTitle: item.title, onClose: { reading = nil })
		}
	}

	private var list: some View {
		List {
			ForEach(profile.likedArticles) { article in
				Button {
					profile.recordClickthrough(article)
					reading = ReaderTitle(title: article.title)
				} label: {
					row(article)
				}
				.buttonStyle(.plain)
				.listRowBackground(Theme.void)
				.listRowInsets(EdgeInsets())
				.listRowSeparatorTint(Theme.hairline)
				.swipeActions(edge: .trailing) {
					Button(role: .destructive) {
						profile.toggleLike(article)
					} label: {
						Label("Remove", systemImage: "star.slash")
					}
				}
			}
		}
		.listStyle(.plain)
		.scrollContentBackground(.hidden)
	}

	private func row(_ article: Article) -> some View {
		HStack(alignment: .top, spacing: 14) {
			VStack(alignment: .leading, spacing: 4) {
				Text(article.title)
					.font(Theme.serif(19, .semibold))
					.foregroundStyle(Theme.ink)
					.fixedSize(horizontal: false, vertical: true)
				Text(article.description ?? article.extract)
					.font(Theme.serif(14))
					.foregroundStyle(Theme.muted)
					.lineLimit(2)
					.fixedSize(horizontal: false, vertical: true)
			}

			Spacer(minLength: 0)

			if let thumb = article.thumbnail, let url = URL(string: thumb.source) {
				AsyncImage(url: url) { image in
					image.resizable().scaledToFill()
				} placeholder: {
					Theme.surface
				}
				.frame(width: 64, height: 64)
				.clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
				.overlay(
					RoundedRectangle(cornerRadius: 10, style: .continuous)
						.strokeBorder(Theme.hairline, lineWidth: 1)
				)
			}
		}
		.padding(.horizontal, 24)
		.padding(.vertical, 16)
		.contentShape(Rectangle())
	}

	private var emptyState: some View {
		VStack(spacing: 10) {
			Image(systemName: "star")
				.font(.system(size: 32))
				.foregroundStyle(Theme.muted)
			Text("Nothing liked yet")
				.font(Theme.serif(20))
				.foregroundStyle(Theme.ink)
			Text("Tap the star on any card to keep it here.")
				.font(Theme.serif(15))
				.foregroundStyle(Theme.muted)
				.multilineTextAlignment(.center)
		}
		.padding(32)
	}
}
