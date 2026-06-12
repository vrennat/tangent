<script lang="ts">
	import type { FeedCard } from '$lib/feed/types';
	import { profile } from '$lib/engagement/profile.svelte';
	import ConnectionBreadcrumb from './ConnectionBreadcrumb.svelte';

	let {
		card,
		onBranch,
		onRead
	}: {
		card: FeedCard;
		onBranch: (card: FeedCard) => Promise<void> | void;
		onRead: (card: FeedCard) => void;
	} = $props();

	const article = $derived(card.article);
	const liked = $derived(profile.isLiked(article.title));

	let branching = $state(false);
	// Wikipedia thumbnails (especially body-scraped fallbacks) sometimes 404. The inset
	// is decorative garnish, so a broken one collapses rather than showing a broken box.
	let imageFailed = $state(false);

	async function branch() {
		if (branching) return;
		branching = true;
		try {
			await onBranch(card);
		} finally {
			branching = false;
		}
	}

	function read() {
		profile.recordClickthrough(article);
		onRead(card);
	}

	// Tapping anywhere on the card (except buttons/links) opens the reader.
	function handleCardTap(event: MouseEvent) {
		const el = event.target as HTMLElement | null;
		if (el?.closest('button, a')) return;
		if (window.getSelection()?.toString()) return;
		read();
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

<!-- Tap-to-open is a convenience; the keyboard-accessible path is the "Read article" button. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
	bind:this={el}
	onclick={handleCardTap}
	class="animate-rise block cursor-pointer overflow-hidden rounded-[var(--radius-card)] border border-hair
		bg-surface/80 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur-sm
		transition-colors hover:border-hair-strong"
>
	<div class="space-y-3 p-5 sm:p-6">
		<ConnectionBreadcrumb connection={card.connection} />

		<!-- Title + one-liner lead; the image is a small inset garnish, not a hero. -->
		<div class="flex items-start gap-4">
			<div class="min-w-0 flex-1 space-y-1">
				<h2 class="font-display text-2xl leading-tight font-semibold tracking-tight text-ink">
					{article.title}
				</h2>

				{#if article.description}
					<p class="text-sm text-faint italic">{article.description}</p>
				{/if}
			</div>

			{#if article.thumbnail && !imageFailed}
				<!-- Decorative: the title alongside already names it, so alt is empty. -->
				<img
					src={article.thumbnail.source}
					alt=""
					loading="lazy"
					onerror={() => (imageFailed = true)}
					class="size-20 shrink-0 rounded-xl border border-hair object-cover sm:size-24"
				/>
			{/if}
		</div>

		<!-- Full summary extract: the hook. Wikipedia bounds this to a sentence-complete
		     few paragraphs, so we show it whole rather than clamping it to a stub. -->
		<p class="text-[15px] leading-relaxed text-muted">{article.extract}</p>

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

			<button
				type="button"
				onclick={read}
				class="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm
					font-medium text-faint transition-colors hover:text-ink"
			>
				Read article
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
					<path d="m6 9 6 6 6-6" />
				</svg>
			</button>
		</div>
	</div>
</div>
