import SwiftUI

/// One article in the reader: fetches its sanitized HTML and renders it, with loading
/// and error states. Link taps are forwarded up to the container (follow in-app /
/// open externally).
struct ArticleReaderView: View {
	let title: String
	var onFollow: (String) -> Void
	var onExternal: (URL) -> Void

	private enum Phase: Equatable { case loading, loaded(String), failed }
	@State private var phase: Phase = .loading

	var body: some View {
		ZStack {
			Theme.void.ignoresSafeArea()

			switch phase {
			case .loading:
				ProgressView().tint(Theme.accent)
			case .loaded(let html):
				ReaderWebView(title: title, bodyHTML: html, onFollow: onFollow, onExternal: onExternal)
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
			if let html = try await APIClient.shared.article(title: title) {
				phase = .loaded(html)
			} else {
				phase = .failed
			}
		} catch {
			phase = .failed
		}
	}
}
