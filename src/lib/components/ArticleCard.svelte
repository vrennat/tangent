<script lang="ts">
	import type { FeedCard } from '$lib/feed/types';
	import { Star, CirclePlus, LoaderCircle, ArrowRight } from '@lucide/svelte';
	import { FEED } from '$lib/feed/config';
	import { profile } from '$lib/engagement/profile.svelte';
	import { feed } from '$lib/feed/feedState.svelte';
	import { track } from '$lib/metrics';
	import { actionHint } from '$lib/feed/hint.svelte';
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
	// An optimistic dive placeholder: title + breadcrumb are real, the body is still
	// loading. We show its title immediately (the landing animation already played) and
	// a skeleton body, and suppress interactions until the real article patches in.
	const pending = $derived(card.pending ?? false);

	let branching = $state(false);
	let interacted = false;
	// Wikipedia thumbnails (especially body-scraped fallbacks) sometimes 404. The inset
	// is decorative garnish, so a broken one collapses rather than showing a broken box.
	let imageFailed = $state(false);

	async function branch() {
		if (branching) return;
		interacted = true;
		actionHint.dismiss();
		profile.recordBranch(article);
		track('branch', { title: article.title });
		branching = true;
		try {
			await onBranch(card);
		} finally {
			branching = false;
		}
	}

	function read() {
		interacted = true;
		actionHint.dismiss();
		profile.recordClickthrough(article);
		track('article_opened', { title: article.title });
		onRead(card);
	}

	function toggleLike() {
		interacted = true;
		actionHint.dismiss();
		profile.toggleLike(article);
		// Count the like, not the unlike — track only when it flips on.
		if (profile.isLiked(article.title)) track('like', { title: article.title });
	}

	// Tapping anywhere on the card (except buttons/links) opens the reader.
	function handleCardTap(event: MouseEvent) {
		if (pending) return; // nothing to read yet
		const el = event.target as HTMLElement | null;
		if (el?.closest('button, a')) return;
		if (window.getSelection()?.toString()) return;
		read();
	}

	// Dwell tracking: accumulate time this card is at least half on screen.
	let el = $state<HTMLElement | null>(null);
	let visibleSince = 0;
	let visibleTotalMs = 0;
	// Fire onSeen once — the first time this card is actually scrolled into view.
	let hasSignaledSeen = false;

	function flushDwell() {
		if (!visibleSince) return;
		const ms = performance.now() - visibleSince;
		visibleSince = 0;
		visibleTotalMs += ms;
		if (ms > 500) profile.recordDwell(article, ms);
		if (
			visibleTotalMs >= FEED.skipMinVisibleMs &&
			visibleTotalMs < FEED.skipThresholdMs &&
			!interacted
		) {
			profile.recordSkip(article);
			track('skip', { title: article.title });
			// A fast-skipped tangent is a dud jump: heal it so the next cards resume
			// from the pre-tangent tip instead of growing a run from a rejected card.
			if (card.connection.relation === 'surprise') feed.heal(card.id);
		}
	}

	$effect(() => {
		if (!el) return;
		const io = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
						// Don't accrue dwell against a placeholder (its body isn't here yet, and
						// the dive already credits a clickthrough on resolve); still mark it seen.
						if (!pending && !visibleSince) visibleSince = performance.now();
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

			{#if pending}
				<!-- Body still loading: the title + breadcrumb landed instantly; pulse the rest.
				     The dive scrolls to this skeleton immediately and the real body streams in
				     after, growing the card downward. Keep this skeleton SHORTER than the
				     shortest real card (3 short lines, no actions row): a taller skeleton would
				     make the card shrink on resolve, re-clamp the scroll, and jump the landing
				     spot — the exact flaky dive this fixed. Don't enrich it. -->
				<div class="mt-3 space-y-2" aria-hidden="true">
					<div class="h-3 w-full animate-pulse rounded-full bg-surface-2"></div>
					<div class="h-3 w-full animate-pulse rounded-full bg-surface-2"></div>
					<div class="h-3 w-4/5 animate-pulse rounded-full bg-surface-2"></div>
				</div>
				<p class="sr-only">Loading article…</p>
			{:else}
				{#if article.description}
					<p class="mt-1 font-display text-[15px] text-faint italic">{article.description}</p>
				{/if}

				<!-- Full summary extract: the hook. Wikipedia bounds this to a sentence-complete
				     few paragraphs, so we show it whole rather than clamping it to a stub. -->
				<p class="mt-3 font-display text-base leading-relaxed text-muted">{article.extract}</p>
			{/if}
		</div>

		{#if !pending}
		<div class="flex flex-wrap items-center gap-2 pt-1">
			<button
				type="button"
				onclick={toggleLike}
				aria-pressed={liked}
				aria-label={liked ? 'Unlike' : 'Like'}
				class="group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm
					font-medium transition-all active:scale-95
					{liked
					? 'border-like/40 bg-like/10 text-like'
					: 'border-hair text-muted hover:border-hair-strong hover:text-ink'}"
			>
				<!-- Favorite star — filled when active. -->
				<Star
					class="size-4 transition-transform group-active:scale-110"
					fill={liked ? 'currentColor' : 'none'}
					aria-hidden="true"
				/>
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
				{#if branching}
					<LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
				{:else}
					<CirclePlus class="size-4" aria-hidden="true" />
				{/if}
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
				<ArrowRight class="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
			</button>
		</div>
		{/if}
	</div>
</div>
