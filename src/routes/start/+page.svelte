<script lang="ts">
	import { goto } from '$app/navigation';
	import type { SearchResult } from '$lib/wikipedia/types';
	import type { PageProps } from './$types';
	import { randomSeed } from '$lib/seeds';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import RelationIcon from '$lib/components/RelationIcon.svelte';
	import { Search } from '@lucide/svelte';

	// `data.today` is a streamed promise: the shell paints immediately and the shelves
	// fill in when Wikipedia's Main Page picks arrive (server-cached per UTC day).
	let { data }: PageProps = $props();

	let query = $state('');
	let results = $state<SearchResult[]>([]);
	let loading = $state(false);
	let highlighted = $state(-1);

	// The listbox popup is shown (and the combobox is "expanded") whenever there's
	// a usable query — including the loading and no-match states, not just hits.
	const showResults = $derived(query.trim().length >= 2);

	// Cards and chips render as real links to this URL (middle-click, hover preload);
	// enter() covers the imperative paths — search submit and "Surprise me".
	function seedHref(title: string): string {
		return `/?seed=${encodeURIComponent(title)}`;
	}

	function enter(title: string) {
		goto(seedHref(title));
	}

	// "Surprise me" favors today's fresh Main Page picks when they've loaded, so the day's
	// interesting stuff pops up at the start of a tangent — falling back to the evergreen
	// curated seeds otherwise (and some of the time regardless, to keep old favorites in play).
	async function surprise() {
		const today = await data.today;
		const todayTitles = today.sections.flatMap((s) => s.picks.map((p) => p.title));
		if (todayTitles.length > 0 && Math.random() < 0.6) {
			enter(todayTitles[Math.floor(Math.random() * todayTitles.length)]);
		} else {
			enter(randomSeed().title);
		}
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
		<Search
			class="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-faint"
			aria-hidden="true"
		/>
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

	{#await data.today}
		<section class="mt-14 w-full text-left" aria-hidden="true">
			<p class="text-xs font-medium tracking-widest text-faint uppercase">Today on Wikipedia</p>
			<p class="mt-1 text-sm text-muted">Fresh from the front page — updated every day.</p>

			<div class="mt-6 flex flex-col gap-8">
				{#each ['first', 'second'] as row (row)}
					<div>
						<div class="mb-3 h-4 w-28 animate-pulse rounded bg-surface-2"></div>
						<div class="no-scrollbar shelf-fade -mx-1 flex gap-3 overflow-x-hidden px-1 pb-2">
							{#each { length: 6 }, i (i)}
								<div class="h-48 w-44 shrink-0 animate-pulse rounded-2xl bg-surface-2"></div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</section>
	{:then today}
		{#if today.sections.length > 0}
			<section class="mt-14 w-full text-left">
				<p class="text-xs font-medium tracking-widest text-faint uppercase">Today on Wikipedia</p>
				<p class="mt-1 text-sm text-muted">Fresh from the front page — updated every day.</p>

				<div class="mt-6 flex flex-col gap-8">
					{#each today.sections as section (section.id)}
						<div>
							<h2 class="mb-3 text-sm font-semibold text-ink">{section.label}</h2>
							{#if section.id === 'featured'}
								<!-- Single pick, so it gets a full-width hero card instead of a
								     one-card shelf. Stays mid-list — fetchToday deliberately keeps
								     the often-topical featured article out of the lead slot. -->
								{@const pick = section.picks[0]}
								<a
									href={seedHref(pick.title)}
									class="flex flex-col overflow-hidden rounded-2xl border border-hair
										bg-surface/60 text-left transition-all hover:border-accent/50
										active:scale-[0.99] sm:flex-row"
								>
									{#if pick.thumbnail}
										<img
											src={pick.thumbnail.source}
											alt=""
											loading="lazy"
											class="h-44 w-full object-cover sm:h-auto sm:w-52 sm:shrink-0"
										/>
									{/if}
									<div class="flex min-w-0 flex-col gap-1.5 p-5">
										<span class="font-display text-lg font-semibold text-ink">{pick.title}</span>
										{#if pick.description}
											<span class="text-xs text-faint">{pick.description}</span>
										{/if}
										{#if pick.hook}
											<p class="mt-1 line-clamp-3 text-sm leading-relaxed text-muted">
												{pick.hook}
											</p>
										{/if}
									</div>
								</a>
							{:else}
								<!-- Horizontal shelf: clips + scrolls within the reading column so a long
								     row never widens the page. -->
								<div class="no-scrollbar shelf-fade -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
									{#each section.picks as pick (pick.title)}
										<a
											href={seedHref(pick.title)}
											class="flex w-44 shrink-0 snap-start flex-col overflow-hidden rounded-2xl
												border border-hair bg-surface/60 text-left transition-all
												hover:border-accent/50 active:scale-[0.98]"
										>
											{#if pick.thumbnail}
												<img
													src={pick.thumbnail.source}
													alt=""
													loading="lazy"
													class="h-24 w-full object-cover"
												/>
											{:else}
												<div
													class="flex h-24 w-full items-center justify-center bg-surface-2 text-2xl
														text-faint"
												>
													{pick.title.slice(0, 1)}
												</div>
											{/if}
											<div class="flex min-w-0 flex-1 flex-col gap-1 p-3">
												{#if pick.year}
													<span class="text-[11px] font-semibold tracking-wide text-accent"
														>{pick.year}</span
													>
												{/if}
												<span class="line-clamp-2 text-sm font-medium text-ink">{pick.title}</span>
												{#if pick.hook}
													<span class="line-clamp-2 text-xs leading-snug text-faint"
														>{pick.hook}</span
													>
												{:else if pick.description}
													<span class="line-clamp-2 text-xs leading-snug text-faint"
														>{pick.description}</span
													>
												{/if}
											</div>
										</a>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</section>
		{/if}
	{/await}

	<div class="mt-12 w-full">
		<p class="mb-4 text-xs font-medium tracking-widest text-faint uppercase">Or dive into</p>
		<div class="flex flex-wrap justify-center gap-2">
			{#each data.seeds as seed (seed.title)}
				<a
					href={seedHref(seed.title)}
					class="rounded-full border border-hair bg-surface/60 px-3 py-1.5 text-sm
						text-muted transition-all hover:border-accent/50 hover:text-ink active:scale-95"
				>
					{seed.title}
				</a>
			{/each}
		</div>
	</div>
</div>
