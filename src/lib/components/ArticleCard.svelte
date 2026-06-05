<script lang="ts">
	import type { FeedCard } from '$lib/feed/types';
	import { profile } from '$lib/engagement/profile.svelte';
	import ConnectionBreadcrumb from './ConnectionBreadcrumb.svelte';

	let {
		card,
		onBranch
	}: {
		card: FeedCard;
		onBranch: (card: FeedCard) => Promise<void> | void;
	} = $props();

	const article = $derived(card.article);
	const liked = $derived(profile.isLiked(article.title));

	let branching = $state(false);

	async function branch() {
		if (branching) return;
		branching = true;
		try {
			await onBranch(card);
		} finally {
			branching = false;
		}
	}

	function openFull() {
		profile.recordClickthrough(article.title);
	}

	// Dwell tracking: accumulate time this card is at least half on screen.
	let el = $state<HTMLElement | null>(null);
	let visibleSince = 0;

	function flushDwell() {
		if (!visibleSince) return;
		const ms = performance.now() - visibleSince;
		visibleSince = 0;
		if (ms > 500) profile.recordDwell(article, ms);
	}

	$effect(() => {
		if (!el) return;
		const io = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
						if (!visibleSince) visibleSince = performance.now();
					} else {
						flushDwell();
					}
				}
			},
			{ threshold: [0, 0.5, 1] }
		);
		io.observe(el);
		return () => {
			flushDwell();
			io.disconnect();
		};
	});
</script>

<article
	bind:this={el}
	class="animate-rise overflow-hidden rounded-[var(--radius-card)] border border-hair
		bg-surface/80 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur-sm
		transition-colors hover:border-hair-strong"
>
	{#if article.thumbnail}
		<div class="relative aspect-[16/10] w-full overflow-hidden bg-surface-2">
			<img
				src={article.thumbnail.source}
				alt={article.title}
				loading="lazy"
				class="size-full object-cover"
			/>
			<div
				class="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface/90 via-transparent to-transparent"
			></div>
		</div>
	{:else}
		<div
			class="flex aspect-[16/6] w-full items-center justify-center
				bg-gradient-to-br from-surface-2 to-surface text-2xl font-semibold text-faint"
		>
			{article.title.slice(0, 2)}
		</div>
	{/if}

	<div class="space-y-3 p-5 sm:p-6">
		<ConnectionBreadcrumb connection={card.connection} />

		<h2 class="font-display text-2xl leading-tight font-semibold tracking-tight text-ink">
			{article.title}
		</h2>

		{#if article.description}
			<p class="text-sm text-faint italic">{article.description}</p>
		{/if}

		<p class="clamp-4 text-[15px] leading-relaxed text-muted">{article.extract}</p>

		<div class="flex flex-wrap items-center gap-2 pt-1">
			<button
				type="button"
				onclick={() => profile.toggleLike(article)}
				aria-pressed={liked}
				aria-label={liked ? 'Unlike' : 'Like'}
				class="group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm
					font-medium transition-all active:scale-95
					{liked
					? 'border-like/40 bg-like/10 text-like'
					: 'border-hair text-muted hover:border-hair-strong hover:text-ink'}"
			>
				<svg
					class="size-4 transition-transform group-active:scale-110"
					viewBox="0 0 24 24"
					fill={liked ? 'currentColor' : 'none'}
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<path
						d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"
					/>
				</svg>
				{liked ? 'Liked' : 'Like'}
			</button>

			<button
				type="button"
				onclick={branch}
				disabled={branching}
				class="inline-flex items-center gap-1.5 rounded-full border border-hair px-3 py-1.5
					text-sm font-medium text-muted transition-all hover:border-accent/50
					hover:text-accent active:scale-95 disabled:opacity-50"
			>
				<svg
					class="size-4 {branching ? 'animate-spin' : ''}"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					aria-hidden="true"
				>
					{#if branching}
						<path d="M21 12a9 9 0 1 1-6.2-8.6" />
					{:else}
						<path d="M12 3v18M3 12h18" opacity="0.5" />
						<circle cx="12" cy="12" r="9" opacity="0.5" />
					{/if}
				</svg>
				More like this
			</button>

			<a
				href={article.wikiUrl}
				target="_blank"
				rel="noopener noreferrer"
				onclick={openFull}
				class="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm
					font-medium text-faint transition-colors hover:text-ink"
			>
				Read full
				<svg
					class="size-3.5"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M7 17 17 7M9 7h8v8" />
				</svg>
			</a>
		</div>
	</div>
</article>
