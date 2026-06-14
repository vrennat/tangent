<script lang="ts">
	import { tick } from 'svelte';
	import { reader } from '$lib/reader/readerState.svelte';
	import { articleTitleFromHref } from '$lib/wikipedia/links';
	import LinkPreview from './LinkPreview.svelte';
	import { X } from '@lucide/svelte';

	let {
		onDive
	}: {
		/** Dive into an in-article link: closes the reader and drops it as a fresh feed card. */
		onDive: (title: string) => void;
	} = $props();

	let asideEl = $state<HTMLElement | null>(null);
	let contentEl = $state<HTMLElement | null>(null);
	let articleHtml = $state<string | null>(null);
	let htmlLoading = $state(false);
	let htmlError = $state(false);
	// Full-screen image view. Tapping a content image (figure/thumbnail/infobox) opens
	// this; null when closed.
	let lightbox = $state<{ src: string; caption: string; alt: string } | null>(null);
	let closeImageEl = $state<HTMLElement | null>(null);

	const current = $derived(reader.current);
	const wikiUrl = $derived(
		current ? `https://en.wikipedia.org/wiki/${encodeURIComponent(current.replace(/ /g, '_'))}` : ''
	);

	// Fetch the shown article's HTML whenever the title changes (open, or a dive replacing
	// it). The reader holds one article at a time, so there's no per-level cache to
	// consult — a fresh open always loads fresh.
	$effect(() => {
		const title = reader.current;
		if (!title) return;

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

	// Real content imagery — figures, thumbnails, the infobox lead — opens the lightbox;
	// inline icons, flags, and math glyphs (small, unframed) do not.
	function isLightboxable(img: HTMLImageElement): boolean {
		if (img.closest('figure, .thumb, .thumbinner, .quick-facts')) return true;
		return img.clientWidth >= 100 && img.clientHeight >= 100;
	}

	// Prefer the largest srcset candidate (typically 2x) over the original — Commons
	// originals can be tens of MB, and the 2x thumb is plenty for a full-screen view.
	function bestImageSrc(img: HTMLImageElement): string {
		const srcset = img.getAttribute('srcset');
		if (srcset) {
			let bestUrl = '';
			let bestScale = 0;
			for (const part of srcset.split(',')) {
				const [url, descriptor] = part.trim().split(/\s+/);
				const scale = descriptor ? parseFloat(descriptor) : 1;
				if (url && scale >= bestScale) {
					bestScale = scale;
					bestUrl = url;
				}
			}
			if (bestUrl) return bestUrl;
		}
		return img.currentSrc || img.src;
	}

	function openLightbox(img: HTMLImageElement): void {
		const figure = img.closest('figure, .thumb');
		const caption = figure?.querySelector('figcaption, .thumbcaption')?.textContent?.trim() ?? '';
		lightbox = { src: bestImageSrc(img), caption, alt: img.getAttribute('alt') || caption || 'Article image' };
	}

	// Click handling lives on the (stable) content container and classifies each target
	// on click — so it keeps working across content swaps and cached renders, independent
	// of the cosmetic rewrite below (which can lag a render).
	//   - Content image → open full-screen (not its Commons file page).
	//   - Wikipedia article link → dive in-app (left-click) or new-tab tangent (cmd/ctrl).
	//   - In-page anchor (#section) → default scroll.
	//   - Anything else (citations, File:/Category:, off-wiki) → open in a new tab.
	$effect(() => {
		const el = contentEl;
		if (!el) return;

		const onClick = (event: MouseEvent) => {
			if (event.defaultPrevented || event.button !== 0) return;

			const img = (event.target as HTMLElement | null)?.closest?.('img');
			if (img instanceof HTMLImageElement && isLightboxable(img)) {
				event.preventDefault();
				openLightbox(img);
				return;
			}

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
					onDive(title);
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

			// Give the lead a standfirst lift. The real lead is the first substantial
			// paragraph (Parsoid buries it after shortdescription + hatnotes), so pick by
			// text length rather than position; skip infobox/hatnote/figure paragraphs.
			const lead = [...contentEl.querySelectorAll('p')].find(
				(p) =>
					!p.closest('.quick-facts, .hatnote, table, figure') &&
					(p.textContent?.trim().length ?? 0) > 140
			);
			lead?.classList.add('wh-lead');
		});
	});

	// On mobile the reader is a full-screen takeover, so move focus into it on open and
	// restore it to the trigger on close — otherwise keyboard/SR users are left behind
	// it. preventScroll on the restore: diving closes the reader and scrolls the feed to
	// the new card (goToCard), and a plain focus() would yank the viewport back to the
	// trigger near the top, fighting that scroll. On desktop (lg+) it's a non-modal
	// in-flow pane beside the feed, so focus stays.
	$effect(() => {
		if (!asideEl) return;
		if (window.matchMedia('(min-width: 1024px)').matches) return;
		const trigger = document.activeElement as HTMLElement | null;
		asideEl.focus({ preventScroll: true });
		return () => trigger?.focus?.({ preventScroll: true });
	});

	// The lightbox is a real modal (aria-modal): move focus to its close control on open
	// so Escape/Enter and screen readers land inside it, and restore focus to whatever the
	// reader had on close. preventScroll keeps the restore from jumping the article.
	$effect(() => {
		if (!lightbox) return;
		const trigger = document.activeElement as HTMLElement | null;
		closeImageEl?.focus({ preventScroll: true });
		return () => trigger?.focus?.({ preventScroll: true });
	});
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key !== 'Escape') return;
		// Escape closes the image view first (if open), then the reader itself.
		if (lightbox) lightbox = null;
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
		<h2 class="font-display flex-1 text-xl leading-snug font-semibold tracking-tight text-ink">
			{current}
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

<!-- Desktop-only hover/focus peek for in-article links. Reads contentEl directly and
     is inert on touch; renders its own position:fixed card, so it lives outside the aside. -->
<LinkPreview container={contentEl} />

{#if lightbox}
	<!-- Full-screen image view above the reader. The backdrop and image are tap-to-dismiss
	     (the image is pointer-transparent so a tap "through" it still hits the backdrop);
	     Escape and the close control also dismiss. -->
	<div
		class="animate-fade fixed inset-0 z-50 flex flex-col items-center justify-center bg-void/85
			backdrop-blur-md px-4 pt-[calc(1rem+env(safe-area-inset-top))]
			pb-[calc(1rem+env(safe-area-inset-bottom))]"
		role="dialog"
		aria-modal="true"
		aria-label="Image viewer"
	>
		<button
			type="button"
			class="absolute inset-0 cursor-zoom-out"
			aria-label="Close image"
			onclick={() => (lightbox = null)}
		></button>
		<button
			bind:this={closeImageEl}
			type="button"
			onclick={() => (lightbox = null)}
			aria-label="Close image"
			class="icon-btn absolute right-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-10 inline-flex
				items-center justify-center rounded-full bg-surface/80 p-2 text-ink backdrop-blur
				transition-colors hover:bg-surface-2"
		>
			<X class="size-5" aria-hidden="true" />
		</button>
		<img
			src={lightbox.src}
			alt={lightbox.alt}
			class="pointer-events-none relative max-h-full max-w-full rounded-lg object-contain shadow-card"
		/>
		{#if lightbox.caption}
			<p class="pointer-events-none relative mt-3 max-w-prose text-center text-sm text-faint">
				{lightbox.caption}
			</p>
		{/if}
	</div>
{/if}
