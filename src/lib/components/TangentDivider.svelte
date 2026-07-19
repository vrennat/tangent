<script lang="ts">
	import type { TangentDirection } from '$lib/feed/directions';

	// The page-turn moment: a section break above a tangent card, so the topic
	// jump reads as a new entry in the reader — curated, expected — rather than
	// the feed losing the plot. A directional tangent names WHY the jump followed
	// (Ben's "meanwhile, elsewhere" framing) and wins the slot over a department
	// (WHAT the card is); plain "Tangent" is the wild-card fallback.
	let { department, direction }: { department?: string; direction?: TangentDirection } = $props();

	const DIRECTION_COPY: Record<TangentDirection, string> = {
		era: 'Meanwhile, elsewhere',
		place: 'Same place, another time',
		theme: 'Pulling the thread'
	};

	const label = $derived((direction && DIRECTION_COPY[direction]) ?? department ?? 'Tangent');
</script>

<div
	role="separator"
	aria-label={label === 'Tangent' ? 'New tangent' : `New tangent: ${label}`}
	class="flex items-center gap-3 px-1 pt-3"
>
	<div class="h-px flex-1 bg-hair"></div>
	<span class="text-xs font-semibold tracking-[0.22em] text-spark uppercase">
		{label}
	</span>
	<div class="h-px flex-1 bg-hair"></div>
</div>
