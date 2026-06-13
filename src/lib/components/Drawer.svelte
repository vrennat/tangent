<script lang="ts">
	import type { Snippet } from 'svelte';
	import { X } from '@lucide/svelte';

	let {
		title,
		badge,
		closeLabel,
		onClose,
		children
	}: {
		title: string;
		/** Optional count chip rendered next to the title. */
		badge?: string | number;
		closeLabel: string;
		onClose: () => void;
		/** Panel content; receives a close() that restores focus to the trigger. */
		children: Snippet<[() => void]>;
	} = $props();

	let dialogEl = $state<HTMLDialogElement | null>(null);

	$effect(() => {
		dialogEl?.showModal();
	});

	// Close via dialog.close() rather than bare unmount — the native close path is
	// what returns focus to the triggering element for keyboard users.
	function dismiss() {
		dialogEl?.close();
		onClose();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
	bind:this={dialogEl}
	aria-label={title}
	oncancel={(e) => {
		e.preventDefault();
		dismiss();
	}}
	onclick={(e) => {
		// Close when clicking the backdrop (outside the panel content).
		if (e.target === dialogEl) dismiss();
	}}
	class="fixed inset-0 z-40 m-0 h-full max-h-none w-full max-w-none border-none
		bg-transparent p-0 backdrop:bg-black/60"
>
	<!-- Panel docks to the right edge of the viewport -->
	<div
		class="ml-auto flex h-full w-80 max-w-[85vw] flex-col border-l border-hair bg-surface"
		role="document"
	>
		<div class="flex items-center justify-between border-b border-hair px-4 py-3">
			<div class="flex items-center gap-2">
				<h2 class="font-display text-sm font-semibold text-ink">{title}</h2>
				{#if badge !== undefined}
					<span class="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-faint">{badge}</span>
				{/if}
			</div>
			<button
				type="button"
				onclick={dismiss}
				aria-label={closeLabel}
				class="icon-btn inline-flex items-center justify-center rounded-full p-1.5
					text-muted transition-colors hover:bg-surface-2 hover:text-ink"
			>
				<X class="size-4" aria-hidden="true" />
			</button>
		</div>

		<div class="flex-1 overflow-y-auto">
			{@render children(dismiss)}
		</div>
	</div>
</dialog>
