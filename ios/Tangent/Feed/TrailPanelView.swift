import SwiftUI

/// Where you've been — the revealed chain, newest first, with each hop's connection
/// type. Tapping a row pages the feed back to that card. The iOS analogue of the
/// web's TrailPanel.
struct TrailPanelView: View {
	let store: FeedStore
	var onSelect: (String) -> Void
	var onClose: () -> Void

	var body: some View {
		NavigationStack {
			Group {
				if store.revealedTrail.isEmpty {
					emptyState
				} else {
					list
				}
			}
			.frame(maxWidth: .infinity, maxHeight: .infinity)
			.background(Theme.void)
			.navigationTitle("Trail")
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

	private var list: some View {
		List {
			ForEach(store.revealedTrail.reversed()) { card in
				Button {
					onSelect(card.id)
				} label: {
					row(card)
				}
				.buttonStyle(.plain)
				.listRowBackground(Theme.void)
				.listRowInsets(EdgeInsets())
				.listRowSeparatorTint(Theme.hairline)
			}
		}
		.listStyle(.plain)
		.scrollContentBackground(.hidden)
	}

	private func row(_ card: FeedCard) -> some View {
		HStack(alignment: .top, spacing: 14) {
			Image(systemName: icon(for: card.relation))
				.font(.system(size: 15))
				.foregroundStyle(card.relation == .surprise ? Theme.spark : Theme.faint)
				.frame(width: 22)
				.padding(.top, 4)

			VStack(alignment: .leading, spacing: 3) {
				Text(card.article.title)
					.font(Theme.serif(18, .semibold))
					.foregroundStyle(Theme.ink)
					.fixedSize(horizontal: false, vertical: true)
				if let kicker = card.relation.kicker(from: card.fromTitle) {
					Text(kicker)
						.font(Theme.ui(12))
						.foregroundStyle(Theme.muted)
						.lineLimit(1)
				}
			}

			Spacer(minLength: 0)
		}
		.padding(.horizontal, 24)
		.padding(.vertical, 12)
		.contentShape(Rectangle())
	}

	private func icon(for relation: Relation) -> String {
		switch relation {
		case .seed: return "flag"
		case .link: return "link"
		case .related: return "square.on.square"
		case .surprise: return "sparkles"
		case .dive: return "arrow.down.right.circle"
		}
	}

	private var emptyState: some View {
		VStack(spacing: 10) {
			Image(systemName: "point.3.connected.trianglepath.dotted")
				.font(.system(size: 32))
				.foregroundStyle(Theme.muted)
			Text("No trail yet")
				.font(Theme.serif(20))
				.foregroundStyle(Theme.ink)
			Text("Scroll the feed and your path shows up here.")
				.font(Theme.serif(15))
				.foregroundStyle(Theme.muted)
				.multilineTextAlignment(.center)
		}
		.padding(32)
	}
}
