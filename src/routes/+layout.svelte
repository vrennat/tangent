<script lang="ts">
	import '../app.css';
	import BrandMark from '$lib/components/BrandMark.svelte';

	let { children } = $props();
</script>

<div class="mx-auto flex min-h-dvh max-w-2xl flex-col px-4">
	<header
		class="sticky top-0 z-20 -mx-4 flex items-center justify-between border-b border-hair/60
			bg-void/70 px-4 py-3 backdrop-blur-md"
	>
		<a href="/" class="transition-opacity hover:opacity-80" aria-label="Wormhole home">
			<BrandMark />
		</a>
		<a
			href="/start"
			class="inline-flex items-center gap-1.5 rounded-full border border-hair px-3 py-1.5
				text-sm font-medium text-muted transition-colors hover:border-accent/50 hover:text-accent"
		>
			<svg
				class="size-4"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				aria-hidden="true"
			>
				<path d="M12 5v14M5 12h14" />
			</svg>
			New wormhole
		</a>
	</header>

	<main class="flex-1 py-6">
		{@render children()}
	</main>
</div>
