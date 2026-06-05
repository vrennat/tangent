import { defineConfig } from 'vitest/config';

// Standalone from vite.config.ts: the feed engine under test uses only relative
// imports at runtime (type-only `$lib` imports are erased), so no SvelteKit
// plugin/alias is needed — which also sidesteps the rolldown-vite plugin-type clash.
export default defineConfig({
	test: {
		include: ['tests/**/*.{test,spec}.ts'],
		environment: 'node'
	}
});
