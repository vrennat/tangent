import SwiftUI

@main
struct TangentApp: App {
	/// The engagement profile is app-lifetime state shared by the feed and account sync.
	@State private var profile: EngagementProfile
	@State private var account: AccountStore
	@Environment(\.scenePhase) private var scenePhase

	init() {
		let profile = EngagementProfile()
		_profile = State(initialValue: profile)
		_account = State(initialValue: AccountStore(profile: profile))
	}

	var body: some Scene {
		WindowGroup {
			FeedView(profile: profile, account: account)
				.preferredColorScheme(.dark)
				.task { await account.restore() }
		}
		.onChange(of: scenePhase) { _, phase in
			// Backgrounding is the reliable moment to flush local engagement upstream.
			if phase == .background {
				Task { await account.syncNow() }
			}
		}
	}
}
