import SwiftUI

@main
struct TangentApp: App {
	/// The engagement profile is app-lifetime state shared by the feed and (later) sync.
	@State private var profile = EngagementProfile()

	var body: some Scene {
		WindowGroup {
			FeedView(profile: profile)
				.preferredColorScheme(.dark)
		}
	}
}
