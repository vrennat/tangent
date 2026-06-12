<script lang="ts">
	import { profile } from '$lib/engagement/profile.svelte';
	import { dfWeight } from '$lib/feed/score';

	let { onClose }: { onClose: () => void } = $props();

	// Top 8 tokens sorted by DF-discounted effective weight (mirrors what the engine uses).
	const topTokens = $derived(
		Object.entries(profile.tokenWeights)
			.map(([token, weight]) => {
				const df = profile.tokenDocFreq[token] ?? 0;
				const effective = dfWeight(weight, df);
				return { token, effective };
			})
			.sort((a, b) => b.effective - a.effective)
			.slice(0, 8)
	);

	const hasWeights = $derived(Object.keys(profile.tokenWeights).length > 0);

	function handleReset() {
		profile.reset();
		onClose();
	}

	// Close on Esc and click-outside.
	let el = $state<HTMLElement | null>(null);

	$effect(() => {
		function onKeydown(e: KeyboardEvent) {
			if (e.key === 'Escape') onClose();
		}
		function onPointerdown(e: PointerEvent) {
			if (el && !el.contains(e.target as Node)) onClose();
		}
		document.addEventListener('keydown', onKeydown);
		document.addEventListener('pointerdown', onPointerdown);
		return () => {
			document.removeEventListener('keydown', onKeydown);
			document.removeEventListener('pointerdown', onPointerdown);
		};
	});

	// Move focus into the popover on open and return it to the trigger on close, so
	// keyboard users aren't dropped back at the top of the document.
	$effect(() => {
		const trigger = document.activeElement as HTMLElement | null;
		el?.focus();
		return () => trigger?.focus?.();
	});
</script>

<div
	bind:this={el}
	class="absolute right-0 top-full z-50 mt-2 w-full rounded-[var(--radius-card)] border border-hair
		bg-surface shadow-card sm:w-72 focus:outline-none"
	role="dialog"
	aria-label="Your interests"
	tabindex="-1"
>
	<div class="p-4">
		{#if hasWeights}
			<p class="mb-3 text-xs font-medium tracking-wide text-faint uppercase">Top interests</p>
			<ul class="space-y-2">
				{#each topTokens as { token, effective }}
					<li class="flex items-center justify-between gap-2">
						<span class="min-w-0 truncate text-sm text-ink capitalize">{token}</span>
						<!-- Visual weight bar -->
						<div class="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-2">
							<div
								class="h-full rounded-full bg-accent"
								style="width: {Math.min(100, (effective / 3) * 100).toFixed(1)}%"
							></div>
						</div>
					</li>
				{/each}
			</ul>

			{#if profile.likedTitles.length > 0}
				<p class="mt-3 text-xs text-faint">
					{profile.likedTitles.length} liked article{profile.likedTitles.length === 1 ? '' : 's'}
				</p>
			{/if}

			<button
				type="button"
				onclick={handleReset}
				class="mt-4 w-full rounded-full border border-hair py-1.5 text-xs font-medium
					text-muted transition-colors hover:border-hair-strong hover:text-ink"
			>
				Reset personalization
			</button>
		{:else}
			<p class="text-sm text-faint">Like or read articles to tune your feed.</p>
		{/if}

		<!-- Reachable entry to the legal/about surface from the feed itself, since the
		     page footer sits below an infinite scroll. -->
		<div class="mt-4 flex items-center gap-4 border-t border-hair pt-3 text-xs text-faint">
			<a href="/about" onclick={onClose} class="transition-colors hover:text-muted">About</a>
			<a
				href="https://github.com/vrennat/tangent"
				target="_blank"
				rel="noopener noreferrer"
				class="transition-colors hover:text-muted">Source</a
			>
		</div>
	</div>
</div>
