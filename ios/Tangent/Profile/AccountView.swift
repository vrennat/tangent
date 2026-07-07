import SwiftUI

/// Sign in with an emailed 6-digit code and keep the profile synced across devices.
/// Passkeys stay web-only for now (they need a signing team + associated domains).
struct AccountView: View {
	let account: AccountStore
	var onClose: () -> Void

	@State private var email = ""
	@State private var code = ""
	@FocusState private var focused: Bool

	var body: some View {
		NavigationStack {
			VStack(alignment: .leading, spacing: 20) {
				switch account.phase {
				case .signedOut:
					emailStep
				case .codeSent(let sentTo):
					codeStep(sentTo: sentTo)
				case .signedIn(let user):
					signedIn(user)
				}

				if let message = account.errorMessage {
					Text(message)
						.font(Theme.ui(13))
						.foregroundStyle(Theme.like)
				}

				Spacer(minLength: 0)
			}
			.padding(24)
			.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
			.background(Theme.void)
			.navigationTitle("Account")
			.navigationBarTitleDisplayMode(.inline)
			.toolbarBackground(Theme.surface, for: .navigationBar)
			.toolbarBackground(.visible, for: .navigationBar)
			.toolbar {
				ToolbarItem(placement: .topBarTrailing) {
					Button("Done", action: onClose).foregroundStyle(Theme.accent)
				}
			}
		}
		.tint(Theme.accent)
	}

	private var emailStep: some View {
		VStack(alignment: .leading, spacing: 14) {
			Text("Sync your tangent")
				.font(Theme.serif(22, .semibold))
				.foregroundStyle(Theme.ink)
			Text("Sign in with your email and your likes, taste, and interests follow you across devices.")
				.font(Theme.serif(15))
				.foregroundStyle(Theme.muted)
				.fixedSize(horizontal: false, vertical: true)

			TextField("you@example.com", text: $email)
				.textContentType(.emailAddress)
				.keyboardType(.emailAddress)
				.textInputAutocapitalization(.never)
				.autocorrectionDisabled()
				.focused($focused)
				.padding(12)
				.background(Theme.surface, in: RoundedRectangle(cornerRadius: 10))
				.foregroundStyle(Theme.ink)

			Button {
				Task { await account.requestCode(email: email.trimmingCharacters(in: .whitespaces)) }
			} label: {
				busyLabel("Email me a code")
			}
			.buttonStyle(.plain)
			.foregroundStyle(Theme.accent)
			.disabled(account.isBusy || email.trimmingCharacters(in: .whitespaces).isEmpty)
		}
	}

	private func codeStep(sentTo: String) -> some View {
		VStack(alignment: .leading, spacing: 14) {
			Text("Check your email")
				.font(Theme.serif(22, .semibold))
				.foregroundStyle(Theme.ink)
			Text("Enter the 6-digit code sent to \(sentTo).")
				.font(Theme.serif(15))
				.foregroundStyle(Theme.muted)

			TextField("123456", text: $code)
				.textContentType(.oneTimeCode)
				.keyboardType(.numberPad)
				.focused($focused)
				.padding(12)
				.background(Theme.surface, in: RoundedRectangle(cornerRadius: 10))
				.foregroundStyle(Theme.ink)

			Button {
				Task { await account.verifyCode(email: sentTo, code: code.trimmingCharacters(in: .whitespaces)) }
			} label: {
				busyLabel("Sign in")
			}
			.buttonStyle(.plain)
			.foregroundStyle(Theme.accent)
			.disabled(account.isBusy || code.trimmingCharacters(in: .whitespaces).count != 6)
		}
	}

	private func signedIn(_ user: AccountUser) -> some View {
		VStack(alignment: .leading, spacing: 14) {
			Text("Signed in")
				.font(Theme.serif(22, .semibold))
				.foregroundStyle(Theme.ink)
			Text(user.email)
				.font(Theme.ui(15))
				.foregroundStyle(Theme.muted)
			Text("Your profile syncs automatically. Signing out keeps everything on this device.")
				.font(Theme.serif(14))
				.foregroundStyle(Theme.faint)
				.fixedSize(horizontal: false, vertical: true)

			Button {
				Task { await account.signOut() }
			} label: {
				Text("Sign out")
					.font(Theme.ui(15, .medium))
					.foregroundStyle(Theme.like)
			}
			.buttonStyle(.plain)
			.padding(.top, 8)
		}
	}

	private func busyLabel(_ title: String) -> some View {
		HStack(spacing: 8) {
			if account.isBusy { ProgressView().tint(Theme.accent) }
			Text(title).font(Theme.ui(15, .semibold))
		}
	}
}
