<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import { LoaderCircle } from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// The action returns { state: 'invalid' } on a spent/expired token; treat either source as a
	// dead link so a stale page that fails to POST shows the same recovery copy as a bad GET.
	const invalid = $derived(data.state === 'invalid' || form?.state === 'invalid');
	const token = $derived(page.url.searchParams.get('token') ?? '');

	let submitting = $state(false);
</script>

<svelte:head>
	<title>Sign in · Tangent</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto flex min-h-[60vh] max-w-sm flex-col items-center justify-center text-center">
	<div class="mb-6"><BrandMark size={32} /></div>

	{#if invalid}
		<h1 class="font-display text-xl font-semibold text-ink">This link has expired</h1>
		<p class="mt-2 text-sm text-faint">
			Sign-in links work once and last 10 minutes. Head back and request a fresh one.
		</p>
		<a
			href="/"
			data-cta
			class="mt-6 inline-flex items-center justify-center rounded-full bg-accent/10 px-5 py-2
				text-sm font-medium text-accent transition-colors hover:bg-accent/20"
		>
			Back to Tangent
		</a>
	{:else}
		<h1 class="font-display text-xl font-semibold text-ink">Sign in to Tangent</h1>
		<p class="mt-2 text-sm text-faint">
			You're about to sign in as <span class="text-muted">{data.email}</span>.
		</p>
		<form
			method="POST"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					// On success the action redirects (303); update() only runs if it returned a failure.
					await update();
					submitting = false;
				};
			}}
			class="mt-6 w-full"
		>
			<input type="hidden" name="token" value={token} />
			<button
				type="submit"
				disabled={submitting}
				class="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-accent/10
					px-5 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/20
					disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if submitting}<LoaderCircle class="size-4 animate-spin" aria-hidden="true" />{/if}
				Sign in
			</button>
		</form>
		<p class="mt-4 text-xs text-faint">This link expires 10 minutes after it was sent.</p>
	{/if}
</div>
