<script lang="ts">
	let { size = 24 }: { size?: number } = $props();
</script>

<!--
  Logo geometry: an S-curve (the path you were on) with a tangent line
  touching it at the inflection — the exact moment you go off on one.
  The curve uses currentColor so it adapts to context; the tangent line and
  the touch-point dot are the ember accent — the one branded moment.

  Tangent point at ~(13, 9): lies on the curve (t≈0.70 of the first bezier
  segment) and on the line from (0,2)→(32,19).
-->
<span class="inline-flex items-center gap-2 font-display font-semibold tracking-tight">
	<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
		<!-- S-curve -->
		<path
			d="M 2 28 C 2 4, 14 4, 18 16 C 22 28, 26 28, 30 8"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
		<!-- Tangent line -->
		<line
			x1="0" y1="2" x2="32" y2="19"
			stroke="var(--color-accent)"
			stroke-width="2"
			stroke-linecap="round"
		/>
		<!-- Dot at the tangent point -->
		<circle cx="13" cy="9" r="2.2" fill="var(--color-accent)" />
	</svg>
	<span class="text-ink">tangent</span>
</span>
