import SwiftUI

/// A tangent flavor the user can steer with. Mirrors `TASTE_OPTIONS` in
/// src/lib/feed/taste.ts — ids must match exactly (the server normalizes unknown
/// values back to "balanced", so a typo here would silently disable steering).
struct TasteOption: Identifiable, Hashable {
	let id: String
	let label: String
	let detail: String
}

enum TasteOptions {
	static let all: [TasteOption] = [
		TasteOption(id: "balanced", label: "Balanced", detail: "Keep the tangent broad and let engagement guide it."),
		TasteOption(id: "technology", label: "Technology", detail: "Prefer engineering, computing, inventions, and built systems."),
		TasteOption(id: "oddities", label: "Oddities", detail: "Prefer strange histories, anomalies, legends, and mysteries."),
		TasteOption(id: "culture", label: "Culture", detail: "Prefer art, music, food, language, religion, and media."),
		TasteOption(id: "science", label: "Science", detail: "Prefer research, natural sciences, medicine, and theory."),
		TasteOption(id: "history", label: "History", detail: "Prefer eras, empires, archaeology, wars, and old places."),
		TasteOption(id: "nature", label: "Nature", detail: "Prefer animals, plants, geography, ecosystems, and geology."),
		TasteOption(id: "people", label: "People", detail: "Prefer biographies — leaders, artists, explorers, and notable lives.")
	]
}

/// Explicit taste steering — a soft boost in the engine, not a hard filter.
/// Selecting a flavor retunes the feed (prefetched cards were scored under the
/// old taste, so the store drops and rebuilds them).
struct TastePickerView: View {
	let profile: EngagementProfile
	var onChange: () -> Void
	var onClose: () -> Void

	var body: some View {
		NavigationStack {
			List {
				ForEach(TasteOptions.all) { option in
					Button {
						guard profile.taste != option.id else { return }
						profile.setTaste(option.id)
						onChange()
					} label: {
						row(option)
					}
					.buttonStyle(.plain)
					.listRowBackground(Theme.void)
					.listRowInsets(EdgeInsets())
					.listRowSeparatorTint(Theme.hairline)
				}
			}
			.listStyle(.plain)
			.scrollContentBackground(.hidden)
			.background(Theme.void)
			.navigationTitle("Tangent flavor")
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

	private func row(_ option: TasteOption) -> some View {
		HStack(alignment: .top, spacing: 14) {
			VStack(alignment: .leading, spacing: 4) {
				Text(option.label)
					.font(Theme.serif(19, .semibold))
					.foregroundStyle(Theme.ink)
				Text(option.detail)
					.font(Theme.serif(14))
					.foregroundStyle(Theme.muted)
					.fixedSize(horizontal: false, vertical: true)
			}

			Spacer(minLength: 0)

			if profile.taste == option.id {
				Image(systemName: "checkmark")
					.font(.system(size: 15, weight: .semibold))
					.foregroundStyle(Theme.accent)
					.padding(.top, 4)
			}
		}
		.padding(.horizontal, 24)
		.padding(.vertical, 14)
		.contentShape(Rectangle())
		.accessibilityElement(children: .combine)
		.accessibilityAddTraits(profile.taste == option.id ? .isSelected : [])
	}
}
