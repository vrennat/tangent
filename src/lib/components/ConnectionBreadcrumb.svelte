<script lang="ts">
	import type { Connection } from '$lib/feed/types';

	let {
		connection,
		onNavigate
	}: {
		connection: Connection;
		/** Jump to the card this one came from. Absent when the source isn't in view. */
		onNavigate?: () => void;
	} = $props();

	const label = $derived(
		{
			seed: 'You started here',
			link: 'Linked from',
			related: 'Related to',
			surprise: 'Tangent from',
			dive: 'Dove in from'
		}[connection.relation]
	);

	const isSurprise = $derived(connection.relation === 'surprise');
	const isSeed = $derived(connection.relation === 'seed');
</script>

<div
	class="flex items-center gap-2 text-xs font-medium tracking-wide
		{isSurprise ? 'text-spark' : isSeed ? 'text-accent' : 'text-muted'}"
>
	{#if isSeed}
		<!-- sparkle -->
		<svg class="size-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M12 2l1.9 5.6L19.5 9l-5.6 1.9L12 16l-1.9-5.1L4.5 9l5.6-1.4L12 2z" />
		</svg>
	{:else if isSurprise}
		<!-- portal -->
		<svg
			class="size-3.5"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			aria-hidden="true"
		>
			<ellipse cx="12" cy="12" rx="9" ry="9" opacity="0.4" />
			<ellipse cx="12" cy="12" rx="5" ry="5" opacity="0.7" />
			<circle cx="12" cy="12" r="1.5" fill="currentColor" />
		</svg>
	{:else}
		<!-- corner-down-right (the rabbit hole step) -->
		<svg
			class="size-3.5"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M4 4v8a4 4 0 0 0 4 4h12" />
			<path d="m16 12 4 4-4 4" />
		</svg>
	{/if}

	<span class="uppercase">
		{label}{#if !isSeed}
			{#if onNavigate}
				<!-- `inline` keeps the coarse-pointer 44px min-height (app.css) from
				     inflating this in-line text button; it reads as a link, not a pill. -->
				<button
					type="button"
					onclick={onNavigate}
					title="Jump to {connection.fromTitle}"
					class="ml-1 inline font-semibold text-ink normal-case underline decoration-transparent
						underline-offset-2 transition-colors hover:text-accent hover:decoration-accent/60"
					>{connection.fromTitle}</button
				>
			{:else}
				<span class="ml-1 font-semibold text-ink normal-case">{connection.fromTitle}</span>
			{/if}
		{/if}
	</span>
</div>
