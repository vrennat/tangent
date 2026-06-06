<script lang="ts">
	import { goto } from '$app/navigation';
	import type { FeedCard } from '$lib/feed/types';
	import { profile } from '$lib/engagement/profile.svelte';
	import { wormholeTitleFromHref } from '$lib/wikipedia/links';
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

	// Inline full-article reading: fetch sanitized HTML on first expand, then toggle.
	let expanded = $state(false);
	let articleHtml = $state<string | null>(null);
	let htmlLoading = $state(false);
	let htmlError = $state(false);
	let contentEl = $state<HTMLElement | null>(null);

	async function toggleRead() {
		if (expanded) {
			expanded = false;
			return;
		}
		expanded = true;
		profile.recordClickthrough(article.title);
		if (articleHtml || htmlLoading) return;

		htmlLoading = true;
		htmlError = false;
		try {
			const res = await fetch(`/api/article?title=${encodeURIComponent(article.title)}`);
			const data = (await res.json()) as { html: string | null };
			if (data.html) articleHtml = data.html;
			else htmlError = true;
		} catch {
			htmlError = true;
		} finally {
			htmlLoading = false;
		}
	}

	// Rewire links inside the rendered article:
	//  - article links  -> open a new wormhole from that topic (client-side nav)
	//  - everything else -> open on Wikipedia in a new tab
	//  - in-page #anchors -> left alone (scroll to footnotes/sections within the card)
	$effect(() => {
		if (!contentEl || !articleHtml) return;

		for (const a of contentEl.querySelectorAll('a')) {
			const href = a.getAttribute('href') ?? '';
			if (href.startsWith('#')) continue;

			const title = wormholeTitleFromHref(href);
			if (title) {
				// Real URL so middle/cmd-click opens the new wormhole in a new tab too.
				a.setAttribute('href', `/?seed=${encodeURIComponent(title)}`);
				a.dataset.seed = title;
				a.classList.add('wh-dive');
				a.removeAttribute('target');
			} else {
				a.setAttribute('target', '_blank');
				a.setAttribute('rel', 'noopener noreferrer');
				a.classList.add('wh-external');
			}
		}

		// Plain left-clicks on article links navigate in-app (smooth); modified clicks
		// fall through to the rewritten href (new tab) via the default behavior.
		const onClick = (event: MouseEvent) => {
			if (event.defaultPrevented || event.button !== 0) return;
			if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
			const anchor = (event.target as HTMLElement | null)?.closest?.('a');
			const seed = anchor?.dataset.seed;
			if (!seed) return;
			event.preventDefault();
			goto(`/?seed=${encodeURIComponent(seed)}`);
		};
		contentEl.addEventListener('click', onClick);
		return () => contentEl?.removeEventListener('click', onClick);
	});

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

			<button
				type="button"
				onclick={toggleRead}
				aria-expanded={expanded}
				class="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm
					font-medium transition-colors {expanded
					? 'text-accent'
					: 'text-faint hover:text-ink'}"
			>
				{expanded ? 'Collapse' : 'Read article'}
				<svg
					class="size-3.5 transition-transform {expanded ? 'rotate-180' : ''}
						{htmlLoading ? 'animate-spin' : ''}"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					{#if htmlLoading}
						<path d="M21 12a9 9 0 1 1-6.2-8.6" />
					{:else}
						<path d="m6 9 6 6 6-6" />
					{/if}
				</svg>
			</button>
		</div>

		{#if expanded}
			<div class="mt-2 border-t border-hair pt-4">
				{#if htmlLoading}
					<div class="space-y-2.5" aria-hidden="true">
						<div class="h-3 w-full animate-pulse rounded-full bg-surface-2"></div>
						<div class="h-3 w-11/12 animate-pulse rounded-full bg-surface-2"></div>
						<div class="h-3 w-full animate-pulse rounded-full bg-surface-2"></div>
						<div class="h-3 w-4/5 animate-pulse rounded-full bg-surface-2"></div>
					</div>
				{:else if htmlError}
					<p class="text-sm text-faint">
						Couldn't load the article inline.
						<a
							href={article.wikiUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="text-accent hover:underline">Open on Wikipedia instead ↗</a
						>
					</p>
				{:else if articleHtml}
					<div class="max-h-[75vh] overflow-y-auto pr-1">
						<!-- Sanitized server-side (scripts/handlers stripped); see wikipedia/article.ts -->
						<div bind:this={contentEl} class="wiki-content">{@html articleHtml}</div>
					</div>
					<div class="mt-4 flex items-center justify-between border-t border-hair pt-3">
						<a
							href={article.wikiUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="text-xs font-medium text-faint transition-colors hover:text-ink"
							>Open on Wikipedia ↗</a
						>
						<button
							type="button"
							onclick={toggleRead}
							class="text-xs font-medium text-accent hover:underline">Collapse</button
						>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</article>
