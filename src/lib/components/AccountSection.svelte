<script lang="ts">
	import { auth } from '$lib/auth/authState.svelte';
	import { profile } from '$lib/engagement/profile.svelte';
	import { feed } from '$lib/feed/feedState.svelte';
	import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
	import { LoaderCircle, Check, RefreshCw, KeyRound, Trash2 } from '@lucide/svelte';

	// Local form state for the signed-out two-step (email -> code) flow.
	let step = $state<'email' | 'code'>('email');
	let email = $state('');
	let code = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let devCode = $state<string | null>(null);

	// Passkey state (separate busy flag so its spinner doesn't fight the email form's).
	let pkBusy = $state(false);
	let pkMsg = $state<string | null>(null);
	const passkeysSupported = browserSupportsWebAuthn();

	// Per-passkey remove: arm one row at a time so a stray tap can't drop a key.
	let pendingRemoveId = $state<string | null>(null);
	let removingId = $state<string | null>(null);

	// Delete account: reveal-then-confirm, since it's irreversible.
	let confirmDelete = $state(false);
	let deleting = $state(false);

	const synced = $derived(!profile.pendingSync);

	function formatDate(ms: number): string {
		return new Date(ms).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	async function removePasskey(id: string): Promise<void> {
		if (removingId) return;
		removingId = id;
		error = null;
		pkMsg = null;
		const res = await auth.revokePasskey(id);
		removingId = null;
		pendingRemoveId = null;
		if (!res.ok) error = res.error ?? 'Could not remove passkey';
	}

	async function deleteAccount(): Promise<void> {
		if (deleting) return;
		deleting = true;
		error = null;
		const res = await auth.deleteAccount();
		if (!res.ok) {
			deleting = false;
			error = res.error ?? 'Could not delete account';
			return;
		}
		// Delete is not sign-out: the synced copy is gone server-side, so wipe this device too
		// (no inherited interests for the next person) and retune the now-empty feed.
		profile.reset();
		feed.retune();
		deleting = false;
		confirmDelete = false;
	}

	async function addPasskey(): Promise<void> {
		if (pkBusy) return;
		pkBusy = true;
		error = null;
		pkMsg = null;
		const res = await auth.registerPasskey();
		pkBusy = false;
		if (res.ok) pkMsg = 'Passkey added';
		else error = res.error ?? 'Passkey setup failed';
	}

	async function signInWithPasskey(): Promise<void> {
		if (pkBusy) return;
		pkBusy = true;
		error = null;
		const res = await auth.loginWithPasskey();
		pkBusy = false;
		if (!res.ok) error = res.error ?? 'Passkey sign-in failed';
	}

	async function sendCode(e: SubmitEvent): Promise<void> {
		e.preventDefault();
		if (busy) return;
		busy = true;
		error = null;
		const res = await auth.requestCode(email.trim());
		busy = false;
		if (!res.ok) {
			error = res.error ?? 'Could not send a code';
			return;
		}
		devCode = res.devCode ?? null;
		step = 'code';
	}

	async function verify(e: SubmitEvent): Promise<void> {
		e.preventDefault();
		if (busy) return;
		busy = true;
		error = null;
		const res = await auth.verifyCode(email.trim(), code.trim());
		busy = false;
		if (!res.ok) {
			error = res.error ?? 'Invalid or expired code';
			return;
		}
		// Reset the form for next time.
		step = 'email';
		code = '';
		devCode = null;
	}

	function restart(): void {
		step = 'email';
		code = '';
		error = null;
		devCode = null;
	}
</script>

<div class="border-t border-hair pt-3">
	<p class="mb-2 text-xs font-medium tracking-wide text-faint uppercase">Account</p>

	{#if auth.isAuthed && auth.user}
		<div class="flex items-center justify-between gap-2">
			<div class="min-w-0">
				<p class="truncate text-sm text-ink">{auth.user.email}</p>
				<p class="flex items-center gap-1 text-xs text-faint">
					{#if synced}
						<Check class="size-3" aria-hidden="true" /> Interests synced
					{:else}
						<RefreshCw class="size-3 animate-spin" aria-hidden="true" /> Syncing…
					{/if}
				</p>
			</div>
			<button
				type="button"
				onclick={() => auth.logout()}
				class="shrink-0 rounded-full border border-hair px-3 py-1.5 text-xs font-medium
					text-muted transition-colors hover:border-hair-strong hover:text-ink"
			>
				Sign out
			</button>
		</div>

		{#if passkeysSupported}
			<div class="mt-3 flex items-center justify-between gap-2">
				<p class="flex items-center gap-1.5 text-xs text-faint">
					<KeyRound class="size-3.5" aria-hidden="true" />
					{#if auth.passkeyCount > 0}
						{auth.passkeyCount} passkey{auth.passkeyCount === 1 ? '' : 's'} for faster sign-in
					{:else}
						Add a passkey to skip the email code
					{/if}
				</p>
				<button
					type="button"
					onclick={addPasskey}
					disabled={pkBusy}
					class="inline-flex shrink-0 min-h-9 items-center gap-1.5 rounded-full border border-hair
						px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent/50
						hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
				>
					{#if pkBusy}<LoaderCircle class="size-3.5 animate-spin" aria-hidden="true" />{/if}
					Add a passkey
				</button>
			</div>
			{#if pkMsg}
				<p class="mt-1 flex items-center gap-1 text-xs text-accent">
					<Check class="size-3" aria-hidden="true" />{pkMsg}
				</p>
			{/if}

			{#if auth.passkeys.length > 0}
				<ul class="mt-2 space-y-1.5">
					{#each auth.passkeys as pk (pk.id)}
						<li
							class="flex items-center justify-between gap-2 rounded-lg border border-hair px-2.5 py-1.5"
						>
							<span class="flex min-w-0 items-center gap-1.5 text-xs text-muted">
								<KeyRound class="size-3.5 shrink-0 text-faint" aria-hidden="true" />
								<span class="min-w-0 truncate">{pk.label ?? 'Passkey'} · added {formatDate(pk.createdAt)}</span>
							</span>
							{#if pendingRemoveId === pk.id}
								<span class="flex shrink-0 items-center gap-1">
									<button
										type="button"
										onclick={() => removePasskey(pk.id)}
										disabled={removingId === pk.id}
										class="inline-flex min-h-8 items-center gap-1 rounded-full bg-danger/10 px-2.5 py-1
											text-xs font-medium text-danger transition-colors hover:bg-danger/20
											disabled:cursor-not-allowed disabled:opacity-50"
									>
										{#if removingId === pk.id}<LoaderCircle class="size-3 animate-spin" aria-hidden="true" />{/if}
										Remove
									</button>
									<button
										type="button"
										onclick={() => (pendingRemoveId = null)}
										disabled={removingId === pk.id}
										class="min-h-8 rounded-full px-2 py-1 text-xs font-medium text-faint
											transition-colors hover:text-muted disabled:opacity-50"
									>
										Cancel
									</button>
								</span>
							{:else}
								<button
									type="button"
									onclick={() => (pendingRemoveId = pk.id)}
									aria-label="Remove passkey added {formatDate(pk.createdAt)}"
									class="-m-1.5 shrink-0 rounded-full p-1.5 text-faint transition-colors hover:text-danger"
								>
									<Trash2 class="size-3.5" aria-hidden="true" />
								</button>
							{/if}
						</li>
					{/each}
				</ul>
				<p class="mt-1.5 text-xs text-faint">
					Removing a passkey is safe — you can still sign in with an email code.
				</p>
			{/if}
		{/if}

		<!-- Danger zone: permanent account deletion (distinct from sign-out). -->
		<div class="mt-4 border-t border-hair pt-3">
			{#if confirmDelete}
				<p class="text-xs text-muted">
					This permanently deletes your account, synced interests, and passkeys. It can't be undone.
				</p>
				<div class="mt-2 flex items-center gap-2">
					<button
						type="button"
						onclick={deleteAccount}
						disabled={deleting}
						class="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-danger/10 px-3 py-1.5
							text-xs font-medium text-danger transition-colors hover:bg-danger/20
							disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if deleting}<LoaderCircle class="size-3.5 animate-spin" aria-hidden="true" />{:else}<Trash2
								class="size-3.5"
								aria-hidden="true"
							/>{/if}
						Delete forever
					</button>
					<button
						type="button"
						onclick={() => (confirmDelete = false)}
						disabled={deleting}
						class="min-h-9 rounded-full border border-hair px-3 py-1.5 text-xs font-medium
							text-muted transition-colors hover:border-hair-strong hover:text-ink
							disabled:opacity-50"
					>
						Cancel
					</button>
				</div>
			{:else}
				<button
					type="button"
					onclick={() => {
						confirmDelete = true;
						error = null;
					}}
					class="text-xs font-medium text-faint transition-colors hover:text-danger"
				>
					Delete account
				</button>
			{/if}
		</div>
	{:else if step === 'email'}
		<p class="mb-2 text-sm text-faint">Sync your interests across devices.</p>
		<form onsubmit={sendCode} class="flex flex-col gap-2">
			<input
				type="email"
				bind:value={email}
				required
				autocomplete="email"
				placeholder="you@example.com"
				aria-label="Email"
				class="min-h-9 rounded-lg border border-hair bg-surface-2 px-3 py-1.5 text-sm text-ink
					placeholder:text-faint focus:border-accent/60 focus:outline-none"
			/>
			<button
				type="submit"
				disabled={busy || !email.trim()}
				class="inline-flex min-h-9 items-center justify-center gap-2 rounded-full bg-accent/10 px-3 py-1.5
					text-xs font-medium text-accent transition-colors hover:bg-accent/20
					disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if busy}<LoaderCircle class="size-3.5 animate-spin" aria-hidden="true" />{/if}
				Send sign-in link
			</button>
		</form>

		{#if passkeysSupported}
			<!-- Returning users with a passkey skip the email round-trip entirely. -->
			<div class="my-3 flex items-center gap-3 text-xs text-faint">
				<span class="h-px flex-1 bg-hair"></span>or<span class="h-px flex-1 bg-hair"></span>
			</div>
			<button
				type="button"
				onclick={signInWithPasskey}
				disabled={pkBusy}
				class="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-full border
					border-hair px-3 py-1.5 text-xs font-medium text-muted transition-colors
					hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if pkBusy}<LoaderCircle class="size-3.5 animate-spin" aria-hidden="true" />{:else}<KeyRound
						class="size-3.5"
						aria-hidden="true"
					/>{/if}
				Sign in with a passkey
			</button>
		{/if}
	{:else}
		<p class="mb-2 text-sm text-faint">
			We sent a sign-in link to <span class="text-muted">{email}</span>. Tap it on this device, or
			enter the code below.
		</p>
		<form onsubmit={verify} class="flex flex-col gap-2">
			<input
				type="text"
				bind:value={code}
				required
				inputmode="numeric"
				autocomplete="one-time-code"
				pattern="[0-9]{'{'}6{'}'}"
				maxlength="6"
				placeholder="000000"
				aria-label="6-digit code"
				class="min-h-9 rounded-lg border border-hair bg-surface-2 px-3 py-1.5 text-center text-base
					tracking-[0.4em] text-ink placeholder:text-faint focus:border-accent/60 focus:outline-none"
			/>
			{#if devCode}
				<p class="text-xs text-faint">Dev code: <span class="text-muted">{devCode}</span></p>
			{/if}
			<div class="flex items-center gap-2">
				<button
					type="submit"
					disabled={busy || code.trim().length !== 6}
					class="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-full bg-accent/10
						px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20
						disabled:cursor-not-allowed disabled:opacity-50"
				>
					{#if busy}<LoaderCircle class="size-3.5 animate-spin" aria-hidden="true" />{/if}
					Verify
				</button>
				<button
					type="button"
					onclick={restart}
					class="min-h-9 rounded-full border border-hair px-3 py-1.5 text-xs font-medium
						text-muted transition-colors hover:border-hair-strong hover:text-ink"
				>
					Back
				</button>
			</div>
		</form>
	{/if}

	{#if error}
		<p class="mt-2 text-xs text-danger" role="alert">{error}</p>
	{/if}
</div>
