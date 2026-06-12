<script lang="ts">
	import { tick } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { feed } from '$lib/feed/feedState.svelte';
	import { reader } from '$lib/reader/readerState.svelte';
	import { loadTrail } from '$lib/feed/trail';
	import type { FeedCard } from '$lib/feed/types';
	import { randomSeed } from '$lib/seeds';
	import ArticleCard from '$lib/components/ArticleCard.svelte';
	import ArticleReader from '$lib/components/ArticleReader.svelte';
	import TrailPanel from '$lib/components/TrailPanel.svelte';
	import SkeletonCard from '$lib/components/SkeletonCard.svelte';

	const seedParam = $derived(page.url.searchParams.get('seed'));

	// Rehydrate an existing session or start fresh. Runs on mount and whenever
	// seedParam changes. rehydrate() returns false when no matching trail exists,
	// in which case start() kicks off a fresh feed. The cancelled flag stops a
	// superseded run from starting the feed it was navigated away from.
	$effect(() => {
		const seed = seedParam;
		let cancelled = false;
		(async () => {
			const stored = browser ? loadTrail() : null;
			const seedMatches = stored && (seed === null || seed === stored.seedTitle);

			if (seedMatches) {
				const ok = await feed.rehydrate(seed);
				if (cancelled) return;
				if (!ok) {
					if (seed) feed.start(seed);
					else if (feed.status === 'idle') feed.start(randomSeed().title);
				}
			} else {
				if (seed) {
					if (seed !== feed.seedTitle) feed.start(seed);
				} else if (feed.status === 'idle' && feed.cards.length === 0) {
					feed.start(randomSeed().title);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	let sentinel = $state<HTMLElement | null>(null);
	let pumping = false;

	/**
	 * Reveal buffered cards until the sentinel is pushed beyond the prefetch margin.
	 * Looping (rather than one reveal per intersection event) is what keeps a short
	 * feed flowing — otherwise the observer fires once and never re-triggers because
	 * the sentinel never leaves the viewport's expanded root box.
	 */
	async function pump() {
		if (pumping || !sentinel) return;
		pumping = true;
		try {
			while (
				sentinel &&
				!feed.isExhausted &&
				feed.status === 'ready' &&
				sentinel.getBoundingClientRect().top <= window.innerHeight + 700
			) {
				const before = feed.cards.length;
				await feed.more();
				await tick();
				if (feed.cards.length === before) break;
			}
		} finally {
			pumping = false;
		}
	}

	$effect(() => {
		if (!sentinel) return;
		const io = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) pump();
			},
			{ rootMargin: '700px' }
		);
		io.observe(sentinel);
		return () => io.disconnect();
	});

	async function handleBranch(card: FeedCard) {
		const id = await feed.branchFrom(card);
		if (!id) return;
		await tick();
		document
			.querySelector(`[data-card="${id}"]`)
			?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function handleRead(card: FeedCard) {
		reader.open(card);
	}

	async function handleDive(title: string) {
		reader.close();
		const id = await feed.addDive(title);
		if (!id) return;
		await tick();
		document
			.querySelector(`[data-card="${id}"]`)
			?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	let jumpingRelated = $state(false);

	async function handleJumpRelated() {
		if (jumpingRelated) return;
		jumpingRelated = true;
		try {
			const ok = await feed.jumpRelated();
			if (!ok) feed.showStartOver = true;
		} finally {
			jumpingRelated = false;
		}
	}

	let trailOpen = $state(false);

	async function handleTrailSelect(id: string) {
		trailOpen = false;
		await tick();
		document
			.querySelector(`[data-card="${id}"]`)
			?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
</script>

<svelte:head>
	<title>{feed.seedTitle ? `${feed.seedTitle} · Tangent` : 'Tangent'}</title>
</svelte:head>

{#if trailOpen}
	<TrailPanel
		trail={feed.trail}
		presentIds={new Set(feed.cards.map((c) => c.id))}
		onClose={() => (trailOpen = false)}
		onSelect={handleTrailSelect}
	/>
{/if}

<!-- Reading splits the page into two panes (lg+): feed on the left, article on the right. -->
<div class={reader.isOpen ? 'lg:flex lg:items-start lg:gap-6' : ''}>
	<!-- `contents` when closed so the feed keeps its exact single-column layout. -->
	<div class={reader.isOpen ? 'lg:w-[42%] lg:shrink-0 lg:min-w-0' : 'contents'}>
		{#if feed.status === 'error'}
	<div class="flex flex-col items-center gap-4 py-20 text-center">
		<p class="text-muted">{feed.error}</p>
		<a
			href="/start"
			class="rounded-full bg-accent px-4 py-2 text-sm font-medium text-void
				transition-opacity hover:opacity-90">Pick a starting point</a
		>
	</div>
{:else if feed.cards.length === 0}
	<div class="space-y-5">
		<p class="text-center text-sm text-faint">Going off on a tangent…</p>
		<SkeletonCard />
		<SkeletonCard />
	</div>
{:else}
	{#if feed.trail.length > 1}
		<!-- Sticky depth chip: replaces the scroll-away counter. Always visible, opens the trail panel. -->
		<div class="sticky top-14 z-10 mb-5 flex justify-center">
			<button
				type="button"
				onclick={() => (trailOpen = true)}
				class="inline-flex items-center gap-1.5 rounded-full border border-hair bg-void/80
					px-3 py-1.5 text-xs font-medium text-muted backdrop-blur-sm transition-colors
					hover:border-accent/50 hover:text-accent"
			>
				{feed.trail.length} deep
				<svg
					class="size-3"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					aria-hidden="true"
				>
					<path d="m6 9 6 6 6-6" />
				</svg>
			</button>
		</div>
	{/if}

	<div class="space-y-5">
		{#each feed.cards as card (card.id)}
			<div data-card={card.id} class="scroll-mt-20">
				<ArticleCard {card} onBranch={handleBranch} onRead={handleRead} />
			</div>
		{/each}
	</div>

	<div bind:this={sentinel} class="h-4"></div>

	<div class="py-8">
		{#if feed.status === 'stalled'}
			<div class="flex flex-col items-center gap-4 text-center">
				<p class="text-sm text-muted">Connection hiccup.</p>
				<button
					type="button"
					onclick={() => feed.retry()}
					class="rounded-full border border-hair px-4 py-2 text-sm font-medium text-muted
						transition-colors hover:border-accent/50 hover:text-accent"
				>
					Retry
				</button>
			</div>
		{:else if feed.isExhausted}
			<div class="flex flex-col items-center gap-4 text-center">
				<p class="text-sm text-muted">This tangent has run dry — no more links to follow.</p>
				{#if !feed.showStartOver}
					<button
						type="button"
						onclick={handleJumpRelated}
						disabled={jumpingRelated}
						class="rounded-full bg-accent px-4 py-2 text-sm font-medium text-void
							transition-opacity hover:opacity-90 disabled:opacity-50"
					>
						{jumpingRelated ? 'Jumping…' : 'Jump somewhere related'}
					</button>
				{/if}
				<a
					href="/start"
					class="rounded-full border border-hair px-4 py-2 text-sm font-medium text-muted
						transition-colors hover:border-accent/50 hover:text-accent">Start a new tangent</a
				>
			</div>
		{:else}
			<SkeletonCard />
		{/if}
	</div>
		{/if}
	</div>

	{#if reader.card}
		<ArticleReader
			article={reader.card.article}
			onClose={() => reader.close()}
			onDive={handleDive}
		/>
	{/if}
</div>
