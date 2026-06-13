<script lang="ts">
	import type { TrailNode } from '$lib/feed/types';
	import Drawer from './Drawer.svelte';
	import RelationIcon from './RelationIcon.svelte';

	let {
		trail,
		presentIds,
		onClose,
		onSelect
	}: {
		trail: TrailNode[];
		/** Card ids actually in the feed — trail nodes outside this set aren't navigable. */
		presentIds: Set<string>;
		onClose: () => void;
		onSelect: (id: string) => void;
	} = $props();
</script>

<Drawer title="Your trail" badge={trail.length} closeLabel="Close trail" {onClose}>
	{#snippet children(close)}
		<div class="py-2">
			{#each trail as node (node.id)}
				<!-- Nodes dropped during rehydration have no card to scroll to — shown but inert. -->
				<button
					type="button"
					disabled={!presentIds.has(node.id)}
					onclick={() => {
						onSelect(node.id);
						close();
					}}
					class="flex w-full items-start gap-2 px-4 py-2.5 text-left
						transition-colors hover:bg-surface-2
						disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent
						{node.isDetour ? 'ml-4 border-l-2 border-dashed border-hair pl-3 opacity-60' : ''}"
				>
					<!-- Relation icon (shared geometric set) -->
					<span
						class="mt-0.5 shrink-0 {node.relation === 'surprise'
							? 'text-spark'
							: node.relation === 'seed'
								? 'text-accent'
								: node.relation === 'dive'
									? 'text-accent'
									: 'text-muted'}"
					>
						<RelationIcon relation={node.relation} />
					</span>

					<span class="min-w-0 flex-1 truncate text-sm text-ink">{node.title}</span>
				</button>
			{/each}
		</div>
	{/snippet}
</Drawer>
