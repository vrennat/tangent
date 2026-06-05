<script lang="ts">
	// Pulsing placeholder shown while the next card is being assembled.
</script>

<div
	class="overflow-hidden rounded-[var(--radius-card)] border border-hair bg-surface/60"
	aria-hidden="true"
>
	<div class="aspect-video w-full animate-pulse bg-surface-2"></div>
	<div class="space-y-3 p-5">
		<div class="h-3 w-32 animate-pulse rounded-full bg-surface-2"></div>
		<div class="h-6 w-3/4 animate-pulse rounded-lg bg-surface-2"></div>
		<div class="space-y-2 pt-1">
			<div class="h-3 w-full animate-pulse rounded-full bg-surface-2"></div>
			<div class="h-3 w-full animate-pulse rounded-full bg-surface-2"></div>
			<div class="h-3 w-2/3 animate-pulse rounded-full bg-surface-2"></div>
		</div>
	</div>
</div>
