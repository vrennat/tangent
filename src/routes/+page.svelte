<script lang="ts">
	import { tick } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { feed } from '$lib/feed/feedState.svelte';
	import { reader } from '$lib/reader/readerState.svelte';
	import { trailPanel } from '$lib/feed/trailPanel.svelte';
	import { loadTrail } from '$lib/feed/trail';
	import type { FeedCard } from '$lib/feed/types';
	import { randomSeed } from '$lib/seeds';
	import ArticleCard from '$lib/components/ArticleCard.svelte';
	import ArticleReader from '$lib/components/ArticleReader.svelte';
	import TrailPanel from '$lib/components/TrailPanel.svelte';
	import SkeletonCard from '$lib/components/SkeletonCard.svelte';
	import ActionHint from '$lib/components/ActionHint.svelte';

	const seedParam = $derived(page.url.searchParams.get('seed'));

	// Rehydrate an existing session or start fresh. Runs on mount and whenever
	// seedParam changes. rehydrate() returns false when no matching trail exists,
	// in which case start() kicks off a fresh feed. The cancelled flag stops a
	// superseded run from starting the feed it was navigated away from.
	$effect(() => {
		const seed = seedParam;
		// A new seed means a new feed — don't leave a stale article open beside it
		// (the reader is a singleton and would otherwise orphan onto the new/errored page).
		reader.close();
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

	// Scroll a card into view and flag it as the landing target, so a fading ember
	// ring marks which article an explicit branch/dive/jump took you to — the new
	// card is appended at the tail, where it'd otherwise be hard to pick out.
	let landedId = $state<string | null>(null);
	let landedTimer: ReturnType<typeof setTimeout> | undefined;

	// Closing the reader collapses the two-pane split back to one column by animating
	// `main`'s max-width (~200ms). Scrolling before that finishes makes the smooth scroll
	// lock onto a stale target: the cards above the destination are mid-reflow and keep
	// growing as the column narrows, so the destination slides down out from under the
	// scroll and lands up to a screen short. Wait for the transition to end before
	// scrolling. The timeout is a fallback for when no transition fires (reduced motion,
	// or the column width didn't actually change) so the scroll never hangs.
	function waitForReaderCollapse(wasOpen: boolean): Promise<void> {
		if (!wasOpen || !browser) return Promise.resolve();
		// The two-pane split (and its max-width transition) only exists at lg+; narrow
		// screens use a full-screen reader that doesn't reflow the feed, and reduced-motion
		// snaps the column instantly. In both cases there's nothing to wait for, so don't
		// make the optimistic scroll eat the fallback delay.
		const willTransition =
			window.matchMedia('(min-width: 1024px)').matches &&
			!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (!willTransition) return Promise.resolve();
		const main = document.querySelector('main');
		if (!main) return Promise.resolve();
		return new Promise((resolve) => {
			let settled = false;
			const finish = () => {
				if (settled) return;
				settled = true;
				main.removeEventListener('transitionend', onEnd);
				resolve();
			};
			const onEnd = (e: Event) => {
				if (e.target === main && (e as TransitionEvent).propertyName === 'max-width') finish();
			};
			main.addEventListener('transitionend', onEnd);
			setTimeout(finish, 320);
		});
	}

	async function goToCard(id: string) {
		// Navigating to a card means you want to see that card — close the reader first
		// (it would otherwise stay open over the destination) and let the layout settle
		// back to one column before scrolling.
		const wasReaderOpen = reader.isOpen;
		reader.close();
		await tick();
		await waitForReaderCollapse(wasReaderOpen);
		document
			.querySelector(`[data-card="${id}"]`)
			?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		landedId = id;
		clearTimeout(landedTimer);
		landedTimer = setTimeout(() => (landedId = null), 1600);
	}

	async function handleBranch(card: FeedCard) {
		const id = await feed.branchFrom(card);
		if (id) await goToCard(id);
	}

	function handleRead(card: FeedCard) {
		// The card's "Read" already recorded the clickthrough; just open the reader.
		reader.open(card.article.title);
	}

	// Diving into an in-article link closes the reader and drops the linked article as a
	// fresh card at the tail of the feed (relation 'dive'), then scrolls you to it — so the
	// feed itself stays the record of the rabbit hole rather than a hidden reader stack.
	// `fromTitle` is the article you were reading, for the new card's "Dove in from …"
	// breadcrumb. beginDive feeds the engagement profile (clickthrough + seen) on its own.
	async function handleDive(title: string) {
		const fromTitle = reader.current ?? '';
		reader.close();
		// beginDive drops a placeholder card synchronously and returns its id, so we scroll
		// to (and ring) it right away — the landing animation plays while the body loads in.
		const id = feed.beginDive(title, fromTitle);
		await goToCard(id);
	}

	let jumpingRelated = $state(false);

	async function handleJumpRelated() {
		if (jumpingRelated) return;
		jumpingRelated = true;
		try {
			const id = await feed.jumpRelated();
			if (id) await goToCard(id);
			else feed.showStartOver = true;
		} finally {
			jumpingRelated = false;
		}
	}

	async function handleTrailSelect(id: string) {
		trailPanel.close();
		await goToCard(id);
	}

	// For each card, the id of the card it came from — the nearest earlier card whose
	// title matches its breadcrumb's `fromTitle`. Lets a card's "from X" jump back to
	// the source so the thread is navigable, not just labelled. Absent when the source
	// scrolled out of the chain (e.g. trimmed on rehydrate) or for the seed.
	const sourceIdByCard = $derived.by(() => {
		const map = new Map<string, string>();
		const cards = feed.cards;
		for (let i = 0; i < cards.length; i++) {
			const from = cards[i].connection.fromTitle;
			if (!from) continue;
			for (let j = i - 1; j >= 0; j--) {
				if (cards[j].article.title === from) {
					map.set(cards[i].id, cards[j].id);
					break;
				}
			}
		}
		return map;
	});
</script>

<svelte:head>
	<title>{feed.displayTitle ? `${feed.displayTitle} · Tangent` : 'Tangent'}</title>
</svelte:head>

{#if trailPanel.isOpen}
	<TrailPanel
		trail={feed.trail.filter((n) => n.seen)}
		presentIds={new Set(feed.cards.map((c) => c.id))}
		onClose={() => trailPanel.close()}
		onSelect={handleTrailSelect}
	/>
{/if}

<!-- Reading splits the page into two panes (lg+): feed on the left, article on the right. -->
<div class={reader.isOpen ? 'lg:flex lg:items-start lg:gap-6' : ''}>
	<!-- `contents` when closed so the feed keeps its exact single-column layout. -->
	<div class={reader.isOpen ? 'lg:w-[42%] lg:shrink-0 lg:min-w-0' : 'contents'}>
		<h1 class="sr-only">Tangent — {feed.displayTitle ?? 'a Wikipedia rabbit hole'}</h1>
		{#if feed.status === 'error'}
	<div class="flex flex-col items-center gap-4 py-20 text-center">
		<p class="text-muted">{feed.error}</p>
		<a
			href="/start"
			data-cta
			class="inline-flex items-center rounded-full bg-accent px-4 py-2 text-sm font-medium text-void
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
	<div class="space-y-5">
		<ActionHint />
		{#each feed.cards as card (card.id)}
			{@const sourceId = sourceIdByCard.get(card.id)}
			<div data-card={card.id} class="scroll-mt-20" class:wh-land={card.id === landedId}>
				<ArticleCard
					{card}
					onBranch={handleBranch}
					onRead={handleRead}
					onNavigateToSource={sourceId ? () => goToCard(sourceId) : undefined}
					onSeen={() => feed.markSeen(card.id)}
				/>
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
					data-cta
					class="inline-flex items-center rounded-full border border-hair px-4 py-2 text-sm font-medium text-muted
						transition-colors hover:border-accent/50 hover:text-accent">Start a new tangent</a
				>
			</div>
		{:else}
			<SkeletonCard />
		{/if}
	</div>
		{/if}
	</div>

	{#if reader.isOpen}
		<ArticleReader onDive={handleDive} />
	{/if}
</div>
