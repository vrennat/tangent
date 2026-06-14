/**
 * Server-side event recorder for anonymous product analytics.
 * Analytics Engine datapoints are anonymous by construction:
 * only event names and non-identifying dimensions are written (no user ids, emails, or IPs).
 * Event failures are swallowed — metrics must never disrupt request handling.
 */

export function recordEvent(
	platform: App.Platform | undefined,
	event: string,
	props: string[] = []
): void {
	const metrics = platform?.env?.METRICS;
	if (!metrics) return;

	try {
		const blobs = [event, ...props].slice(0, 20);
		metrics.writeDataPoint({
			indexes: [event],
			blobs,
			doubles: [1]
		});
	} catch {
		// Silently swallow metrics errors — they must never disrupt requests.
	}
}
