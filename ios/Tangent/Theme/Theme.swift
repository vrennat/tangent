import SwiftUI

/// The "Nightstand" palette — a warm, brown-black editorial dark theme that reads
/// like a book by lamplight. Mirrors the web tokens in `src/app.css`.
///
/// Fonts use the system serif (`.serif` design) as a stand-in for Newsreader for now;
/// the actual Newsreader / Hanken Grotesk faces can be bundled and registered later.
enum Theme {
	static let void = Color(hex: 0x15110C)
	static let surface = Color(hex: 0x1F1A13)
	static let ink = Color(hex: 0xECE4D6)
	static let muted = Color(hex: 0xA89C8A)
	static let faint = Color(hex: 0x9B8F76)
	static let accent = Color(hex: 0xE0A14E) // ember — reserve for hover/kickers
	static let spark = Color(hex: 0x86B39A)  // sage — serendipity/surprise
	static let like = Color(hex: 0xE0644A)   // warm — likes

	/// Hairline border tone used for card separators and outlines.
	static let hairline = Color(hex: 0xECE4D6).opacity(0.10)

	// Editorial type ramp.
	static func serif(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
		.system(size: size, weight: weight, design: .serif)
	}
	static func ui(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
		.system(size: size, weight: weight, design: .default)
	}
}

extension Color {
	init(hex: UInt32) {
		self.init(
			red: Double((hex >> 16) & 0xFF) / 255,
			green: Double((hex >> 8) & 0xFF) / 255,
			blue: Double(hex & 0xFF) / 255
		)
	}
}
