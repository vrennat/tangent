import SwiftUI

/// The in-app reader surface. From the feed, tapping a Wikipedia link inside an article
/// dives into a new feed card (`onDive`) rather than deepening a stack — so the feed
/// itself stays the record of the rabbit hole, matching the web reader. On surfaces with
/// no feed (LikedView), `onDive` is omitted and links navigate in place via the
/// NavigationStack (back-swipe to return). Other links open in a Safari sheet; content
/// images open the full-screen image viewer.
struct ReaderContainer: View {
	let rootTitle: String
	/// Feed surfaces handle a dive themselves (close the reader, drop a card). When nil,
	/// the reader navigates to the linked article in place.
	var onDive: ((String) -> Void)? = nil
	var onClose: () -> Void

	@State private var path: [String] = []
	@State private var external: ExternalLink?
	@State private var lightboxImage: LightboxImage?

	var body: some View {
		NavigationStack(path: $path) {
			reader(rootTitle)
				.navigationDestination(for: String.self) { reader($0) }
		}
		.tint(Theme.accent)
		.sheet(item: $external) { link in
			SafariView(url: link.url).ignoresSafeArea()
		}
		.fullScreenCover(item: $lightboxImage) { image in
			ImageViewer(image: image) { lightboxImage = nil }
		}
	}

	private func reader(_ title: String) -> some View {
		ArticleReaderView(
			title: title,
			onDive: { followed in
				// Feed: delegate (close reader, drop a card). No feed: navigate in place.
				if let onDive {
					onDive(followed)
				} else {
					path.append(followed)
				}
			},
			onExternal: { external = ExternalLink(url: $0) },
			onImage: { lightboxImage = $0 }
		)
		.toolbarBackground(Theme.surface, for: .navigationBar)
		.toolbarBackground(.visible, for: .navigationBar)
		.toolbar {
			ToolbarItem(placement: .topBarTrailing) {
				Button("Done", action: onClose).foregroundStyle(Theme.accent)
			}
		}
	}
}

/// Identifiable wrapper so an external URL can drive a `.sheet(item:)`.
private struct ExternalLink: Identifiable {
	let url: URL
	var id: String { url.absoluteString }
}

/// Identifiable title wrapper so a reader can be driven by `.fullScreenCover(item:)` —
/// used where the reader is opened by title rather than a resolved card (e.g. LikedView).
struct ReaderTitle: Identifiable {
	let title: String
	var id: String { title }
}
