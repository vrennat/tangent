/**
 * Shared open-state for the article reader.
 *
 * It lives outside the feed page (its own singleton, like `feed` and `profile`) so the
 * layout shell can react to it: when an article is open, the shell widens into a
 * two-pane split — feed on the left, article on the right — instead of the reader
 * floating over the feed as a modal overlay. On narrow screens there's no room for a
 * second pane, so the reader component itself falls back to a full-screen takeover.
 *
 * Following a link inside an article does NOT deepen the reader into a stack — it closes
 * and drops the dove-into article as a fresh card in the feed (see +page `handleDive`),
 * so the feed itself stays the record of the rabbit hole. The reader therefore holds one
 * article at a time, identified by its title. (The native iOS reader keeps a
 * NavigationStack for back-swipe; the web reader leans on the feed instead.)
 */
class ReaderState {
	/** The title of the article currently shown, or null when the reader is closed. */
	current = $state<string | null>(null);

	get isOpen(): boolean {
		return this.current !== null;
	}

	/** Open the reader on `title`, replacing any article already shown. */
	open(title: string): void {
		this.current = title;
	}

	close(): void {
		this.current = null;
	}
}

export const reader = new ReaderState();
