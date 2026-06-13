import Foundation

/// Hand-picked starting points — dense, heavily-linked articles that fan out into
/// interesting territory (Wikipedia's random endpoint mostly returns dull stubs).
/// A subset of the web `SEEDS`.
struct Seed: Hashable {
	let title: String
	let emoji: String
}

enum Seeds {
	static let all: [Seed] = [
		Seed(title: "Roman Empire", emoji: "🏛️"),
		Seed(title: "Black hole", emoji: "🕳️"),
		Seed(title: "Octopus", emoji: "🐙"),
		Seed(title: "Silk Road", emoji: "🐫"),
		Seed(title: "Chernobyl disaster", emoji: "☢️"),
		Seed(title: "Jazz", emoji: "🎷"),
		Seed(title: "Volcano", emoji: "🌋"),
		Seed(title: "Library of Alexandria", emoji: "📜"),
		Seed(title: "Mycology", emoji: "🍄"),
		Seed(title: "Antarctica", emoji: "🧊"),
		Seed(title: "Cryptography", emoji: "🔐"),
		Seed(title: "Renaissance", emoji: "🎨"),
		Seed(title: "Deep sea", emoji: "🌊"),
		Seed(title: "Samurai", emoji: "⚔️"),
		Seed(title: "Quantum mechanics", emoji: "⚛️"),
		Seed(title: "Coffee", emoji: "☕"),
		Seed(title: "Fermi paradox", emoji: "👽"),
		Seed(title: "Vikings", emoji: "🛶"),
		Seed(title: "Human brain", emoji: "🧠"),
		Seed(title: "Chess", emoji: "♟️"),
		Seed(title: "Tardigrade", emoji: "🐻"),
		Seed(title: "Aztecs", emoji: "🗿")
	]

	/// A deterministic-enough starting seed for cold launch (varies by day).
	static func cold() -> Seed {
		let day = Calendar.current.ordinality(of: .day, in: .era, for: Date()) ?? 0
		return all[day % all.count]
	}
}
