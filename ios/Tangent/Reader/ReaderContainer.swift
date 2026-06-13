import SwiftUI

/// The in-app reader surface: one article at a time. Tapping a Wikipedia link inside an
/// article dives into a new feed card (`onDive`) rather than deepening a reader stack —
/// so the feed itself stays the record of the rabbit hole, matching the web reader. Other
/// links open in a Safari sheet; content images open the full-screen image viewer.
///
/// (A single-level NavigationStack still wraps the reader to carry the title bar + Done.)
struct ReaderContainer: View {
	let rootTitle: String
	/// Dive into an in-article link — the feed closes the reader and drops the card.
	var onDive: (String) -> Void
	var onClose: () -> Void

	@State private var external: ExternalLink?
	@State private var lightboxImage: LightboxImage?

	var body: some View {
		NavigationStack {
			ArticleReaderView(
				title: rootTitle,
				onDive: onDive,
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
		.tint(Theme.accent)
		.sheet(item: $external) { link in
			SafariView(url: link.url).ignoresSafeArea()
		}
		.fullScreenCover(item: $lightboxImage) { image in
			ImageViewer(image: image) { lightboxImage = nil }
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
