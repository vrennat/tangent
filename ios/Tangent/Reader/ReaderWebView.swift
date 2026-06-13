import SwiftUI
import WebKit

/// Renders sanitized article HTML in a themed WKWebView and intercepts taps:
/// Wikipedia article links dive into a new feed card (`onDive`), other links open
/// externally (`onExternal`), and content images open the full-screen viewer
/// (`onImage`). In-page section/citation anchors scroll normally.
struct ReaderWebView: UIViewRepresentable {
	let title: String
	let bodyHTML: String
	var onDive: (String) -> Void
	var onExternal: (URL) -> Void
	var onImage: (LightboxImage) -> Void

	private static let imageHandlerName = "image"

	func makeCoordinator() -> Coordinator { Coordinator(self) }

	func makeUIView(context: Context) -> WKWebView {
		let config = WKWebViewConfiguration()
		// Register before the load so `window.webkit.messageHandlers.image` exists when
		// the injected script runs. Removed in dismantleUIView (the controller retains it).
		config.userContentController.add(context.coordinator, name: Self.imageHandlerName)

		let webView = WKWebView(frame: .zero, configuration: config)
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

	// Content is fixed for a given title (a dive replaces this whole reader), so there's
	// nothing to update after the initial load.
	func updateUIView(_ webView: WKWebView, context: Context) {}

	static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
		webView.configuration.userContentController.removeScriptMessageHandler(forName: imageHandlerName)
	}

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
		</head><body>\(body)<script>\(ReaderJS.value)</script></body></html>
		"""
	}

	final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
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
				parent.onDive(articleTitle)
			} else if isFileLink(url) {
				// Figure/thumbnail images are wrapped in a File: file-description link. Taps
				// on them are caught by the injected lightbox script and open the image
				// viewer instead — so suppress the file page rather than opening Safari. (If
				// the script's preventDefault already stopped the navigation, this never runs.)
			} else {
				parent.onExternal(url)
			}
		}

		func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
			guard message.name == "image",
			      let body = message.body as? [String: Any],
			      let src = body["src"] as? String,
			      let url = URL(string: src) else { return }
			let caption = (body["caption"] as? String) ?? ""
			parent.onImage(LightboxImage(url: url, caption: caption))
		}

		private func isFileLink(_ url: URL) -> Bool {
			url.path.hasPrefix("/wiki/File:") || url.path.hasPrefix("/wiki/Image:")
		}
	}
}
