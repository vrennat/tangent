<script lang="ts">
	let { size = 24 }: { size?: number } = $props();
</script>

<span class="inline-flex items-center gap-2 font-display font-semibold tracking-tight">
	<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
		<defs>
			<radialGradient id="bm" cx="50%" cy="50%" r="50%">
				<stop offset="0%" stop-color="#08080c" />
				<stop offset="55%" stop-color="#6b5bd6" />
				<stop offset="100%" stop-color="#4fd6e0" />
			</radialGradient>
		</defs>
		<g fill="none" stroke="url(#bm)" stroke-width="2">
			<ellipse cx="16" cy="16" rx="13" ry="13" opacity="0.3" />
			<ellipse cx="16" cy="16" rx="9.5" ry="9.5" opacity="0.55" />
			<ellipse cx="16" cy="16" rx="6" ry="6" opacity="0.85" />
		</g>
		<circle cx="16" cy="16" r="2.2" fill="#8b7bff" />
	</svg>
	<span class="text-ink">wormhole</span>
</span>
