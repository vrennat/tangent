// See https://svelte.dev/docs/kit/types#app.d.ts
// Cloudflare types are imported (not globally referenced) so they don't shadow the DOM
// lib in browser code — a global reference swaps `Response.json()` to return `unknown`.
import type { D1Database, CfProperties, ExecutionContext, AnalyticsEngineDataset } from '@cloudflare/workers-types';
import type { SessionUser } from '$lib/server/auth/session';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** The authenticated account for this request, or null when signed out. */
			user: SessionUser | null;
		}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env: {
				DB: D1Database;
				METRICS?: AnalyticsEngineDataset;
			};
			cf?: CfProperties;
			ctx: ExecutionContext;
		}
	}
}

export {};
