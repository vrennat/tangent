<script lang="ts">
	import type { Relation } from '$lib/feed/types';

	// One geometric glyph per connection type, shared by the breadcrumb and the trail
	// panel so the set never drifts. The vocabulary is deliberately geometric — nodes,
	// edges, lines, points — echoing the tangent brand mark. Colour is inherited
	// (currentColor); callers set it via the surrounding text colour.
	let { relation, class: cls = 'size-3.5' }: { relation: Relation; class?: string } = $props();
</script>

{#if relation === 'seed'}
	<!-- start: a filled marker — the origin node you set out from -->
	<svg class={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
		<path d="M12 3l9 9-9 9-9-9z" />
	</svg>
{:else if relation === 'surprise'}
	<!-- tangent: a straight line touching a circle at a single point — the literal
	     geometry of the name, replacing the old wormhole rings -->
	<svg
		class={cls}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		aria-hidden="true"
	>
		<circle cx="10" cy="14" r="5.5" />
		<line x1="8" y1="5" x2="19" y2="14" />
		<circle cx="13.6" cy="9.6" r="1.5" fill="currentColor" stroke="none" />
	</svg>
{:else if relation === 'dive'}
	<!-- dive: a step straight down into the next article -->
	<svg
		class={cls}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="M12 4v12M7 12l5 5 5-5" />
	</svg>
{:else}
	<!-- link / related: an elbow — one step further down the hole -->
	<svg
		class={cls}
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
