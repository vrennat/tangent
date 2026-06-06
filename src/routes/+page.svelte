<script lang="ts">
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import { feed } from '$lib/feed/feedState.svelte';
	import type { FeedCard } from '$lib/feed/types';
	import { randomSeed } from '$lib/seeds';
	import ArticleCard from '$lib/components/ArticleCard.svelte';
	import SkeletonCard from '$lib/components/SkeletonCard.svelte';

	const seedParam = $derived(page.url.searchParams.get('seed'));

	// Start (or restart) the rabbit hole when the seed changes; auto-seed a bare visit.
	$effect(() => {
		const seed = seedParam ?? undefined;
		if (seed) {
			if (seed !== feed.seedTitle) feed.start(seed);
		} else if (feed.status === 'idle' && feed.cards.length === 0) {
			feed.start(randomSeed().title);
		}
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
				if (feed.cards.length === before) break; // no progress — avoid spinning
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
</script>

<svelte:head>
	<title>{feed.seedTitle ? `${feed.seedTitle} · Wormhole` : 'Wormhole'}</title>
</svelte:head>

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
		<p class="text-center text-sm text-faint">Opening a wormhole…</p>
		<SkeletonCard />
		<SkeletonCard />
	</div>
{:else}
	{#if feed.cards.length > 1}
		<p class="mb-5 text-center text-xs font-medium tracking-widest text-faint uppercase">
			{feed.cards.length} articles deep
		</p>
	{/if}

	<div class="space-y-5">
		{#each feed.cards as card (card.id)}
			<div data-card={card.id} class="scroll-mt-20">
				<ArticleCard {card} onBranch={handleBranch} />
			</div>
		{/each}
	</div>

	<div bind:this={sentinel} class="h-4"></div>

	<div class="py-8">
		{#if feed.isExhausted}
			<div class="flex flex-col items-center gap-4 text-center">
				<p class="text-sm text-muted">This wormhole has collapsed — no more links to follow.</p>
				<a
					href="/start"
					class="rounded-full border border-hair px-4 py-2 text-sm font-medium text-muted
						transition-colors hover:border-accent/50 hover:text-accent">Start a new wormhole</a
				>
			</div>
		{:else}
			<SkeletonCard />
		{/if}
	</div>
{/if}
