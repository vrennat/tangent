<script lang="ts">
	import { goto } from '$app/navigation';
	import type { SearchResult } from '$lib/wikipedia/types';
	import { SEEDS, randomSeed } from '$lib/seeds';
	import BrandMark from '$lib/components/BrandMark.svelte';

	let query = $state('');
	let results = $state<SearchResult[]>([]);
	let loading = $state(false);

	function enter(title: string) {
		goto(`/?seed=${encodeURIComponent(title)}`);
	}

	function surprise() {
		enter(randomSeed().title);
	}

	function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		const top = results[0]?.title ?? query.trim();
		if (top) enter(top);
	}

	// Debounced typeahead search.
	$effect(() => {
		const q = query.trim();
		if (q.length < 2) {
			results = [];
			loading = false;
			return;
		}
		let ignore = false;
		loading = true;
		const timer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
				const data = (await res.json()) as { results: SearchResult[] };
				if (!ignore) results = data.results ?? [];
			} catch {
				if (!ignore) results = [];
			} finally {
				if (!ignore) loading = false;
			}
		}, 220);
		return () => {
			ignore = true;
			clearTimeout(timer);
		};
	});
</script>

<svelte:head>
	<title>Start a rabbit hole · Wormhole</title>
</svelte:head>

<div class="flex flex-col items-center pt-8 pb-16 text-center">
	<div class="mb-3 scale-150"><BrandMark size={28} /></div>
	<h1 class="mt-6 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
		Fall down a rabbit hole
	</h1>
	<p class="mt-3 max-w-md text-[15px] leading-relaxed text-muted">
		Pick a starting point. Wormhole follows the links from one Wikipedia article to the next —
		and shows you exactly how you got there.
	</p>

	<form onsubmit={onSubmit} class="relative mt-8 w-full max-w-md">
		<svg
			class="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-faint"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			aria-hidden="true"
		>
			<circle cx="11" cy="11" r="7" />
			<path d="m21 21-4.3-4.3" />
		</svg>
		<input
			type="search"
			bind:value={query}
			placeholder="Search any topic…"
			autocomplete="off"
			class="w-full rounded-2xl border border-hair bg-surface/80 py-3.5 pr-4 pl-11 text-ink
				placeholder:text-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/20
				focus:outline-none"
		/>

		{#if query.trim().length >= 2}
			<ul
				class="absolute z-10 mt-2 w-full overflow-hidden rounded-2xl border border-hair
					bg-surface text-left shadow-2xl shadow-black/40"
			>
				{#if loading && results.length === 0}
					<li class="px-4 py-3 text-sm text-faint">Searching…</li>
				{:else if results.length === 0}
					<li class="px-4 py-3 text-sm text-faint">No matches. Press Enter to try anyway.</li>
				{:else}
					{#each results as result (result.title)}
						<li>
							<button
								type="button"
								onclick={() => enter(result.title)}
								class="flex w-full items-center gap-3 px-4 py-2.5 text-left
									transition-colors hover:bg-surface-2"
							>
								{#if result.thumbnail}
									<img
										src={result.thumbnail.source}
										alt=""
										class="size-9 shrink-0 rounded-lg object-cover"
									/>
								{:else}
									<span
										class="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2
											text-xs text-faint">{result.title.slice(0, 1)}</span
									>
								{/if}
								<span class="min-w-0">
									<span class="block truncate text-sm font-medium text-ink">{result.title}</span>
									{#if result.description}
										<span class="block truncate text-xs text-faint">{result.description}</span>
									{/if}
								</span>
							</button>
						</li>
					{/each}
				{/if}
			</ul>
		{/if}
	</form>

	<button
		type="button"
		onclick={surprise}
		class="mt-5 inline-flex items-center gap-2 rounded-full border border-cyan/30 bg-cyan/5
			px-4 py-2 text-sm font-medium text-cyan transition-all hover:bg-cyan/10 active:scale-95"
	>
		<svg class="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M12 2l1.9 5.6L19.5 9l-5.6 1.9L12 16l-1.9-5.1L4.5 9l5.6-1.4L12 2z" />
		</svg>
		Surprise me
	</button>

	<div class="mt-12 w-full">
		<p class="mb-4 text-xs font-medium tracking-widest text-faint uppercase">Or dive into</p>
		<div class="flex flex-wrap justify-center gap-2">
			{#each SEEDS as seed (seed.title)}
				<button
					type="button"
					onclick={() => enter(seed.title)}
					class="inline-flex items-center gap-1.5 rounded-full border border-hair
						bg-surface/60 px-3 py-1.5 text-sm text-muted transition-all
						hover:border-accent/50 hover:text-ink active:scale-95"
				>
					<span aria-hidden="true">{seed.emoji}</span>
					{seed.title}
				</button>
			{/each}
		</div>
	</div>
</div>
