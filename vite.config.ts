import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import { realpathSync } from 'node:fs';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		fs: {
			// Worktree checkouts symlink node_modules to the main clone; Vite resolves
			// @fs requests to the symlink's REAL path, which falls outside the default
			// allow list and 403s every dep in dev. Allow the resolved path explicitly.
			allow: [searchForWorkspaceRoot(process.cwd()), realpathSync('node_modules')]
		}
	}
});
