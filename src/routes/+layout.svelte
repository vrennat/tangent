<script lang="ts">
	import '../app.css';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import ProfilePopover from '$lib/components/ProfilePopover.svelte';
	import { profile } from '$lib/engagement/profile.svelte';
	import { reader } from '$lib/reader/readerState.svelte';

	let { children } = $props();

	const hasProfile = $derived(Object.keys(profile.tokenWeights).length > 0);

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
			<a href="/" class="transition-opacity hover:opacity-80" aria-label="Tangent home">
				<BrandMark />
			</a>

			<div class="flex items-center gap-2">
				<!-- Profile affordance: icon button with accent dot when interests are active. -->
				<div class="relative">
					<button
						type="button"
						onclick={() => (profileOpen = !profileOpen)}
						aria-label="Your interests"
						aria-expanded={profileOpen}
						class="icon-btn relative inline-flex items-center justify-center rounded-full p-1.5
							text-muted transition-colors hover:bg-surface-2 hover:text-ink"
					>
						<svg
							class="size-5"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							aria-hidden="true"
						>
							<circle cx="12" cy="8" r="4" />
							<path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
						</svg>
						{#if hasProfile}
							<!-- Dot signals that the feed is actively personalized. -->
							<span
								class="absolute right-1 top-1 size-2 rounded-full bg-accent"
								aria-hidden="true"
							></span>
						{/if}
					</button>

					{#if profileOpen}
						<ProfilePopover onClose={() => (profileOpen = false)} />
					{/if}
				</div>

				<a
					href="/start"
					data-cta
					class="inline-flex items-center gap-1.5 rounded-full border border-hair px-3 py-1.5
						text-sm font-medium text-muted transition-colors hover:border-accent/50 hover:text-accent"
				>
					<svg
						class="size-4"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						aria-hidden="true"
					>
						<path d="M12 5v14M5 12h14" />
					</svg>
					New tangent
				</a>
			</div>
		</div>
	</header>

	<main
		class="mx-auto w-full flex-1 px-4 py-6 transition-[max-width] duration-200 ease-out {shellWidth}"
	>
		{@render children()}
	</main>
</div>
