import { describe, it, expect } from 'vitest';
import {
	fromBase64Url,
	randomCode,
	randomToken,
	sha256Hex,
	timingSafeEqual,
	toBase64Url,
	uuid
} from '../src/lib/server/auth/crypto';

describe('randomCode', () => {
	it('is always a zero-padded 6-digit string', () => {
		for (let i = 0; i < 500; i++) {
			const c = randomCode(6);
			expect(c).toMatch(/^\d{6}$/);
		}
	});

	it('produces variety (not a constant)', () => {
		const seen = new Set(Array.from({ length: 50 }, () => randomCode()));
		expect(seen.size).toBeGreaterThan(1);
	});
});

describe('sha256Hex', () => {
	it('is deterministic and 64 hex chars', async () => {
		const a = await sha256Hex('hello');
		const b = await sha256Hex('hello');
		expect(a).toBe(b);
		expect(a).toMatch(/^[0-9a-f]{64}$/);
	});

	it('differs for different input', async () => {
		expect(await sha256Hex('a')).not.toBe(await sha256Hex('b'));
	});
});

describe('timingSafeEqual', () => {
	it('true for equal strings, false otherwise', () => {
		expect(timingSafeEqual('abc', 'abc')).toBe(true);
		expect(timingSafeEqual('abc', 'abd')).toBe(false);
		expect(timingSafeEqual('abc', 'abcd')).toBe(false);
	});
});

describe('tokens + ids', () => {
	it('randomToken is url-safe and unique', () => {
		const a = randomToken();
		const b = randomToken();
		expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(a).not.toBe(b);
	});

	it('uuid looks like a uuid', () => {
		expect(uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
	});

	it('toBase64Url has no +, /, or = padding', () => {
		const s = toBase64Url(new Uint8Array([251, 255, 0, 1, 2, 3]));
		expect(s).not.toMatch(/[+/=]/);
	});

	it('fromBase64Url round-trips toBase64Url (incl. the +/ -> -_ chars)', () => {
		for (const bytes of [[251, 255, 0, 1, 2, 3], [0], [], [255, 254, 253, 252]]) {
			const u = new Uint8Array(bytes);
			expect([...fromBase64Url(toBase64Url(u))]).toEqual(bytes);
		}
	});
});
