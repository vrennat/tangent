<script lang="ts" module>
	let _count = 0;
</script>

<script lang="ts">
	let { size = 24 }: { size?: number } = $props();
	const uid = `tg-${_count++}`;
</script>

<!--
  Logo geometry: an S-curve (the path you were on) with a tangent line
  touching it at the inflection — the exact moment you go off on one.
  Curve uses currentColor so it adapts to context; the branded gradient
  runs purple→cyan along the tangent line's direction.

  Tangent point at ~(13, 9), verified: lies on curve (t≈0.70 of first
  bezier segment) and on line from (0,2)→(32,19).
-->
<span class="inline-flex items-center gap-2 font-display font-semibold tracking-tight">
	<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
		<defs>
			<!-- Gradient runs along the tangent line direction (upper-left → lower-right). -->
			<linearGradient id={uid} x1="0" y1="2" x2="32" y2="19" gradientUnits="userSpaceOnUse">
				<stop offset="0%" stop-color="#6b5bd6" />
				<stop offset="100%" stop-color="#4fd6e0" />
			</linearGradient>
		</defs>
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
			stroke="url(#{uid})"
			stroke-width="2"
			stroke-linecap="round"
		/>
		<!-- Dot at the tangent point -->
		<circle cx="13" cy="9" r="2.2" fill="url(#{uid})" />
	</svg>
	<span class="text-ink">tangent</span>
</span>
