import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Deploys to Cloudflare Workers; `npm run dev` uses Vite locally and ignores this.
		adapter: adapter()
	}
};

export default config;
