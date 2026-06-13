import SwiftUI

/// One article in the reader: fetches its sanitized HTML and renders it, with loading
/// and error states. Taps are forwarded up to the container: an article link dives into
/// a new feed card (`onDive`), other links open externally (`onExternal`), and a content
/// image opens the full-screen viewer (`onImage`).
struct ArticleReaderView: View {
	let title: String
	var onDive: (String) -> Void
	var onExternal: (URL) -> Void
	var onImage: (LightboxImage) -> Void

	private enum Phase: Equatable { case loading, loaded(String), failed }
	@State private var phase: Phase = .loading

	var body: some View {
		ZStack {
			Theme.void.ignoresSafeArea()

			switch phase {
			case .loading:
				ProgressView().tint(Theme.accent)
			case .loaded(let html):
				ReaderWebView(title: title, bodyHTML: html, onDive: onDive, onExternal: onExternal, onImage: onImage)
					.ignoresSafeArea(edges: .bottom)
			case .failed:
				VStack(spacing: 14) {
					Text("Couldn't load this article.")
						.font(Theme.serif(18)).foregroundStyle(Theme.ink)
					Button("Open on Wikipedia") {
						if let url = URL(string: "https://en.wikipedia.org/wiki/\(title.replacingOccurrences(of: " ", with: "_"))") {
							onExternal(url)
						}
					}
					.foregroundStyle(Theme.accent)
				}
				.padding(32)
			}
		}
		.navigationTitle(title)
		.navigationBarTitleDisplayMode(.inline)
		.task(id: title) { await load() }
	}

	private func load() async {
		phase = .loading
		do {
			if let html = try await ArticleHTMLCache.shared.html(for: title) {
				phase = .loaded(html)
			} else {
				phase = .failed
			}
		} catch {
			phase = .failed
		}
	}
}
