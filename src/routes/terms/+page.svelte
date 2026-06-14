<script lang="ts">
	import { ArrowLeft } from '@lucide/svelte';

	// Terms of Use + Privacy in one plain-language page. Kept honest and proportionate for a
	// free reading toy with optional accounts — see /about for what Tangent is.
	const linkClass =
		'text-ink underline decoration-accent/40 underline-offset-2 transition-colors hover:decoration-accent';
</script>

<svelte:head>
	<title>Terms &amp; Privacy · Tangent</title>
	<meta
		name="description"
		content="The plain-language terms for using Tangent, and exactly what it does and doesn't store about you."
	/>
</svelte:head>

<article class="mx-auto max-w-2xl space-y-10 py-4 font-display">
	<header class="space-y-3">
		<h1 class="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Terms &amp; Privacy</h1>
		<p class="text-lg leading-relaxed text-muted">
			Plain language, no surprises. This covers the deal for using Tangent and exactly what it does
			— and doesn't — keep about you.
		</p>
		<p class="text-sm text-faint">Last updated 13 June 2026.</p>
	</header>

	<section class="space-y-3">
		<h2 class="text-sm font-semibold tracking-widest text-faint uppercase">The gist</h2>
		<ul class="space-y-2 leading-relaxed text-muted">
			<li>Tangent is free, and you can use all of it without ever making an account.</li>
			<li>
				If you do sign in, the only things stored are your email, your synced interests, and any
				passkeys you add — and you can delete the whole account, and everything in it, whenever you
				want.
			</li>
			<li>No ads, no tracking cookies, no selling your data. Usage stats are anonymous.</li>
			<li>The writing is Wikipedia's, used under its license; please don't abuse the service.</li>
		</ul>
	</section>

	<section class="space-y-3">
		<h2 class="text-sm font-semibold tracking-widest text-faint uppercase">Using Tangent</h2>
		<p class="leading-relaxed text-muted">
			Tangent is provided free and as-is, with no warranty of any kind. It's a reading toy; it may
			change, break, or go offline at any time, and we're not liable for anything that follows from
			using it. The article text, summaries, and images come live from Wikipedia and Wikimedia
			Commons under their own licenses (see <a href="/about" class={linkClass}>About</a> for the
			attribution) — that content is theirs, not ours, and its accuracy is on Wikipedia.
		</p>
		<p class="leading-relaxed text-muted">
			In return, just be reasonable: don't hammer or try to overwhelm the service, don't use it to
			break the law or infringe others' rights, and don't attempt to attack, probe, or scrape it in
			bulk. If you sign in, keep your email and devices secure — anyone who can read your email or
			use your passkey can reach your account.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-sm font-semibold tracking-widest text-faint uppercase">
			What's yours, and what we store
		</h2>
		<p class="leading-relaxed text-muted">
			By default Tangent keeps nothing about you on a server. The interests that tune your feed and
			the trail you leave live in your browser's local storage, and the feed itself is built on your
			device — you can wipe all of it anytime from the interests panel.
		</p>
		<p class="leading-relaxed text-muted">
			Signing in is optional, and adds little on the server: your <strong class="text-ink"
				>email address</strong
			>
			(so you can log back in and sync across devices) and a <strong class="text-ink"
				>copy of that interests list</strong
			>. If you register a passkey, the server also keeps its public key and a device label so you
			can recognize and manage it. The email is used to send your login link or code — nothing else.
			We don't email you newsletters, and we don't share or sell any of it. Your browser is still the
			source of truth; the server copy is just a backup so your feed can follow you to another device.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-sm font-semibold tracking-widest text-faint uppercase">How it's kept safe</h2>
		<ul class="space-y-2 leading-relaxed text-muted">
			<li>
				Login codes and session tokens are kept in our database only as one-way hashes, so a leak of
				it can't be replayed as your login.
			</li>
			<li>
				Passkeys keep their private key on your own device; the server only ever sees the public
				half, which can't sign in by itself.
			</li>
			<li>
				The one cookie Tangent sets is an essential sign-in cookie (HTTP-only, same-site). There are
				no advertising or cross-site tracking cookies.
			</li>
			<li>Your data lives in Cloudflare's infrastructure, which hosts and protects the service.</li>
		</ul>
	</section>

	<section class="space-y-3">
		<h2 class="text-sm font-semibold tracking-widest text-faint uppercase">
			Usage, measured anonymously
		</h2>
		<p class="leading-relaxed text-muted">
			To understand how Tangent is used and keep it working, we record basic, aggregate usage —
			things like how many articles get served, liked, or branched from, and which themes are
			popular. These are simple aggregate counts with no profile attached and no cookies: no name,
			no email, no account id, and no IP address tied to them. They tell us what's happening in
			general, never what you specifically did.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-sm font-semibold tracking-widest text-faint uppercase">Deleting your data</h2>
		<p class="leading-relaxed text-muted">
			Your account is yours to erase. Deleting it from your account settings permanently removes
			everything tied to it — your email, your synced interests, your passkeys, and every session —
			in one step; there's no soft-delete or hidden retained copy. You can also revoke an individual
			passkey without deleting the account, and you can clear the on-device data anytime from the
			interests panel.
		</p>
		<p class="leading-relaxed text-muted">
			Questions, or want a copy of your data or help removing it? Email
			<a href="mailto:help@tangent.page" class={linkClass}>help@tangent.page</a>.
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
