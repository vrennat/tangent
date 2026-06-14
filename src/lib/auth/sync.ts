import { browser } from '$app/environment';
import { profile } from '$lib/engagement/profile.svelte';
import type { Persisted } from '$lib/engagement/persisted';

/**
 * Account profile sync. The client stays the source of truth; this pushes the persistent
 * profile to D1 and pulls it back across devices.
 *
 * Two regimes (see docs/specs/2026-06-13-accounts-design.md):
 *  - MERGE (union/max) fires once, on explicit login — the recovery / new-device path.
 *  - Steady state is revision-guarded last-write-wins: on init adopt the server only if
 *    another device advanced its revision past ours, else keep local (so this tab's session
 *    decay isn't clobbered) and push. Local edits debounce-push.
 *
 * All network ops run through one promise chain so a debounced push can't race the
 * init pull or the login merge.
 */

const SYNCED_REV_KEY = 'tangent:syncedRevision:v1';

interface StoredProfile {
	data: Persisted;
	updatedAt: number;
	revision: number;
}

function getSyncedRev(): number {
	if (!browser) return 0;
	const v = Number(localStorage.getItem(SYNCED_REV_KEY));
	return Number.isFinite(v) ? v : 0;
}

function setSyncedRev(n: number): void {
	if (browser) localStorage.setItem(SYNCED_REV_KEY, String(n));
}

let chain: Promise<void> = Promise.resolve();
/** Serialize every sync op so pulls, pushes, and merges never overlap. */
function enqueue(op: () => Promise<void>): Promise<void> {
	chain = chain.then(op).catch(() => {});
	return chain;
}

async function readProfile(r: Response): Promise<StoredProfile | null> {
	const { profile: stored } = (await r.json()) as { profile: StoredProfile | null };
	return stored;
}

/** PUT the local profile (last-write-wins). Marks the rev captured before the request as
 * pushed, so edits made mid-flight still flag as pending and re-push. */
async function pushNow(): Promise<void> {
	const rev = profile.rev;
	const r = await fetch('/api/profile', {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ data: profile.snapshot() })
	});
	if (!r.ok) return;
	const stored = await readProfile(r);
	if (stored) setSyncedRev(stored.revision);
	profile.markPushed(rev);
}

/** Login-time reconciliation: union local + server, adopt the result. */
export function mergeOnLogin(): Promise<void> {
	return enqueue(async () => {
		const r = await fetch('/api/profile/merge', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ data: profile.snapshot() })
		});
		if (!r.ok) return;
		const stored = await readProfile(r);
		if (!stored) return;
		profile.adopt(stored.data);
		setSyncedRev(stored.revision);
	});
}

/** Init-time sync for an already-authenticated session. */
export function syncOnInit(): Promise<void> {
	return enqueue(async () => {
		const r = await fetch('/api/profile');
		if (!r.ok) return;
		const stored = await readProfile(r);
		if (!stored) {
			await pushNow(); // server has nothing yet — seed it from this device
			return;
		}
		if (stored.revision > getSyncedRev()) {
			profile.adopt(stored.data); // another device advanced it — take theirs
			setSyncedRev(stored.revision);
		} else {
			await pushNow(); // ours is current-or-newer — keep local (decay!) and push
		}
	});
}

/** Steady-state push of local edits. Safe to call repeatedly; the chain serializes it. */
export function pushProfile(): Promise<void> {
	return enqueue(pushNow);
}
