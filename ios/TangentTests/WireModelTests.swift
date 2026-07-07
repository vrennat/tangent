import XCTest
@testable import Tangent

/// Pins the /api/next wire contract against src/lib/feed/types.ts — a silently
/// missing field degrades scoring server-side without any visible error.
final class WireModelTests: XCTestCase {
	func testNextRequestEncodesTheFullContract() throws {
		let req = NextRequest(
			fromTitle: "Octopus",
			mode: nil,
			interest: InterestPayload(
				tokenWeights: ["mollusc": 1.0],
				tokenAvoidWeights: ["election": 0.28],
				tokenDocFreq: ["mollusc": 2.5],
				taste: "science"
			),
			session: SessionPayload(
				seenTitles: ["Octopus"],
				recentTokens: ["mollusc"],
				noSurprise: false,
				stepIndex: 1
			)
		)

		let json = try XCTUnwrap(
			try JSONSerialization.jsonObject(with: JSONEncoder().encode(req)) as? [String: Any]
		)
		let interest = try XCTUnwrap(json["interest"] as? [String: Any])
		let session = try XCTUnwrap(json["session"] as? [String: Any])

		XCTAssertEqual(json["fromTitle"] as? String, "Octopus")
		XCTAssertEqual(interest["taste"] as? String, "science")
		XCTAssertNotNil(interest["tokenAvoidWeights"])
		XCTAssertEqual(
			try XCTUnwrap((interest["tokenDocFreq"] as? [String: Double])?["mollusc"]),
			2.5, accuracy: 1e-9
		)
		XCTAssertEqual(session["stepIndex"] as? Int, 1)
		XCTAssertEqual(session["noSurprise"] as? Bool, false)
	}

	func testNextResponseDecodesExhaustedAndNullArticle() throws {
		let data = Data("""
		{"article":null,"surprised":false,"relation":"link","exhausted":true}
		""".utf8)

		let res = try JSONDecoder().decode(NextResponse.self, from: data)

		XCTAssertNil(res.article)
		XCTAssertEqual(res.exhausted, true)
		XCTAssertEqual(res.relation, .link)
	}

	func testNextResponseDecodesWithoutOptionalExhausted() throws {
		let data = Data("""
		{"article":{"title":"Octopus","description":null,"extract":"x","thumbnail":null,
		 "wikiUrl":"https://en.wikipedia.org/wiki/Octopus","lang":"en","tokens":["octopus"]},
		 "surprised":true,"relation":"surprise"}
		""".utf8)

		let res = try JSONDecoder().decode(NextResponse.self, from: data)

		XCTAssertEqual(res.article?.title, "Octopus")
		XCTAssertNil(res.exhausted)
		XCTAssertEqual(res.relation, .surprise)
	}
}
