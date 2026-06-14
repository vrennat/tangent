import type { D1Database } from '@cloudflare/workers-types';
import type { AuthenticatorTransportFuture, WebAuthnCredential } from '@simplewebauthn/server';
import { uuid, toBase64Url, fromBase64Url } from './crypto';
import { now } from '../db';

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export type ChallengePurpose = 'register' | 'authenticate';

/**
 * Persist a pending WebAuthn challenge and return an opaque id the client round-trips back
 * with its attestation/assertion. Registration ties the challenge to the user; passwordless
 * login leaves user_id null (the credential identifies the user at verify time).
 */
export async function storeChallenge(
	db: D1Database,
	opts: { userId: string | null; challenge: string; purpose: ChallengePurpose }
): Promise<string> {
	const id = uuid();
	const ts = now();
	await db
		.prepare(
			`INSERT INTO webauthn_challenges (id, user_id, challenge, purpose, created_at, expires_at)
			 VALUES (?, ?, ?, ?, ?, ?)`
		)
		.bind(id, opts.userId, opts.challenge, opts.purpose, ts, ts + CHALLENGE_TTL_MS)
		.run();
	return id;
}

/** Single-use: returns the challenge string then deletes the row (even on expiry/miss). */
export async function consumeChallenge(
	db: D1Database,
	id: string,
	purpose: ChallengePurpose
): Promise<string | null> {
	const row = await db
		.prepare('SELECT challenge, expires_at AS expiresAt FROM webauthn_challenges WHERE id = ? AND purpose = ?')
		.bind(id, purpose)
		.first<{ challenge: string; expiresAt: number }>();
	await db.prepare('DELETE FROM webauthn_challenges WHERE id = ?').bind(id).run();
	if (!row || row.expiresAt <= now()) return null;
	return row.challenge;
}

interface CredentialDescriptor {
	id: string;
	transports?: AuthenticatorTransportFuture[];
}

/** Descriptors for a user's existing passkeys — used as excludeCredentials at registration. */
export async function getCredentialDescriptors(
	db: D1Database,
	userId: string
): Promise<CredentialDescriptor[]> {
	const rows = await db
		.prepare('SELECT id, transports FROM credentials WHERE user_id = ?')
		.bind(userId)
		.all<{ id: string; transports: string | null }>();
	return rows.results.map((r) => ({
		id: r.id,
		transports: r.transports ? (JSON.parse(r.transports) as AuthenticatorTransportFuture[]) : undefined
	}));
}

export interface StoredCredential extends WebAuthnCredential {
	userId: string;
}

/** Look up a credential by its base64url id, decoding the stored public key back to bytes. */
export async function getCredentialById(
	db: D1Database,
	id: string
): Promise<StoredCredential | null> {
	const row = await db
		.prepare(
			'SELECT id, user_id AS userId, public_key AS publicKey, counter, transports FROM credentials WHERE id = ?'
		)
		.bind(id)
		.first<{ id: string; userId: string; publicKey: string; counter: number; transports: string | null }>();
	if (!row) return null;
	return {
		id: row.id,
		userId: row.userId,
		publicKey: fromBase64Url(row.publicKey),
		counter: row.counter,
		transports: row.transports ? (JSON.parse(row.transports) as AuthenticatorTransportFuture[]) : undefined
	};
}

/** Persist a freshly-registered credential (public key stored base64url). */
export async function storeCredential(
	db: D1Database,
	opts: {
		userId: string;
		credential: WebAuthnCredential;
		deviceType: string;
		backedUp: boolean;
		label?: string;
	}
): Promise<void> {
	const ts = now();
	const { credential } = opts;
	await db
		.prepare(
			`INSERT INTO credentials
			 (id, user_id, public_key, counter, transports, device_type, backed_up, label, created_at, last_used_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			credential.id,
			opts.userId,
			toBase64Url(credential.publicKey),
			credential.counter,
			credential.transports ? JSON.stringify(credential.transports) : null,
			opts.deviceType,
			opts.backedUp ? 1 : 0,
			opts.label ?? null,
			ts,
			ts
		)
		.run();
}

/** Bump the signature counter after a successful authentication (clone detection). */
export async function touchCredential(db: D1Database, id: string, counter: number): Promise<void> {
	await db
		.prepare('UPDATE credentials SET counter = ?, last_used_at = ? WHERE id = ?')
		.bind(counter, now(), id)
		.run();
}

/** A passkey as surfaced to the account UI (no secrets — public key + counter stay server-side). */
export interface PasskeyInfo {
	id: string;
	label: string | null;
	deviceType: string | null;
	backedUp: boolean;
	createdAt: number;
	lastUsedAt: number | null;
}

/** A user's passkeys for display + management (drives the account UI), oldest first. */
export async function listCredentials(db: D1Database, userId: string): Promise<PasskeyInfo[]> {
	const rows = await db
		.prepare(
			`SELECT id, label, device_type AS deviceType, backed_up AS backedUp,
			        created_at AS createdAt, last_used_at AS lastUsedAt
			 FROM credentials WHERE user_id = ? ORDER BY created_at ASC`
		)
		.bind(userId)
		.all<{
			id: string;
			label: string | null;
			deviceType: string | null;
			backedUp: number;
			createdAt: number;
			lastUsedAt: number | null;
		}>();
	return rows.results.map((r) => ({
		id: r.id,
		label: r.label,
		deviceType: r.deviceType,
		backedUp: r.backedUp === 1,
		createdAt: r.createdAt,
		lastUsedAt: r.lastUsedAt
	}));
}

/**
 * Revoke a single passkey. Scoped by user_id so a credential id alone can't delete another
 * account's passkey. Returns whether a row was actually removed. Email login always remains
 * as a fallback, so removing the last passkey never locks anyone out.
 */
export async function deleteCredential(db: D1Database, id: string, userId: string): Promise<boolean> {
	const res = await db
		.prepare('DELETE FROM credentials WHERE id = ? AND user_id = ?')
		.bind(id, userId)
		.run();
	return (res.meta?.changes ?? 0) > 0;
}
