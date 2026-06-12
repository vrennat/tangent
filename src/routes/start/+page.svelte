<script lang="ts">
	import { goto } from '$app/navigation';
	import type { SearchResult } from '$lib/wikipedia/types';
	import { SEEDS, randomSeed } from '$lib/seeds';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import RelationIcon from '$lib/components/RelationIcon.svelte';

	let query = $state('');
	let results = $state<SearchResult[]>([]);
	let loading = $state(false);
	let highlighted = $state(-1);

	// The listbox popup is shown (and the combobox is "expanded") whenever there's
	// a usable query — including the loading and no-match states, not just hits.
	const showResults = $derived(query.trim().length >= 2);

	function enter(title: string) {
		goto(`/?seed=${encodeURIComponent(title)}`);
	}

	function surprise() {
		enter(randomSeed().title);
	}

	function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		const top = highlighted >= 0 ? results[highlighted]?.title : results[0]?.title ?? query.trim();
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

	// Reset highlighted when results change.
	$effect(() => {
		results;
		highlighted = -1;
	});
</script>

<svelte:head>
	<title>Start a rabbit hole · Tangent</title>
</svelte:head>

<div class="flex flex-col items-center pt-8 pb-16 text-center">
	<div class="mb-3 text-2xl"><BrandMark size={42} /></div>
	<h1 class="mt-6 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
		Fall down a rabbit hole
	</h1>
	<p class="mt-3 max-w-md text-[15px] leading-relaxed text-muted">
		Pick a starting point. Tangent follows the links from one Wikipedia article to the next —
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
			aria-label="Search topics"
			autocomplete="off"
			role="combobox"
			aria-autocomplete="list"
			aria-expanded={showResults}
			aria-controls={showResults ? 'search-listbox' : undefined}
			aria-activedescendant={highlighted >= 0 ? `start-result-${highlighted}` : undefined}
			onkeydown={(e) => {
				if (e.key === 'ArrowDown') {
					e.preventDefault();
					highlighted = Math.min(highlighted + 1, results.length - 1);
				} else if (e.key === 'ArrowUp') {
					e.preventDefault();
					highlighted = Math.max(highlighted - 1, -1);
				} else if (e.key === 'Escape') {
					highlighted = -1;
				}
			}}
			class="w-full rounded-2xl border border-hair bg-surface/80 py-3.5 pr-4 pl-11 text-ink
				placeholder:text-faint focus:border-accent/60 focus:ring-2 focus:ring-accent
				focus:ring-offset-2 focus:ring-offset-void focus:outline-none"
		/>

		{#if showResults}
			<ul
				id="search-listbox"
				role="listbox"
				class="absolute z-10 mt-2 w-full overflow-hidden rounded-2xl border border-hair
					bg-surface text-left shadow-card"
			>
				{#if loading && results.length === 0}
					<li class="px-4 py-3 text-sm text-faint">Searching…</li>
				{:else if results.length === 0}
					<li class="px-4 py-3 text-sm text-faint">No matches. Press Enter to try anyway.</li>
				{:else}
					{#each results as result, index (result.title)}
						<li role="option" aria-selected={highlighted === index}>
							<button
								type="button"
								id="start-result-{index}"
								onclick={() => enter(result.title)}
								class="flex w-full items-center gap-3 px-4 py-2.5 text-left
									transition-colors hover:bg-surface-2 {highlighted === index ? 'bg-surface-2' : ''}"
							>
								{#if result.thumbnail}
									<img
										src={result.thumbnail.source}
										alt=""
										loading="lazy"
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
		class="mt-5 inline-flex items-center gap-2 rounded-full border border-spark/30 bg-spark/5
			px-4 py-2 text-sm font-medium text-spark transition-all hover:bg-spark/10 active:scale-95"
	>
		<RelationIcon relation="surprise" class="size-4" />
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
