import type { FeedCard } from '$lib/feed/types';

/**
 * Shared open-state for the article reader.
 *
 * It lives outside the feed page (its own singleton, like `feed` and `profile`) so
 * the layout shell can react to it: when an article is open, the shell widens into a
 * two-pane split — feed on the left, article on the right — instead of the reader
 * floating over the feed as a modal overlay. On narrow screens there's no room for a
 * second pane, so the reader component itself falls back to a full-screen takeover.
 */
class ReaderState {
	/** The card whose article is open in the reader, or null when closed. */
	card = $state<FeedCard | null>(null);

	get isOpen(): boolean {
		return this.card !== null;
	}

	open(card: FeedCard): void {
		this.card = card;
	}

	close(): void {
		this.card = null;
	}
}

export const reader = new ReaderState();
