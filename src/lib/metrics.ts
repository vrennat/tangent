import { browser } from '$app/environment';

export type MetricEvent = 'like' | 'skip' | 'branch' | 'theme_change' | 'article_opened';

export function track(event: MetricEvent, props?: Record<string, string>): void {
	if (!browser) return;

	try {
		fetch('/api/metrics', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ event, props }),
			keepalive: true
		}).catch(() => {});
	} catch {
		// Silently swallow errors — metrics must never disrupt user interactions.
	}
}
