import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { mergeOnLogin } from './sync';

/** The signed-in account on the client (mirrors the server's SessionUser JSON shape). */
export interface AccountUser {
	id: string;
	email: string;
	emailVerified: boolean;
}

/** A registered passkey, as returned by /api/auth/me (mirrors the server's PasskeyInfo). */
export interface PasskeyInfo {
	id: string;
	label: string | null;
	deviceType: string | null;
	backedUp: boolean;
	createdAt: number;
	lastUsedAt: number | null;
}

type Status = 'unknown' | 'anon' | 'authed';

/** Map a WebAuthn ceremony failure to a short, user-facing reason. */
function passkeyError(e: unknown): string {
	const name = (e as { name?: string } | null)?.name;
	if (name === 'NotAllowedError') return 'Passkey prompt was dismissed';
	if (name === 'InvalidStateError') return 'This device already has a passkey for this account';
	return (e as Error | null)?.message || 'Passkey error';
}

/**
 * Client-side auth state. Talks to /api/auth/* and drives the account UI. Login success
 * kicks off the one-time profile merge; the rest of sync is scheduled from the layout.
 */
class AuthState {
	user = $state<AccountUser | null>(null);
	status = $state<Status>('unknown');
	passkeys = $state<PasskeyInfo[]>([]);

	get isAuthed(): boolean {
		return this.status === 'authed';
	}

	/** Derived from the passkey list — the single source of truth, so it can't drift. */
	get passkeyCount(): number {
		return this.passkeys.length;
	}

	/** Resolve the current session (call once on app init). */
	async refresh(): Promise<void> {
		try {
			const r = await fetch('/api/auth/me');
			const { user, passkeys } = (await r.json()) as {
				user: AccountUser | null;
				passkeys?: PasskeyInfo[];
			};
			this.user = user;
			this.passkeys = passkeys ?? [];
			this.status = user ? 'authed' : 'anon';
		} catch {
			this.status = 'anon';
		}
	}

	/** Request an email code. `devCode` is only present in dev (no real inbox). */
	async requestCode(
		email: string
	): Promise<{ ok: boolean; devCode?: string; error?: string }> {
		try {
			const r = await fetch('/api/auth/request-code', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email })
			});
			const data = (await r.json().catch(() => ({}))) as { devCode?: string; error?: string };
			if (!r.ok) return { ok: false, error: data.error ?? 'Could not send a code' };
			return { ok: true, devCode: data.devCode };
		} catch {
			return { ok: false, error: 'Network error' };
		}
	}

	/** Verify a code; on success sets the session and merges the local + server profile. */
	async verifyCode(email: string, code: string): Promise<{ ok: boolean; error?: string }> {
		try {
			const r = await fetch('/api/auth/verify-code', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email, code })
			});
			const data = (await r.json().catch(() => ({}))) as { user?: AccountUser; error?: string };
			if (!r.ok || !data.user) return { ok: false, error: data.error ?? 'Invalid or expired code' };
			this.user = data.user;
			this.status = 'authed';
			await mergeOnLogin();
			return { ok: true };
		} catch {
			return { ok: false, error: 'Network error' };
		}
	}

	/** Add a passkey to the signed-in account (runs the WebAuthn registration ceremony). */
	async registerPasskey(): Promise<{ ok: boolean; error?: string }> {
		try {
			const optRes = await fetch('/api/auth/passkey/register/options', { method: 'POST' });
			if (!optRes.ok) return { ok: false, error: 'Could not start passkey setup' };
			const { options, challengeId } = await optRes.json();
			const response = await startRegistration({ optionsJSON: options });
			const verRes = await fetch('/api/auth/passkey/register/verify', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ challengeId, response })
			});
			const data = (await verRes.json().catch(() => ({}))) as { verified?: boolean; error?: string };
			if (!verRes.ok || !data.verified) return { ok: false, error: data.error ?? 'Passkey setup failed' };
			await this.refresh(); // pull the new passkey (id, dates) so the list can manage it
			return { ok: true };
		} catch (e) {
			return { ok: false, error: passkeyError(e) };
		}
	}

	/** Passwordless sign-in with a passkey. On success sets the session and merges the profile. */
	async loginWithPasskey(): Promise<{ ok: boolean; error?: string }> {
		try {
			const optRes = await fetch('/api/auth/passkey/login/options', { method: 'POST' });
			if (!optRes.ok) return { ok: false, error: 'Could not start passkey sign-in' };
			const { options, challengeId } = await optRes.json();
			const response = await startAuthentication({ optionsJSON: options });
			const verRes = await fetch('/api/auth/passkey/login/verify', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ challengeId, response })
			});
			const data = (await verRes.json().catch(() => ({}))) as { user?: AccountUser; error?: string };
			if (!verRes.ok || !data.user) return { ok: false, error: data.error ?? 'Passkey sign-in failed' };
			this.user = data.user;
			this.status = 'authed';
			await this.refresh();
			await mergeOnLogin();
			return { ok: true };
		} catch (e) {
			return { ok: false, error: passkeyError(e) };
		}
	}

	/** Revoke one passkey. Email login stays as a fallback, so removing the last one is safe. */
	async revokePasskey(id: string): Promise<{ ok: boolean; error?: string }> {
		try {
			const r = await fetch('/api/auth/passkey/revoke', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!r.ok) {
				const data = (await r.json().catch(() => ({}))) as { error?: string };
				return { ok: false, error: data.error ?? 'Could not remove passkey' };
			}
			this.passkeys = this.passkeys.filter((p) => p.id !== id);
			return { ok: true };
		} catch {
			return { ok: false, error: 'Network error' };
		}
	}

	/**
	 * Permanently delete the account server-side and drop to the signed-out state. The caller
	 * is responsible for wiping the device's local profile (delete is not sign-out): see
	 * AccountSection, which also retunes the feed afterward.
	 */
	async deleteAccount(): Promise<{ ok: boolean; error?: string }> {
		try {
			const r = await fetch('/api/auth/delete', {
				method: 'POST',
				headers: { 'content-type': 'application/json' }
			});
			if (!r.ok) {
				const data = (await r.json().catch(() => ({}))) as { error?: string };
				return { ok: false, error: data.error ?? 'Could not delete account' };
			}
			this.user = null;
			this.passkeys = [];
			this.status = 'anon';
			return { ok: true };
		} catch {
			return { ok: false, error: 'Network error' };
		}
	}

	/** Sign out on this device. The local profile is kept — the device keeps personalizing. */
	async logout(): Promise<void> {
		try {
			await fetch('/api/auth/logout', { method: 'POST' });
		} catch {
			// best-effort; clear local state regardless
		}
		this.user = null;
		this.passkeys = [];
		this.status = 'anon';
	}
}

export const auth = new AuthState();
