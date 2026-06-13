import SwiftUI
import WebKit

/// Renders sanitized article HTML in a themed WKWebView and intercepts link taps:
/// Wikipedia article links are followed in-app (`onFollow`), everything else opens
/// externally (`onExternal`). In-page section/citation anchors scroll normally.
struct ReaderWebView: UIViewRepresentable {
	let title: String
	let bodyHTML: String
	var onFollow: (String) -> Void
	var onExternal: (URL) -> Void

	func makeCoordinator() -> Coordinator { Coordinator(self) }

	func makeUIView(context: Context) -> WKWebView {
		let webView = WKWebView(frame: .zero)
		webView.navigationDelegate = context.coordinator
		webView.isOpaque = false
		webView.backgroundColor = UIColor(Theme.void)
		webView.scrollView.backgroundColor = UIColor(Theme.void)
		webView.scrollView.contentInsetAdjustmentBehavior = .always

		let base = URL(string: "https://en.wikipedia.org/wiki/\(slug(title))")
		context.coordinator.basePath = base?.path
		webView.loadHTMLString(document(bodyHTML), baseURL: base)
		return webView
	}

	// Content is fixed for a given title (a followed link pushes a fresh view), so
	// there's nothing to update after the initial load.
	func updateUIView(_ webView: WKWebView, context: Context) {}

	private func slug(_ title: String) -> String {
		title.replacingOccurrences(of: " ", with: "_")
			.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? title
	}

	private func document(_ body: String) -> String {
		"""
		<!doctype html><html><head>
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
		<style>\(ReaderCSS.value)</style>
		</head><body>\(body)</body></html>
		"""
	}

	final class Coordinator: NSObject, WKNavigationDelegate {
		private let parent: ReaderWebView
		var basePath: String?

		init(_ parent: ReaderWebView) { self.parent = parent }

		func webView(
			_ webView: WKWebView,
			decidePolicyFor navigationAction: WKNavigationAction,
			decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
		) {
			// Allow the initial loadHTMLString and anything that isn't a tapped link.
			guard navigationAction.navigationType == .linkActivated,
			      let url = navigationAction.request.url else {
				decisionHandler(.allow)
				return
			}

			// In-page anchors (section/citation jumps) stay in the document.
			if url.fragment != nil, url.path == basePath {
				decisionHandler(.allow)
				return
			}

			decisionHandler(.cancel)
			if let articleTitle = WikiLink.articleTitle(from: url) {
				parent.onFollow(articleTitle)
			} else {
				parent.onExternal(url)
			}
		}
	}
}
