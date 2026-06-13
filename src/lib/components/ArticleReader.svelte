<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { reader } from '$lib/reader/readerState.svelte';
	import { articleTitleFromHref } from '$lib/wikipedia/links';
	import { ChevronLeft, X } from '@lucide/svelte';

	let {
		onFollow
	}: {
		/** Follow an in-article link: pushes a new reading level and feeds the profile. */
		onFollow: (title: string) => void;
	} = $props();

	let asideEl = $state<HTMLElement | null>(null);
	let scrollEl = $state<HTMLElement | null>(null);
	let contentEl = $state<HTMLElement | null>(null);
	let articleHtml = $state<string | null>(null);
	let htmlLoading = $state(false);
	let htmlError = $state(false);

	const current = $derived(reader.current);
	const wikiUrl = $derived(
		current ? `https://en.wikipedia.org/wiki/${encodeURIComponent(current.title.replace(/ /g, '_'))}` : ''
	);

	// Load the current level's HTML. Re-runs only when the shown level changes (open/
	// push/back), not when we cache its html or track scroll. A level that was already
	// visited has its html cached, so Back renders instantly with no refetch or flash.
	$effect(() => {
		const entry = reader.current;
		if (!entry) return;
		const { title, html } = untrack(() => ({ title: entry.title, html: entry.html }));

		if (html) {
			articleHtml = html;
			htmlLoading = false;
			htmlError = false;
			return;
		}

		const controller = new AbortController();
		articleHtml = null;
		htmlLoading = true;
		htmlError = false;
		fetch(`/api/article?title=${encodeURIComponent(title)}`, { signal: controller.signal })
			.then((res) => res.json())
			.then((data: { html: string | null }) => {
				if (data.html) {
					articleHtml = data.html;
					reader.cacheHtml(data.html);
				} else {
					htmlError = true;
				}
				htmlLoading = false;
			})
			.catch((err: unknown) => {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				htmlError = true;
				htmlLoading = false;
			});
		return () => controller.abort();
	});

	// Restore this level's scroll offset once its content is in the DOM (0 for a fresh
	// level, the saved offset when walking back). Reads scrollTop untracked so ongoing
	// scrolling doesn't retrigger and fight the user.
	$effect(() => {
		articleHtml;
		const entry = reader.current;
		if (!entry || !articleHtml || !scrollEl) return;
		const top = untrack(() => entry.scrollTop);
		tick().then(() => {
			if (scrollEl) scrollEl.scrollTop = top;
		});
	});

	// Click handling lives on the (stable) content container and classifies each link's
	// raw href on click — so it keeps working across content swaps and cached Back
	// renders, independent of the cosmetic rewrite below (which can lag a render).
	//   - Wikipedia article link → follow in-app (left-click) or new-tab tangent (cmd/ctrl).
	//   - In-page anchor (#section) → default scroll.
	//   - Anything else (citations, File:/Category:, off-wiki) → open in a new tab.
	$effect(() => {
		const el = contentEl;
		if (!el) return;

		const onClick = (event: MouseEvent) => {
			if (event.defaultPrevented || event.button !== 0) return;
			const anchor = (event.target as HTMLElement | null)?.closest?.('a');
			if (!anchor) return;
			const href = anchor.getAttribute('href') ?? '';
			if (href.startsWith('#')) return;

			const title = anchor.dataset.seed ?? articleTitleFromHref(href);
			event.preventDefault();
			if (title) {
				if (event.metaKey || event.ctrlKey) {
					window.open(`/?seed=${encodeURIComponent(title)}`, '_blank', 'noopener');
				} else {
					onFollow(title);
				}
			} else {
				window.open(href, '_blank', 'noopener,noreferrer');
			}
		};
		el.addEventListener('click', onClick);
		return () => el.removeEventListener('click', onClick);
	});

	// Cosmetic only: tag links so article links get the ember underline (.wh-dive) and
	// externals the ↗ marker (.wh-external). Runs after the DOM reflects the current
	// html (tick) so cached Back renders get re-tagged; follow behavior never depends on it.
	$effect(() => {
		articleHtml;
		if (!contentEl) return;
		tick().then(() => {
			if (!contentEl) return;
			for (const a of contentEl.querySelectorAll('a')) {
				const href = a.getAttribute('href') ?? '';
				if (href.startsWith('#')) continue;
				const title = articleTitleFromHref(href);
				if (title) {
					a.dataset.seed = title;
					a.classList.add('wh-dive');
				} else {
					a.classList.add('wh-external');
				}
			}
		});
	});

	// On mobile the reader is a full-screen takeover, so move focus into it on open and
	// restore it to the trigger on close — otherwise keyboard/SR users are left behind
	// it. On desktop (lg+) it's a non-modal in-flow pane beside the feed, so focus stays.
	$effect(() => {
		if (!asideEl) return;
		if (window.matchMedia('(min-width: 1024px)').matches) return;
		const trigger = document.activeElement as HTMLElement | null;
		asideEl.focus();
		return () => trigger?.focus?.();
	});
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key !== 'Escape') return;
		// A stack makes Escape mean "back" until you're at the root, then "close".
		if (reader.canGoBack) reader.back();
		else reader.close();
	}}
/>

<!--
	Mobile (base): a full-screen takeover — there's no room beside the feed.
	Desktop (lg+): an in-flow, sticky right-hand pane that sits next to the feed as a
	real part of the page (no backdrop, no modal); the feed stays scrollable alongside.
-->
<aside
	bind:this={asideEl}
	tabindex="-1"
	aria-label="Article reader"
	class="animate-rise fixed inset-0 z-40 flex flex-col bg-void text-ink focus:outline-none
		lg:sticky lg:inset-auto lg:top-16 lg:z-auto lg:h-[calc(100dvh-5rem)] lg:flex-1
		lg:min-w-0 lg:overflow-hidden lg:rounded-[var(--radius-card)] lg:border lg:border-hair
		lg:shadow-card"
>
	<!-- Sticky header. Extra top padding clears the notch when the reader is a
	     full-screen takeover on mobile (reset on desktop, where it sits below the app bar). -->
	<div
		class="z-10 flex items-center gap-2 border-b border-hair bg-surface px-4 sm:px-6
			pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 lg:pt-3"
	>
		{#if reader.canGoBack}
			<button
				type="button"
				onclick={() => reader.back()}
				aria-label="Back"
				class="icon-btn -ml-1 inline-flex shrink-0 items-center justify-center rounded-full p-1.5
					text-muted transition-colors hover:bg-surface-2 hover:text-ink"
			>
				<ChevronLeft class="size-5" aria-hidden="true" />
			</button>
		{/if}
		<h2 class="font-display flex-1 text-xl leading-snug font-semibold tracking-tight text-ink">
			{current?.title}
		</h2>
		<button
			type="button"
			onclick={() => reader.close()}
			aria-label="Close article"
			class="icon-btn inline-flex shrink-0 items-center justify-center rounded-full p-1.5
				text-muted transition-colors hover:bg-surface-2 hover:text-ink"
		>
			<X class="size-5" aria-hidden="true" />
		</button>
	</div>

	<!-- Scrollable body. Bottom padding clears the home indicator on mobile. -->
	<div
		bind:this={scrollEl}
		onscroll={() => reader.setScroll(scrollEl?.scrollTop ?? 0)}
		class="flex-1 overflow-y-auto px-4 pt-6 sm:px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
	>
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
				<a href={wikiUrl} target="_blank" rel="noopener noreferrer" class="text-accent hover:underline"
					>Open on Wikipedia instead ↗</a
				>
			</p>
		{:else if articleHtml}
			<!-- Sanitized server-side (scripts/handlers stripped); see wikipedia/article.ts -->
			<div bind:this={contentEl} class="wiki-content">{@html articleHtml}</div>
			<div class="mt-6 border-t border-hair pt-4">
				<a
					href={wikiUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center py-1 text-xs font-medium text-faint transition-colors hover:text-ink"
					>Open on Wikipedia ↗</a
				>
			</div>
		{/if}
	</div>
</aside>
