import SwiftUI

/// A content image surfaced from the reader, driving the full-screen viewer via
/// `.fullScreenCover(item:)`. `id` is the URL so re-tapping the same image re-presents.
struct LightboxImage: Identifiable {
	let url: URL
	let caption: String
	var id: String { url.absoluteString }
}

/// Full-screen image viewer: the tapped figure shown large over the dark backdrop, with
/// its caption and a close control. Tap anywhere — or the close button — to dismiss.
/// Mirrors the web reader's lightbox ("full-screen picture on tap").
struct ImageViewer: View {
	let image: LightboxImage
	var onClose: () -> Void

	var body: some View {
		ZStack {
			Theme.void.ignoresSafeArea()

			AsyncImage(url: image.url) { phase in
				switch phase {
				case .success(let img):
					img.resizable().scaledToFit()
				case .failure:
					Image(systemName: "photo")
						.font(.system(size: 44))
						.foregroundStyle(Theme.muted)
				default:
					ProgressView().tint(Theme.accent)
				}
			}
			.padding(.horizontal, 12)

			if !image.caption.isEmpty {
				VStack {
					Spacer()
					Text(image.caption)
						.font(Theme.serif(14))
						.foregroundStyle(Theme.faint)
						.multilineTextAlignment(.center)
						.padding(.horizontal, 24)
						.padding(.bottom, 24)
				}
			}

			VStack {
				HStack {
					Spacer()
					Button(action: onClose) {
						Image(systemName: "xmark")
							.font(.system(size: 16, weight: .semibold))
							.foregroundStyle(Theme.ink)
							.padding(10)
							.background(Theme.surface.opacity(0.85), in: Circle())
					}
					.padding(.trailing, 16)
					.padding(.top, 8)
					.accessibilityLabel("Close image")
				}
				Spacer()
			}
		}
		.contentShape(Rectangle())
		.onTapGesture { onClose() }
	}
}
