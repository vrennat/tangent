import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { mergeOnLogin } from './sync';

/** The signed-in account on the client (mirrors the server's SessionUser JSON shape). */
export interface AccountUser {
	id: string;
	email: string;
	emailVerified: boolean;
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
	passkeyCount = $state(0);

	get isAuthed(): boolean {
		return this.status === 'authed';
	}

	/** Resolve the current session (call once on app init). */
	async refresh(): Promise<void> {
		try {
			const r = await fetch('/api/auth/me');
			const { user, passkeyCount } = (await r.json()) as {
				user: AccountUser | null;
				passkeyCount?: number;
			};
			this.user = user;
			this.passkeyCount = passkeyCount ?? 0;
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
			this.passkeyCount += 1;
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

	/** Sign out on this device. The local profile is kept — the device keeps personalizing. */
	async logout(): Promise<void> {
		try {
			await fetch('/api/auth/logout', { method: 'POST' });
		} catch {
			// best-effort; clear local state regardless
		}
		this.user = null;
		this.passkeyCount = 0;
		this.status = 'anon';
	}
}

export const auth = new AuthState();
