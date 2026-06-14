<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import ProfilePanel from '$lib/components/ProfilePanel.svelte';
	import { Waypoints, SlidersHorizontal, Plus } from '@lucide/svelte';
	import { profile } from '$lib/engagement/profile.svelte';
	import { reader } from '$lib/reader/readerState.svelte';
	import { feed } from '$lib/feed/feedState.svelte';
	import { trailPanel } from '$lib/feed/trailPanel.svelte';
	import { auth } from '$lib/auth/authState.svelte';
	import { syncOnInit, pushProfile } from '$lib/auth/sync';
	import { theme } from '$lib/theme/theme.svelte';
	import { onMount } from 'svelte';

	let { children } = $props();

	// Reflect the resolved theme onto <html> (data-theme + chrome tint). Reads reactive
	// state via apply(), so it re-runs when the preference or the OS color-scheme changes.
	// The inline no-flash script in app.html already set it for first paint.
	$effect(() => {
		theme.apply();
	});

	// Resolve the session once, then sync the profile if signed in (revision-guarded).
	onMount(() => {
		void auth.refresh().then(() => {
			if (auth.isAuthed) void syncOnInit();
		});
	});

	// Debounced push of local profile edits while signed in. Reads `profile.rev` so it
	// re-runs on every mutation; the push marks the rev synced, flipping `pendingSync` off.
	$effect(() => {
		void profile.rev;
		if (!auth.isAuthed || !profile.pendingSync) return;
		const id = setTimeout(() => void pushProfile(), 1500);
		return () => clearTimeout(id);
	});

	// Trail = articles you've actually reached (scrolled to / dwelled on). Shown in the
	// header once there's more than just the seed, so it's reachable without a floating chip.
	// Only on the feed route — that's where the panel itself is rendered.
	const seenCount = $derived(feed.trail.filter((n) => n.seen).length);
	const showTrail = $derived(page.url.pathname === '/' && seenCount > 1);

	let profileOpen = $state(false);

	// Reading widens the shell into a two-pane split (feed + article). Stays the
	// narrow reading column otherwise, and on narrow screens where the reader is a
	// full-screen takeover rather than a side pane.
	const shellWidth = $derived(reader.isOpen ? 'max-w-2xl lg:max-w-7xl' : 'max-w-2xl');
</script>

<div class="flex min-h-dvh flex-col">
	<!-- Full-bleed bar: the border spans the viewport; only the inner row is
	     constrained to the reading column so the nav doesn't float mid-screen.
	     The inner row's max-width morphs when the reader opens — a deliberate
	     one-shot layout transition (not per-frame); reduced-motion snaps it. -->
	<header class="sticky top-0 z-20 border-b border-hair bg-void pt-[env(safe-area-inset-top)]">
		<div
			class="mx-auto flex items-center justify-between px-4 py-3
				transition-[max-width] duration-200 ease-out {shellWidth}"
		>
			<!-- -m/p pair grows the tap target past 44px without shifting the visual position. -->
			<a
				href="/"
				class="-m-2.5 inline-flex items-center p-2.5 transition-opacity hover:opacity-80"
				aria-label="Tangent home"
			>
				<BrandMark />
			</a>

			<div class="flex items-center gap-2">
				<!-- Trail: opens the panel of articles you've actually reached. Hidden until
				     you're past the seed; a subtle count badge stands in for the old chip. -->
				{#if showTrail}
					<button
						type="button"
						onclick={() => trailPanel.toggle()}
						aria-label="Your trail, {seenCount} articles"
						aria-haspopup="dialog"
						class="icon-btn relative inline-flex items-center justify-center rounded-full p-1.5
							text-muted transition-colors hover:bg-surface-2 hover:text-ink"
					>
						<!-- Trail: a winding path of waypoints — the route you've walked. -->
						<Waypoints class="size-5" aria-hidden="true" />
						<span
							class="absolute -right-0.5 -top-0.5 grid h-4 min-w-[1rem] place-items-center
								rounded-full bg-surface-2 px-1 text-[10px] font-semibold text-muted ring-1 ring-hair"
							aria-hidden="true">{seenCount}</span
						>
					</button>
				{/if}

				<!-- Profile affordance: opens the interests panel (feed tuning, no account). -->
				<button
					type="button"
					onclick={() => (profileOpen = !profileOpen)}
					aria-label="Your interests"
					aria-expanded={profileOpen}
					aria-haspopup="dialog"
					class="icon-btn inline-flex items-center justify-center rounded-full p-1.5
						text-muted transition-colors hover:bg-surface-2 hover:text-ink"
				>
					<!-- Interests: tuning sliders — the panel tunes your feed (no account). -->
					<SlidersHorizontal class="size-5" aria-hidden="true" />
				</button>

				{#if profileOpen}
					<ProfilePanel onClose={() => (profileOpen = false)} />
				{/if}

				<!-- Below ~320px the wordmark + this pill overflow the bar, which widens the
				     document and makes the feed column look detached from the viewport. Collapse
				     the label to an icon-only button there; sr-only keeps the accessible name. -->
				<a
					href="/start"
					data-cta
					aria-label="New tangent"
					class="inline-flex items-center gap-1.5 rounded-full border border-hair px-3 py-1.5
						text-sm font-medium text-muted transition-colors hover:border-accent/50 hover:text-accent"
				>
					<Plus class="size-4" aria-hidden="true" />
					<span class="hidden min-[20rem]:inline">New tangent</span>
				</a>
			</div>
		</div>
	</header>

	<main
		class="mx-auto w-full flex-1 px-4 py-6 transition-[max-width] duration-200 ease-out {shellWidth}"
	>
		{@render children()}
	</main>

	<!-- Attribution + legal small-print. Sits below the fold on the infinite feed
	     (the in-feed entry point is in the interests popover); fully reachable on the
	     start and about pages. -->
	<footer class="border-t border-hair">
		<div
			class="mx-auto flex max-w-2xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-5 text-xs text-faint"
		>
			<p>
				Text from
				<a
					href="https://en.wikipedia.org"
					target="_blank"
					rel="noopener noreferrer"
					class="underline decoration-hair-strong underline-offset-2 transition-colors hover:text-muted hover:decoration-muted"
					>Wikipedia</a
				>, licensed
				<a
					href="https://creativecommons.org/licenses/by-sa/4.0/"
					target="_blank"
					rel="noopener noreferrer"
					class="underline decoration-hair-strong underline-offset-2 transition-colors hover:text-muted hover:decoration-muted"
					>CC BY-SA 4.0</a
				>.
			</p>
			<!-- -m/p pairs give these standalone links a 44px touch zone without growing the row. -->
			<nav class="ml-auto flex items-center gap-5">
				<a
					href="/about"
					class="-mx-1.5 -my-3.5 px-1.5 py-3.5 transition-colors hover:text-muted">About</a
				>
				<a
					href="https://github.com/vrennat/tangent"
					target="_blank"
					rel="noopener noreferrer"
					class="-mx-1.5 -my-3.5 px-1.5 py-3.5 transition-colors hover:text-muted">Source</a
				>
			</nav>
		</div>
	</footer>
</div>
