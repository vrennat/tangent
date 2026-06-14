<script lang="ts">
	import { theme } from '$lib/theme/theme.svelte';
	import {
		THEMES,
		THEME_BY_ID,
		DEFAULT_DARK_ID,
		DEFAULT_LIGHT_ID,
		type Theme,
		type ThemePreference
	} from '$lib/theme/themes';

	// 'system' first (tracks the OS), then each concrete theme in registry order.
	const options: { id: ThemePreference; label: string }[] = [
		{ id: 'system', label: 'System' },
		...THEMES.map((t) => ({ id: t.id, label: t.label }))
	];

	const dark: Theme = THEME_BY_ID[DEFAULT_DARK_ID];
	const light: Theme = THEME_BY_ID[DEFAULT_LIGHT_ID];
</script>

<div class="grid grid-cols-3 gap-2" role="group" aria-label="Theme">
	{#each options as opt (opt.id)}
		{@const selected = theme.preference === opt.id}
		{@const t = opt.id === 'system' ? null : THEME_BY_ID[opt.id]}
		<button
			type="button"
			aria-pressed={selected}
			onclick={() => theme.set(opt.id)}
			class="group flex flex-col items-center gap-1.5 rounded-lg border p-1.5 transition-colors
				{selected ? 'border-accent/60 bg-accent/10' : 'border-hair hover:border-hair-strong'}"
		>
			<!-- Mini preview: the theme's page rendered tiny (headline + subline + accent).
			     'System' shows a diagonal split of the light/dark pair it resolves between. -->
			<span
				class="relative block h-10 w-full overflow-hidden rounded-md border border-hair"
				style={t
					? `background:${t.bg}`
					: `background:linear-gradient(135deg, ${dark.bg} 0 48%, ${light.bg} 52% 100%)`}
				aria-hidden="true"
			>
				{#if t}
					<span class="absolute left-1.5 top-1.5 h-1 w-6 rounded-full" style="background:{t.ink}"
					></span>
					<span
						class="absolute left-1.5 top-3.5 h-1 w-4 rounded-full"
						style="background:{t.ink};opacity:0.45"
					></span>
					<span
						class="absolute bottom-1.5 left-1.5 h-2 w-2 rounded-full"
						style="background:{t.accent}"
					></span>
				{:else}
					<span class="absolute left-1.5 top-1.5 h-1.5 w-1.5 rounded-full" style="background:{dark.accent}"
					></span>
					<span
						class="absolute bottom-1.5 right-1.5 h-1.5 w-1.5 rounded-full"
						style="background:{light.accent}"
					></span>
				{/if}
			</span>
			<span
				class="text-xs font-medium {selected ? 'text-accent' : 'text-muted group-hover:text-ink'}"
			>
				{opt.label}
			</span>
		</button>
	{/each}
</div>
