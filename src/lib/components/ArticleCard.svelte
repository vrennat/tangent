<script lang="ts">
	import type { FeedCard } from '$lib/feed/types';
	import { profile } from '$lib/engagement/profile.svelte';
	import ConnectionBreadcrumb from './ConnectionBreadcrumb.svelte';

	let {
		card,
		onBranch,
		onRead,
		onNavigateToSource,
		onSeen
	}: {
		card: FeedCard;
		onBranch: (card: FeedCard) => Promise<void> | void;
		onRead: (card: FeedCard) => void;
		/** Jump to the card this one branched/linked/dove from, if it's in view. */
		onNavigateToSource?: () => void;
		/** Fired once when this card first scrolls into view — joins it to the trail. */
		onSeen?: () => void;
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
	// Fire onSeen once — the first time this card is actually scrolled into view.
	let hasSignaledSeen = false;

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
						if (!hasSignaledSeen) {
							hasSignaledSeen = true;
							onSeen?.();
						}
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
		bg-surface shadow-card transition-colors hover:border-hair-strong"
>
	<div class="space-y-3 p-5 sm:p-6">
		<ConnectionBreadcrumb connection={card.connection} onNavigate={onNavigateToSource} />

		<!-- Title, lead, and summary flow around a small floated thumbnail inset — it's
		     a garnish, not a hero, and letting the text wrap beside and below it keeps a
		     short card from stranding the image in whitespace. flow-root contains the
		     float so the actions row below clears it. -->
		<div class="flow-root">
			{#if article.thumbnail && !imageFailed}
				<!-- Decorative: the title alongside already names it, so alt is empty. -->
				<img
					src={article.thumbnail.source}
					alt=""
					loading="lazy"
					onerror={() => (imageFailed = true)}
					class="float-right mb-2 ml-4 mt-1 size-20 rounded-xl border border-hair object-cover object-top sm:size-24"
				/>
			{/if}

			<h2 class="font-display text-2xl leading-tight font-semibold tracking-tight text-ink">
				{article.title}
			</h2>

			{#if article.description}
				<p class="mt-1 font-display text-[15px] text-faint italic">{article.description}</p>
			{/if}

			<!-- Full summary extract: the hook. Wikipedia bounds this to a sentence-complete
			     few paragraphs, so we show it whole rather than clamping it to a stub. -->
			<p class="mt-3 font-display text-base leading-relaxed text-muted">{article.extract}</p>
		</div>

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
				<!-- Favorite star — the geometric mark for like, filled when active. -->
				<svg
					class="size-4 transition-transform group-active:scale-110"
					viewBox="0 0 24 24"
					fill={liked ? 'currentColor' : 'none'}
					stroke="currentColor"
					stroke-width="2"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path
						d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
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
				class="group ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm
					font-medium text-muted transition-colors hover:text-ink"
			>
				Read article
				<!-- Arrow, not a chevron: this opens the reader pane, it doesn't expand in place. -->
				<svg
					class="size-3.5 transition-transform group-hover:translate-x-0.5"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M5 12h14M13 6l6 6-6 6" />
				</svg>
			</button>
		</div>
	</div>
</div>
