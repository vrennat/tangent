/**
 * Auth primitives built on Web Crypto (available in Workers + the dev platform proxy).
 * No Node APIs, no external deps. All hashes are hex-encoded SHA-256.
 */

const encoder = new TextEncoder();

/** Hex-encode bytes. */
function toHex(bytes: Uint8Array): string {
	let out = '';
	for (const b of bytes) out += b.toString(16).padStart(2, '0');
	return out;
}

/** base64url (no padding) — used for opaque ids and WebAuthn values. */
export function toBase64Url(bytes: Uint8Array): string {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode base64url (padding optional) back to bytes — the inverse of toBase64Url. Returns a
 * concretely-`ArrayBuffer`-backed view to satisfy @simplewebauthn's `Uint8Array<ArrayBuffer>`. */
export function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
	const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
	const out = new Uint8Array(new ArrayBuffer(bin.length));
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

/** SHA-256 of a string, hex-encoded. */
export async function sha256Hex(input: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
	return toHex(new Uint8Array(digest));
}

/** A cryptographically random opaque token (default 32 bytes -> 43-char base64url). */
export function randomToken(bytes = 32): string {
	const buf = new Uint8Array(bytes);
	crypto.getRandomValues(buf);
	return toBase64Url(buf);
}

/** A random uuid for primary keys. */
export function uuid(): string {
	return crypto.randomUUID();
}

/**
 * A numeric login code. 6 digits drawn from a rejection-sampled uniform range so the
 * distribution is flat (no modulo bias). Returned zero-padded.
 */
export function randomCode(digits = 6): string {
	const max = 10 ** digits;
	// 4 bytes gives 2^32 values; reject the tail that isn't a whole multiple of `max`.
	const limit = Math.floor(0xffffffff / max) * max;
	const buf = new Uint32Array(1);
	let n: number;
	do {
		crypto.getRandomValues(buf);
		n = buf[0];
	} while (n >= limit);
	return (n % max).toString().padStart(digits, '0');
}

/**
 * Constant-time string comparison to avoid leaking match progress via timing.
 * Inputs are hashes (fixed length); a length mismatch returns false immediately.
 */
export function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}
