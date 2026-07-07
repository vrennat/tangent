import Foundation
import Observation

/// Account state + profile sync — the iOS analogue of the web's authState + sync.ts.
///
/// Sync regimes (docs/specs/2026-06-13-accounts-design.md):
///  - MERGE (union/max) fires once, at explicit login — the recovery / new-device path.
///  - Steady state is revision-guarded: on launch adopt the server profile only if
///    another device advanced its revision past what this device last synced; otherwise
///    keep local (this launch's session decay must not be clobbered) and push.
///  - Pushes fire on scene-background and after login; every op runs on @MainActor so
///    pulls, pushes, and merges can't interleave mid-flight state.
@MainActor
@Observable
final class AccountStore {
	enum Phase: Equatable {
		case signedOut
		case codeSent(email: String)
		case signedIn(AccountUser)
	}

	private(set) var phase: Phase = .signedOut
	private(set) var isBusy = false
	private(set) var errorMessage: String?

	private let api = APIClient.shared
	private let profile: EngagementProfile
	private let defaults: UserDefaults
	private let syncedRevKey = "tangent.syncedRevision.v1"
	private var syncing = false

	init(profile: EngagementProfile, defaults: UserDefaults = .standard) {
		self.profile = profile
		self.defaults = defaults
	}

	var isSignedIn: Bool {
		if case .signedIn = phase { return true }
		return false
	}

	/// Launch path: if a token survives in the keychain, revalidate it and run the
	/// steady-state pull-or-push. A dead token (revoked/expired) signs out quietly.
	func restore() async {
		guard KeychainStore.get(APIClient.sessionTokenKey) != nil else { return }
		do {
			guard let user = try await api.me() else {
				KeychainStore.delete(APIClient.sessionTokenKey)
				return
			}
			phase = .signedIn(user)
			await pullOrPush()
		} catch {
			// Network trouble at launch — keep the token and stay optimistic; the next
			// foreground sync retries.
			phase = .signedOut
		}
	}

	func requestCode(email: String) async {
		errorMessage = nil
		isBusy = true
		defer { isBusy = false }
		do {
			try await api.requestCode(email: email)
			phase = .codeSent(email: email)
		} catch {
			errorMessage = "Couldn't send the code. Check the address and try again."
		}
	}

	func verifyCode(email: String, code: String) async {
		errorMessage = nil
		isBusy = true
		defer { isBusy = false }
		do {
			let (user, token) = try await api.verifyCode(email: email, code: code)
			KeychainStore.set(token, for: APIClient.sessionTokenKey)
			phase = .signedIn(user)
			await mergeOnLogin()
		} catch {
			errorMessage = "That code didn't work. It may have expired."
		}
	}

	/// Revoke server-side (best effort), drop the token, keep the local profile —
	/// signing out must never destroy on-device history.
	func signOut() async {
		try? await api.logout()
		KeychainStore.delete(APIClient.sessionTokenKey)
		defaults.removeObject(forKey: syncedRevKey)
		phase = .signedOut
	}

	/// Steady-state push. Call on scene-background and after meaningful bursts.
	func syncNow() async {
		guard isSignedIn, profile.pendingSync, !syncing else { return }
		syncing = true
		defer { syncing = false }
		let rev = profile.rev
		do {
			let stored = try await api.putProfile(profile.persistedDTO())
			profile.markPushed(rev)
			setSyncedRev(stored.revision)
		} catch {
			// Best-effort: pendingSync stays true and the next trigger retries.
		}
	}

	// MARK: - Internals

	private func mergeOnLogin() async {
		do {
			let rev = profile.rev
			let stored = try await api.mergeProfile(profile.persistedDTO())
			profile.adopt(stored.data)
			profile.markPushed(rev)
			setSyncedRev(stored.revision)
			await backfillLikedArticles()
		} catch {
			errorMessage = "Signed in, but the profile merge failed. It will retry."
		}
	}

	private func pullOrPush() async {
		do {
			guard let stored = try await api.getProfile() else {
				await syncNow()
				return
			}
			if stored.revision > syncedRev() {
				// Another device advanced the profile — adopt theirs.
				profile.adopt(stored.data)
				setSyncedRev(stored.revision)
				await backfillLikedArticles()
			} else {
				await syncNow()
			}
		} catch {
			// Launch sync is best-effort.
		}
	}

	/// Titles liked on another device arrive as bare strings; the Liked screen needs
	/// full articles, so fetch the missing ones quietly (capped — lists are small).
	private func backfillLikedArticles() async {
		let have = Set(profile.likedArticles.map(\.title))
		let missing = profile.likedTitles.subtracting(have).prefix(50)
		for title in missing {
			if let article = try? await api.card(title: title) {
				profile.backfillLikedArticle(article)
			}
		}
	}

	private func syncedRev() -> Int {
		defaults.integer(forKey: syncedRevKey)
	}

	private func setSyncedRev(_ rev: Int) {
		defaults.set(rev, forKey: syncedRevKey)
	}
}
