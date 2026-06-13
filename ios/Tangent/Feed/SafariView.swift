import SwiftUI
import SafariServices

/// In-app reader for "Read full article" — a native SFSafariViewController sheet.
struct SafariView: UIViewControllerRepresentable {
	let url: URL

	func makeUIViewController(context: Context) -> SFSafariViewController {
		let config = SFSafariViewController.Configuration()
		config.entersReaderIfAvailable = true
		let controller = SFSafariViewController(url: url, configuration: config)
		controller.preferredControlTintColor = UIColor(Theme.accent)
		controller.preferredBarTintColor = UIColor(Theme.void)
		return controller
	}

	func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}
