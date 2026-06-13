<script lang="ts">
	import { profile } from '$lib/engagement/profile.svelte';
	import { dfWeight } from '$lib/feed/score';
	import Drawer from './Drawer.svelte';

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
</script>

<Drawer title="Your interests" closeLabel="Close interests" {onClose}>
	{#snippet children(close)}
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
					onclick={() => {
						profile.reset();
						close();
					}}
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
			<!-- -m/p pairs give these standalone links a 44px touch zone without growing the row. -->
			<div class="mt-4 flex items-center gap-4 border-t border-hair pt-3 text-xs text-faint">
				<a
					href="/about"
					onclick={() => close()}
					class="-mx-1.5 -my-3.5 px-1.5 py-3.5 transition-colors hover:text-muted">About</a
				>
				<a
					href="https://github.com/vrennat/tangent"
					target="_blank"
					rel="noopener noreferrer"
					class="-mx-1.5 -my-3.5 px-1.5 py-3.5 transition-colors hover:text-muted">Source</a
				>
			</div>
		</div>
	{/snippet}
</Drawer>
