<script lang="ts">
	import { ArrowLeft } from '@lucide/svelte';

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
		<h2 class="text-sm font-semibold tracking-widest text-faint uppercase">Accounts &amp; privacy</h2>
		<p class="leading-relaxed text-muted">
			Tangent works fully without an account — the interests that tune your feed and the trail you
			leave live in your browser by default, and you can wipe them anytime from the interests panel.
			There are no ads and no tracking cookies; any usage Tangent measures is anonymous and
			aggregate, never tied to you.
		</p>
		<p class="leading-relaxed text-muted">
			Signing in is optional. If you do — with an email link, a one-time code, or a passkey — Tangent
			stores your email, a synced copy of that interests list, and any passkeys you add, so your feed
			can follow you across devices. Deleting your account erases all of it. The specifics are in the
			<a href="/terms" class={linkClass}>Terms &amp; Privacy</a>.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-sm font-semibold tracking-widest text-faint uppercase">The fine print</h2>
		<p class="leading-relaxed text-muted">
			Tangent is free and provided as-is, with no warranty of any kind. Article content reflects
			Wikipedia at the moment you load it; its accuracy, completeness, and tone are Wikipedia's, not
			ours. Use it at your own discretion, and the project may change or go offline at any time. The
			full <a href="/terms" class={linkClass}>Terms &amp; Privacy</a> cover the rest.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-sm font-semibold tracking-widest text-faint uppercase">Open source</h2>
		<p class="leading-relaxed text-muted">
			Tangent is open source under the MIT license. Read the code, file an issue, or fork it on
			<a
				href="https://github.com/707-Labs/tangent"
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
			<ArrowLeft class="size-4" aria-hidden="true" />
			Back to your tangent
		</a>
	</footer>
</article>
