/**
 * Shared open-state for the article reader — a navigation stack.
 *
 * It lives outside the feed page (its own singleton, like `feed` and `profile`) so the
 * layout shell can react to it: when an article is open, the shell widens into a
 * two-pane split — feed on the left, article on the right — instead of the reader
 * floating over the feed as a modal overlay. On narrow screens there's no room for a
 * second pane, so the reader component itself falls back to a full-screen takeover.
 *
 * Following a link inside an article pushes a new level rather than re-rooting the feed,
 * so you can read a rabbit hole deep and walk back out (Back) without losing your place.
 * Each level caches its fetched HTML and scroll position so going back is instant and
 * lands you exactly where you were — matching the iOS reader.
 */
export interface ReaderEntry {
	/** Stable per-push id so the same title can appear at multiple depths (A→B→A). */
	id: number;
	title: string;
	/** Cached article HTML once fetched, so Back doesn't refetch or flash. */
	html: string | null;
	/** Last scroll offset, restored when this level is shown again. */
	scrollTop: number;
}

class ReaderState {
	/** The reading stack: index 0 is the article opened from the feed, last is on top. */
	entries = $state<ReaderEntry[]>([]);
	#seq = 0;

	get isOpen(): boolean {
		return this.entries.length > 0;
	}

	get current(): ReaderEntry | null {
		return this.entries.at(-1) ?? null;
	}

	get canGoBack(): boolean {
		return this.entries.length > 1;
	}

	/** Open a fresh reader on `title`, replacing any existing stack. */
	open(title: string): void {
		this.entries = [this.#entry(title)];
	}

	/** Follow a link: push a new level on top of the current one. */
	push(title: string): void {
		this.entries = [...this.entries, this.#entry(title)];
	}

	/** Walk back up one level. No-op at the root. */
	back(): void {
		if (this.entries.length > 1) this.entries = this.entries.slice(0, -1);
	}

	close(): void {
		this.entries = [];
	}

	/** Cache the fetched HTML for the level on top (so Back is instant). */
	cacheHtml(html: string): void {
		const top = this.current;
		if (top) top.html = html;
	}

	/** Remember the current level's scroll offset for when we return to it. */
	setScroll(scrollTop: number): void {
		const top = this.current;
		if (top) top.scrollTop = scrollTop;
	}

	#entry(title: string): ReaderEntry {
		return { id: this.#seq++, title, html: null, scrollTop: 0 };
	}
}

export const reader = new ReaderState();
