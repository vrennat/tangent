import Foundation

/// Backend configuration.
///
/// Defaults to the local SvelteKit dev server (`vite dev`), which the iOS Simulator
/// reaches at `localhost`. Point `baseURL` at `https://tangent.page` once `/api/next`
/// is deployed there. Overridable at launch with the `TANGENT_API_BASE` env var so
/// you can flip targets from a scheme without editing code.
enum Config {
	static let baseURL: URL = {
		if let override = ProcessInfo.processInfo.environment["TANGENT_API_BASE"],
		   let url = URL(string: override) {
			return url
		}
		return URL(string: "http://localhost:5173")!
	}()
}
