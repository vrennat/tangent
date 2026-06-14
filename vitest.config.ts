import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Standalone from vite.config.ts: we don't load the SvelteKit plugin (it drags in the
// rolldown-vite plugin-type clash). We DO add a bare `$lib` resolve alias so modules under
// test that have *runtime* `$lib` imports (e.g. the shared profile merge -> feed/taste)
// resolve; the feed engine's own `$lib` imports are type-only and erased.
export default defineConfig({
	test: {
		include: ['tests/**/*.{test,spec}.ts'],
		environment: 'node'
	},
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url))
		}
	}
});
