<script lang="ts">
	// Static content page — what Tangent is, plus the licensing, privacy, and terms
	// notices a launch needs. Links open in a new tab so a reader doesn't lose their place.
	const linkClass =
		'text-ink underline decoration-accent/40 underline-offset-2 transition-colors hover:decoration-accent';
</script>

<svelte:head>
	<title>About · Tangent</title>
	<meta
		name="description"
		content="What Tangent is, where its content comes from, and how it handles your privacy."
	/>
</svelte:head>

<article class="mx-auto max-w-2xl space-y-10 py-4 font-display">
	<header class="space-y-3">
		<h1 class="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">About Tangent</h1>
		<p class="text-lg leading-relaxed text-muted">
			Tangent turns Wikipedia into something you fall through. Pick a starting article and it
			follows the links outward — surfacing connected topics and showing, at every step, exactly
			how you got from one to the next.
		</p>
		<p class="leading-relaxed text-muted">
			It's a reading toy, not a destination: no feed to clear, no streak to keep. Wander until
			something catches, then tangent off it.
		</p>
	</header>

	<section class="space-y-3">
		<h2 class="text-sm font-semibold tracking-widest text-faint uppercase">
			Where the writing comes from
		</h2>
		<p class="leading-relaxed text-muted">
			Every article, summary, and image is drawn live from Wikipedia. Article text is published
			under the
			<a
				href="https://creativecommons.org/licenses/by-sa/4.0/"
				target="_blank"
				rel="noopener noreferrer"
				class={linkClass}>Creative Commons Attribution-ShareAlike 4.0 license</a
			>
			(CC BY-SA 4.0). Tangent shows excerpts and reformats them for reading, and every card links back
			to its source article on
			<a
				href="https://en.wikipedia.org"
				target="_blank"
				rel="noopener noreferrer"
				class={linkClass}>Wikipedia</a
			>, where you'll find the full text and the list of authors. Images come from
			<a
				href="https://commons.wikimedia.org"
				target="_blank"
				rel="noopener noreferrer"
				class={linkClass}>Wikimedia Commons</a
			> under their own individual licenses — open any image on Wikipedia for its specific terms.
		</p>
		<p class="leading-relaxed text-muted">
			Tangent is an independent project. It is not affiliated with, endorsed by, or sponsored by
			the Wikimedia Foundation or Wikipedia.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-sm font-semibold tracking-widest text-faint uppercase">Your privacy</h2>
		<p class="leading-relaxed text-muted">
			There are no accounts, no analytics, no tracking, and no advertising cookies. Tangent doesn't
			build a profile of you on a server — the interests that tune your feed and the trail you
			leave both live only in your browser's local storage, and you can wipe them anytime from the
			interests panel or by clearing the site's data.
		</p>
		<p class="leading-relaxed text-muted">
			To fetch articles, your searches and the topics you open are sent to Tangent's server (hosted
			on Cloudflare), which relays them to Wikipedia. Those requests aren't stored or tied to you,
			though standard network logs may be processed by the host to serve and protect the site.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-sm font-semibold tracking-widest text-faint uppercase">The fine print</h2>
		<p class="leading-relaxed text-muted">
			Tangent is free and provided as-is, with no warranty of any kind. Article content reflects
			Wikipedia at the moment you load it; its accuracy, completeness, and tone are Wikipedia's, not
			ours. Use it at your own discretion, and the project may change or go offline at any time.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-sm font-semibold tracking-widest text-faint uppercase">Open source</h2>
		<p class="leading-relaxed text-muted">
			Tangent is open source under the MIT license. Read the code, file an issue, or fork it on
			<a
				href="https://github.com/vrennat/tangent"
				target="_blank"
				rel="noopener noreferrer"
				class={linkClass}>GitHub</a
			>.
		</p>
	</section>

	<footer class="border-t border-hair pt-6">
		<a
			href="/"
			class="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-accent"
		>
			<svg
				class="size-4"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M19 12H5M11 6l-6 6 6 6" />
			</svg>
			Back to your tangent
		</a>
	</footer>
</article>
