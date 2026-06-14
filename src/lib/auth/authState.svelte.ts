import { mergeOnLogin } from './sync';

/** The signed-in account on the client (mirrors the server's SessionUser JSON shape). */
export interface AccountUser {
	id: string;
	email: string;
	emailVerified: boolean;
}

type Status = 'unknown' | 'anon' | 'authed';

/**
 * Client-side auth state. Talks to /api/auth/* and drives the account UI. Login success
 * kicks off the one-time profile merge; the rest of sync is scheduled from the layout.
 */
class AuthState {
	user = $state<AccountUser | null>(null);
	status = $state<Status>('unknown');

	get isAuthed(): boolean {
		return this.status === 'authed';
	}

	/** Resolve the current session (call once on app init). */
	async refresh(): Promise<void> {
		try {
			const r = await fetch('/api/auth/me');
			const { user } = (await r.json()) as { user: AccountUser | null };
			this.user = user;
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

	/** Sign out on this device. The local profile is kept — the device keeps personalizing. */
	async logout(): Promise<void> {
		try {
			await fetch('/api/auth/logout', { method: 'POST' });
		} catch {
			// best-effort; clear local state regardless
		}
		this.user = null;
		this.status = 'anon';
	}
}

export const auth = new AuthState();
