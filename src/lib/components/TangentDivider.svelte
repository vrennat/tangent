<script lang="ts">
	// The page-turn moment: a section break above a tangent card, so the topic
	// jump reads as a new entry in the reader — curated, expected — rather than
	// the feed losing the plot. Shows the department name when the card files
	// under a recurring column, plain "Tangent" otherwise.
	let { department }: { department?: string } = $props();
</script>

<div role="separator" aria-label="New tangent{department ? `: ${department}` : ''}" class="flex items-center gap-3 px-1 pt-3">
	<div class="h-px flex-1 bg-hair"></div>
	<span class="text-xs font-semibold tracking-[0.22em] text-spark uppercase">
		{department ?? 'Tangent'}
	</span>
	<div class="h-px flex-1 bg-hair"></div>
</div>
