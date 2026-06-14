import { describe, it, expect } from 'vitest';
import { isSafeUrl, isSafeSrcset } from '../src/lib/wikipedia/article';

/**
 * `isSafeUrl` is the URL-scheme allowlist behind the reader's HTMLRewriter scrub
 * (scrubExecutableHtml): http(s)/mailto/tel and scheme-less (relative/anchor) URLs are
 * kept on href/src; everything else is neutralized. The scrub itself needs the Worker
 * runtime, but this decision is pure and is where the bypass-resistance lives — so it's
 * tested here against the classic obfuscations a regex strip misses.
 */
describe('isSafeUrl', () => {
	describe('keeps benign URLs', () => {
		for (const url of [
			'https://en.wikipedia.org/wiki/Octopus',
			'http://example.org',
			'HTTPS://EXAMPLE.ORG',
			'mailto:help@tangent.page',
			'tel:+15551234',
			'#cite_note-1',
			'/wiki/Cephalopod',
			'./Cephalopod',
			'//upload.wikimedia.org/x.png', // protocol-relative resolves to https
			'Foo_Bar',
			'https://en.wikipedia.org/w/index.php?a=1&amp;b=2', // benign entity in query
			'&amp;#106;avascript:x', // double-encoded: browser won't re-decode, so inert
			''
		]) {
			it(`allows ${JSON.stringify(url)}`, () => expect(isSafeUrl(url)).toBe(true));
		}
	});

	describe('rejects executable / non-safe schemes', () => {
		for (const url of [
			'javascript:alert(1)',
			'JavaScript:alert(1)',
			'jAvAsCrIpT:alert(1)',
			'  javascript:alert(1)', // leading whitespace
			'java\tscript:alert(1)', // embedded tab
			'java\nscript:alert(1)', // embedded newline
			'\u0001javascript:alert(1)', // leading control char
			'data:text/html,<script>alert(1)</script>',
			'data:image/svg+xml;base64,PHN2Zz4=', // data: rejected wholesale
			'vbscript:msgbox(1)',
			'file:///etc/passwd',
			'&#106;avascript:alert(1)', // entity-encoded 'j'
			'&#x6a;avascript:alert(1)', // hex entity 'j'
			'javascript&#58;alert(1)', // entity-encoded colon
			'javascript&colon;alert(1)', // named-entity colon
			'&#106;avascript&#58;alert(1)', // both encoded
			'\u00A0javascript:alert(1)', // NBSP before scheme
			'java\u00ADscript:alert(1)', // soft hyphen in scheme
			'java\u200Bscript:alert(1)', // zero-width space
			'java\u200Cscript:alert(1)', // zero-width non-joiner
			'java\u2060script:alert(1)', // word joiner
			'java\uFEFFscript:alert(1)' // BOM / zero-width no-break space
		]) {
			it(`rejects ${JSON.stringify(url)}`, () => expect(isSafeUrl(url)).toBe(false));
		}
	});
});

/**
 * srcset only ever loads images (a javascript:/data: candidate can't execute through it),
 * but `isSafeSrcset` still rejects any candidate carrying a non-safe scheme so the scrub
 * can drop the attribute. Splitting on comma can break a data: candidate apart — that only
 * makes the leading fragment fail, which is the reject we want.
 */
describe('isSafeSrcset', () => {
	for (const ss of [
		'https://x/a.png 1x, https://x/b.png 2x',
		'/wiki/a.png',
		'//upload.wikimedia.org/a.png 1.5x'
	]) {
		it(`allows ${JSON.stringify(ss)}`, () => expect(isSafeSrcset(ss)).toBe(true));
	}
	for (const ss of [
		'javascript:alert(1) 1x',
		'https://x/a.png 1x, javascript:alert(1) 2x',
		'data:image/svg+xml,<svg onload=alert(1)> 1x'
	]) {
		it(`rejects ${JSON.stringify(ss)}`, () => expect(isSafeSrcset(ss)).toBe(false));
	}
});
