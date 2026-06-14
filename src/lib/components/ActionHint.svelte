<script lang="ts">
	import { Star, CirclePlus, X } from '@lucide/svelte';
	import { actionHint } from '$lib/feed/hint.svelte';

	// Consult localStorage only after mount, so the first client render matches the SSR
	// output (which renders nothing). See hint.svelte.ts for why visible starts false.
	$effect(() => {
		actionHint.reveal();
	});
</script>

{#if actionHint.visible}
	<!-- One-time orientation for the two feed actions, dismissed on first interaction. -->
	<div
		class="animate-rise relative rounded-[var(--radius-card)] border border-hair bg-surface/70 px-4 py-3
			pr-9 text-sm"
	>
		<button
			type="button"
			onclick={() => actionHint.dismiss()}
			aria-label="Dismiss tip"
			class="absolute right-1.5 top-1.5 rounded-full p-1.5 text-faint transition-colors
				hover:text-ink"
		>
			<X class="size-4" aria-hidden="true" />
		</button>

		<p class="mb-2 font-display font-medium text-ink">New here? Two ways to steer your tangent:</p>
		<ul class="space-y-1.5 text-muted">
			<li class="flex items-start gap-2">
				<Star class="mt-0.5 size-4 shrink-0 text-faint" aria-hidden="true" />
				<span><span class="font-medium text-ink">Like</span> leans your feed toward this topic — more of it later.</span>
			</li>
			<li class="flex items-start gap-2">
				<CirclePlus class="mt-0.5 size-4 shrink-0 text-faint" aria-hidden="true" />
				<span
					><span class="font-medium text-ink">More like this</span> branches off right now to a related
					article.</span
				>
			</li>
		</ul>
	</div>
{/if}
