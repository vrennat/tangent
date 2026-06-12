<script lang="ts">
	import { goto } from '$app/navigation';
	import type { Article } from '$lib/wikipedia/types';
	import { articleTitleFromHref } from '$lib/wikipedia/links';

	let {
		article,
		onClose,
		onDive
	}: {
		article: Article;
		onClose: () => void;
		onDive?: (title: string) => void;
	} = $props();

	let scrollEl = $state<HTMLElement | null>(null);
	let contentEl = $state<HTMLElement | null>(null);
	let articleHtml = $state<string | null>(null);
	let htmlLoading = $state(false);
	let htmlError = $state(false);

	// Fetch the inline article HTML. Re-runs when `article` changes — opening a new
	// card while the panel is already open swaps the content in place. The request is
	// aborted on unmount/swap so a quick change doesn't waste it.
	$effect(() => {
		const title = article.title;
		if (scrollEl) scrollEl.scrollTop = 0;

		const controller = new AbortController();
		articleHtml = null;
		htmlLoading = true;
		htmlError = false;
		fetch(`/api/article?title=${encodeURIComponent(title)}`, { signal: controller.signal })
			.then((res) => res.json())
			.then((data: { html: string | null }) => {
				if (data.html) articleHtml = data.html;
				else htmlError = true;
				htmlLoading = false;
			})
			.catch((err: unknown) => {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				htmlError = true;
				htmlLoading = false;
			});
		return () => controller.abort();
	});

	// Rewire article links once the HTML renders.
	// - Wikipedia article links become dives (left-click) or new-tab tangents (cmd/middle).
	// - Everything else opens on Wikipedia in a new tab.
	$effect(() => {
		if (!contentEl || !articleHtml) return;

		for (const a of contentEl.querySelectorAll('a')) {
			const href = a.getAttribute('href') ?? '';
			if (href.startsWith('#')) continue;

			const title = articleTitleFromHref(href);
			if (title) {
				// Real URL preserves middle/cmd-click behavior (new tangent in new tab).
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

		const onClick = (event: MouseEvent) => {
			if (event.defaultPrevented || event.button !== 0) return;
			if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
			const anchor = (event.target as HTMLElement | null)?.closest?.('a');
			const seed = anchor?.dataset.seed;
			if (!seed) return;
			event.preventDefault();
			if (onDive) {
				onDive(seed);
			} else {
				goto(`/?seed=${encodeURIComponent(seed)}`);
			}
		};
		contentEl.addEventListener('click', onClick);
		return () => contentEl?.removeEventListener('click', onClick);
	});
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape') onClose();
	}}
/>

<!--
	Mobile (base): a full-screen takeover — there's no room beside the feed.
	Desktop (lg+): an in-flow, sticky right-hand pane that sits next to the feed as a
	real part of the page (no backdrop, no modal); the feed stays scrollable alongside.
-->
<aside
	aria-label="Article reader"
	class="animate-rise fixed inset-0 z-40 flex flex-col bg-void text-ink
		lg:sticky lg:inset-auto lg:top-16 lg:z-auto lg:h-[calc(100dvh-5rem)] lg:flex-1
		lg:min-w-0 lg:overflow-hidden lg:rounded-2xl lg:border lg:border-hair
		lg:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6)]"
>
	<!-- Sticky header -->
	<div
		class="z-10 flex items-start gap-3 border-b border-hair bg-surface/90 px-4 py-3
			backdrop-blur-sm sm:px-6"
	>
		<h2 class="font-display flex-1 text-lg leading-snug font-semibold tracking-tight text-ink">
			{article.title}
		</h2>
		<button
			type="button"
			onclick={onClose}
			aria-label="Close article"
			class="mt-0.5 shrink-0 rounded-full p-1.5 text-muted transition-colors
				hover:bg-surface-2 hover:text-ink"
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
				<path d="M18 6 6 18M6 6l12 12" />
			</svg>
		</button>
	</div>

	<!-- Scrollable body -->
	<div bind:this={scrollEl} class="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
		{#if htmlLoading}
			<div class="space-y-2.5" aria-hidden="true">
				{#each { length: 8 } as _}
					<div class="h-3 w-full animate-pulse rounded-full bg-surface-2"></div>
				{/each}
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
			<!-- Sanitized server-side (scripts/handlers stripped); see wikipedia/article.ts -->
			<div bind:this={contentEl} class="wiki-content">{@html articleHtml}</div>
			<div class="mt-6 border-t border-hair pt-4">
				<a
					href={article.wikiUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="text-xs font-medium text-faint transition-colors hover:text-ink"
					>Open on Wikipedia ↗</a
				>
			</div>
		{/if}
	</div>
</aside>
