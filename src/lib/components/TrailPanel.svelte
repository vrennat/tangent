<script lang="ts">
	import type { TrailNode } from '$lib/feed/types';

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

	let dialogEl = $state<HTMLDialogElement | null>(null);

	$effect(() => {
		if (!dialogEl) return;
		dialogEl.showModal();
	});

	function dismiss() {
		dialogEl?.close();
		onClose();
	}

	function select(id: string) {
		onSelect(id);
		dismiss();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
	bind:this={dialogEl}
	oncancel={(e) => {
		e.preventDefault();
		dismiss();
	}}
	onclick={(e) => {
		// Close when clicking the backdrop (outside the panel content).
		if (e.target === dialogEl) dismiss();
	}}
	class="fixed inset-0 z-40 m-0 h-full w-full max-h-none max-w-none border-none
		bg-transparent p-0 backdrop:bg-black/60"
>
	<!-- Panel slides in from the right -->
	<div
		class="ml-auto flex h-full w-80 max-w-[85vw] flex-col border-l border-hair bg-surface"
		role="document"
	>
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-hair px-4 py-3">
			<div class="flex items-center gap-2">
				<h2 class="font-display text-sm font-semibold text-ink">Your trail</h2>
				<span class="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-faint"
					>{trail.length}</span
				>
			</div>
			<button
				type="button"
				onclick={dismiss}
				aria-label="Close trail"
				class="icon-btn inline-flex items-center justify-center rounded-full p-1.5
					text-muted transition-colors hover:bg-surface-2 hover:text-ink"
			>
				<svg
					class="size-4"
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

		<!-- Trail list -->
		<div class="flex-1 overflow-y-auto py-2">
			{#each trail as node (node.id)}
				<!-- Nodes dropped during rehydration have no card to scroll to — shown but inert. -->
				<button
					type="button"
					disabled={!presentIds.has(node.id)}
					onclick={() => select(node.id)}
					class="flex w-full items-start gap-2 px-4 py-2.5 text-left
						transition-colors hover:bg-surface-2
						disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent
						{node.isDetour ? 'ml-4 border-l-2 border-dashed border-hair pl-3 opacity-60' : ''}"
				>
					<!-- Relation icon -->
					<span class="mt-0.5 shrink-0 {node.relation === 'surprise' ? 'text-spark' : node.relation === 'seed' ? 'text-accent' : node.relation === 'dive' ? 'text-accent' : 'text-muted'}">
						{#if node.relation === 'seed'}
							<svg class="size-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
								<path d="M12 2l1.9 5.6L19.5 9l-5.6 1.9L12 16l-1.9-5.1L4.5 9l5.6-1.4L12 2z" />
							</svg>
						{:else if node.relation === 'surprise'}
							<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
								<ellipse cx="12" cy="12" rx="9" ry="9" opacity="0.4" />
								<ellipse cx="12" cy="12" rx="5" ry="5" opacity="0.7" />
								<circle cx="12" cy="12" r="1.5" fill="currentColor" />
							</svg>
						{:else if node.relation === 'dive'}
							<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
								<path d="M12 5v14M12 19l-4-4M12 19l4-4" />
							</svg>
						{:else}
							<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<path d="M4 4v8a4 4 0 0 0 4 4h12" />
								<path d="m16 12 4 4-4 4" />
							</svg>
						{/if}
					</span>

					<span class="min-w-0 flex-1 truncate text-sm text-ink">{node.title}</span>
				</button>
			{/each}
		</div>
	</div>
</dialog>
