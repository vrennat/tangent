<script lang="ts">
	import type { Connection } from '$lib/feed/types';
	import RelationIcon from './RelationIcon.svelte';

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
	<RelationIcon relation={connection.relation} />

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
