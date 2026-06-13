import Foundation

/// Backend configuration.
///
/// Defaults to production so device builds work when launched outside Xcode.
/// Overridable at launch with the `TANGENT_API_BASE` env var so simulator/local
/// development can still target `http://localhost:5173` without editing code.
enum Config {
	static let baseURL: URL = {
		if let override = ProcessInfo.processInfo.environment["TANGENT_API_BASE"],
		   let url = URL(string: override) {
			return url
		}
		return URL(string: "https://tangent.page")!
	}()
}
