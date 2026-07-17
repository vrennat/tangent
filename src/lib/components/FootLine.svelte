<script lang="ts">
	// A running foot: one quiet line between cards, UJBR page-bottom style — a
	// fact your eye can wander to without the feed asking anything of you.
	// Tapping pulls the thread (a dive), which re-roots the feed there.
	let {
		title,
		description,
		onPull
	}: {
		title: string;
		description: string | null;
		onPull: () => void;
	} = $props();
</script>

<button
	type="button"
	onclick={onPull}
	title="Pull this thread"
	class="block w-full px-6 py-0.5 text-center font-display text-[13px] leading-snug text-faint
		italic transition-colors hover:text-accent"
>
	{title}{description ? ` — ${description}` : ''}
</button>
