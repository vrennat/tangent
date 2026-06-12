<script lang="ts">
	// Pulsing placeholder shown while the next card is being assembled.
	// Mirrors ArticleCard: breadcrumb, title + one-liner beside a small image inset,
	// then the full summary hook.
</script>

<div
	class="overflow-hidden rounded-[var(--radius-card)] border border-hair bg-surface/60"
	aria-hidden="true"
>
	<div class="space-y-3 p-5 sm:p-6">
		<div class="h-3 w-32 animate-pulse rounded-full bg-surface-2"></div>
		<div class="flex items-start gap-4">
			<div class="min-w-0 flex-1 space-y-2">
				<div class="h-6 w-3/4 animate-pulse rounded-lg bg-surface-2"></div>
				<div class="h-3 w-1/2 animate-pulse rounded-full bg-surface-2"></div>
			</div>
			<div class="size-20 shrink-0 animate-pulse rounded-xl bg-surface-2 sm:size-24"></div>
		</div>
		<div class="space-y-2 pt-1">
			<div class="h-3 w-full animate-pulse rounded-full bg-surface-2"></div>
			<div class="h-3 w-full animate-pulse rounded-full bg-surface-2"></div>
			<div class="h-3 w-full animate-pulse rounded-full bg-surface-2"></div>
			<div class="h-3 w-4/5 animate-pulse rounded-full bg-surface-2"></div>
		</div>
	</div>
</div>
