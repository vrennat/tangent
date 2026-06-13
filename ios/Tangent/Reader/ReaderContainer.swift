import SwiftUI

/// The in-app reader surface. Hosts a navigation stack of article readers: tapping a
/// Wikipedia link inside an article pushes a new reader (native back-swipe to unwind),
/// so you can follow a reading rabbit hole without losing your place in the feed.
/// Non-article links open externally in a Safari sheet.
struct ReaderContainer: View {
	let rootTitle: String
	let profile: EngagementProfile
	var onClose: () -> Void

	@State private var path: [String] = []
	@State private var external: ExternalLink?

	var body: some View {
		NavigationStack(path: $path) {
			reader(rootTitle)
				.navigationDestination(for: String.self) { reader($0) }
		}
		.tint(Theme.accent)
		.sheet(item: $external) { link in
			SafariView(url: link.url).ignoresSafeArea()
		}
	}

	private func reader(_ title: String) -> some View {
		ArticleReaderView(
			title: title,
			onFollow: { followed in
				// Push immediately so navigation never waits; fetch the card alongside
				// only to feed the engagement profile (it needs the server tokens).
				path.append(followed)
				Task {
					if let article = try? await APIClient.shared.card(title: followed) {
						profile.recordClickthrough(article)
					}
				}
			},
			onExternal: { external = ExternalLink(url: $0) }
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
