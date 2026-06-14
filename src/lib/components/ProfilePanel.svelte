<script lang="ts">
	import { profile } from '$lib/engagement/profile.svelte';
	import { feed } from '$lib/feed/feedState.svelte';
	import { dfWeight } from '$lib/feed/score';
	import type { TasteId } from '$lib/feed/taste';
	import { TASTE_OPTIONS } from '$lib/feed/taste';
	import { Atom, Cpu, Landmark, Leaf, Palette, Shuffle, Sparkles } from '@lucide/svelte';
	import Drawer from './Drawer.svelte';
	import AccountSection from './AccountSection.svelte';
	import ThemePicker from './ThemePicker.svelte';

	let { onClose }: { onClose: () => void } = $props();

	const tasteIcons = {
		balanced: Shuffle,
		technology: Cpu,
		oddities: Sparkles,
		culture: Palette,
		science: Atom,
		history: Landmark,
		nature: Leaf
	} satisfies Record<TasteId, typeof Shuffle>;

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

	function setTaste(taste: TasteId): void {
		profile.setTaste(taste);
		feed.retune();
	}
</script>

<Drawer title="Your interests" closeLabel="Close interests" {onClose}>
	{#snippet children(close)}
		<div class="p-4">
			<p class="mb-3 text-xs font-medium tracking-wide text-faint uppercase">Appearance</p>
			<ThemePicker />

			<p class="mb-3 mt-5 text-xs font-medium tracking-wide text-faint uppercase">Tangent flavor</p>
			<div class="grid grid-cols-2 gap-2">
				{#each TASTE_OPTIONS as option}
					{@const Icon = tasteIcons[option.id]}
					<button
						type="button"
						onclick={() => setTaste(option.id)}
						aria-pressed={profile.taste === option.id}
						title={option.description}
						class="inline-flex min-h-9 min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left
							text-xs font-medium transition-colors
							{profile.taste === option.id
							? 'border-accent/60 bg-accent/10 text-accent'
							: 'border-hair text-muted hover:border-hair-strong hover:text-ink'}"
					>
						<Icon class="size-3.5 shrink-0" aria-hidden="true" />
						<span class="min-w-0 truncate">{option.label}</span>
					</button>
				{/each}
			</div>

			{#if hasWeights}
				<p class="mb-3 mt-5 text-xs font-medium tracking-wide text-faint uppercase">Top interests</p>
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
						feed.retune();
						close();
					}}
					class="mt-4 w-full rounded-full border border-hair py-1.5 text-xs font-medium
						text-muted transition-colors hover:border-hair-strong hover:text-ink"
				>
					Reset personalization
				</button>
			{:else}
				<p class="mt-5 text-sm text-faint">Like or read articles to tune your feed.</p>
			{/if}

			<!-- Account: sign in to sync the interest vector across devices. -->
			<div class="mt-4">
				<AccountSection />
			</div>

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
