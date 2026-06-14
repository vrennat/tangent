<script lang="ts">
	import { fly } from 'svelte/transition';
	import type { Article } from '$lib/wikipedia/types';

	let { container }: { container: HTMLElement | null } = $props();

	// Desktop-only progressive enhancement. Wire nothing up unless there's a real
	// hover-capable pointer — on touch the peek is fully inert (no listeners, no markup).
	const canHover =
		typeof window !== 'undefined' &&
		window.matchMedia('(hover: hover) and (pointer: fine)').matches;

	// The slice of an Article a peek needs. Re-uses the same titles the dive keys on.
	type Peek = Pick<Article, 'title' | 'description' | 'extract' | 'thumbnail'>;

	const SHOW_DELAY = 320; // hover-intent: don't fire on a link merely passed over
	const CARD_WIDTH = 340;

	let peek = $state<Peek | null>(null);
	let pos = $state<{ left: number; top: number | null; bottom: number | null } | null>(null);

	// Resolved peeks, keyed by title (null = looked up, doesn't exist). Survives the
	// component's lifetime so re-hovering a link is instant.
	const seen = new Map<string, Peek | null>();
	let timer: ReturnType<typeof setTimeout> | null = null;
	let pendingTitle: string | null = null; // link we're scheduled/showing for
	let controller: AbortController | null = null;

	function reset(): void {
		if (timer) clearTimeout(timer);
		timer = null;
		pendingTitle = null;
		controller?.abort();
		controller = null;
		peek = null;
		pos = null;
	}

	function place(link: HTMLElement): void {
		const rect = link.getBoundingClientRect();
		const m = 8;
		const left = Math.max(m, Math.min(rect.left, window.innerWidth - CARD_WIDTH - m));
		// Prefer below; flip above when the link sits low and there's more room up top.
		const above = window.innerHeight - rect.bottom < 220 && rect.top > window.innerHeight - rect.bottom;
		pos = {
			left,
			top: above ? null : Math.round(rect.bottom + 6),
			bottom: above ? Math.round(window.innerHeight - rect.top + 6) : null
		};
	}

	async function show(link: HTMLElement, title: string): Promise<void> {
		if (seen.has(title)) {
			const cached = seen.get(title) ?? null;
			if (!cached) return; // known-missing: nothing to peek
			place(link);
			peek = cached;
			return;
		}
		controller?.abort();
		controller = new AbortController();
		try {
			const res = await fetch(`/api/summary?title=${encodeURIComponent(title)}`, {
				signal: controller.signal
			});
			const data: { article: Peek | null } = await res.json();
			seen.set(title, data.article);
			if (pendingTitle !== title) return; // moved off the link before it resolved
			if (!data.article) return;
			place(link);
			peek = data.article;
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			seen.set(title, null);
		}
	}

	function linkFrom(target: EventTarget | null): HTMLElement | null {
		return (target as HTMLElement | null)?.closest?.('a.wh-dive') ?? null;
	}

	function arm(link: HTMLElement): void {
		const title = link.dataset.seed;
		if (!title || title === pendingTitle) return;
		if (timer) clearTimeout(timer);
		peek = null; // drop any prior card while a new one is intended
		pendingTitle = title;
		timer = setTimeout(() => show(link, title), SHOW_DELAY);
	}

	function onOver(e: MouseEvent): void {
		const link = linkFrom(e.target);
		if (link) arm(link);
	}
	function onOut(e: MouseEvent): void {
		const link = linkFrom(e.target);
		if (!link) return;
		// Ignore moves that stay within the same link (between its child nodes).
		if (link.contains(e.relatedTarget as Node | null)) return;
		reset();
	}
	function onFocusIn(e: FocusEvent): void {
		const link = linkFrom(e.target);
		if (link) arm(link);
	}

	$effect(() => {
		const el = container;
		if (!canHover || !el) return;
		el.addEventListener('mouseover', onOver);
		el.addEventListener('mouseout', onOut);
		el.addEventListener('focusin', onFocusIn);
		el.addEventListener('focusout', reset);
		// Any scroll (the reader body is its own scroller) or resize invalidates the
		// anchored position — dismiss rather than chase it. Capture catches inner scrollers.
		window.addEventListener('scroll', reset, true);
		window.addEventListener('resize', reset);
		return () => {
			el.removeEventListener('mouseover', onOver);
			el.removeEventListener('mouseout', onOut);
			el.removeEventListener('focusin', onFocusIn);
			el.removeEventListener('focusout', reset);
			window.removeEventListener('scroll', reset, true);
			window.removeEventListener('resize', reset);
			reset(); // never leave a fixed card pinned after a close/dive/content-swap
		};
	});
</script>

{#if peek && pos}
	<div
		role="tooltip"
		transition:fly={{ y: 4, duration: 120 }}
		class="pointer-events-none fixed z-[45] w-[340px] overflow-hidden rounded-[var(--radius-card)]
			border border-hair bg-surface shadow-card"
		style="left:{pos.left}px;{pos.top != null ? `top:${pos.top}px` : `bottom:${pos.bottom}px`}"
	>
		<div class="flex gap-3 p-3.5">
			<div class="min-w-0 flex-1">
				<p class="font-display text-[0.95rem] leading-snug font-semibold text-ink">{peek.title}</p>
				{#if peek.description}
					<p class="mt-0.5 text-xs text-faint">{peek.description}</p>
				{/if}
				<p class="wh-peek-extract mt-1.5 text-[0.8rem] leading-relaxed text-muted">{peek.extract}</p>
			</div>
			{#if peek.thumbnail}
				<img
					src={peek.thumbnail.source}
					alt=""
					class="size-16 shrink-0 rounded-md object-cover"
				/>
			{/if}
		</div>
		<div class="border-t border-hair px-3.5 py-1.5 text-[0.7rem] font-medium text-faint">
			Click to dive in →
		</div>
	</div>
{/if}

<style>
	/* Clamp the intro to a glanceable peek — the full read is one click away. */
	.wh-peek-extract {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 5;
		line-clamp: 5;
		overflow: hidden;
	}
</style>
