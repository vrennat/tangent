import { browser } from '$app/environment';

/**
 * First-land coachmark state for the feed's "Like" / "More like this" actions. Shown once,
 * then never again: dismissed either explicitly or the moment the reader first interacts
 * (like, branch, or open an article). The dismissal persists in localStorage.
 *
 * `visible` starts false on both server and client so the first client render matches the
 * SSR output (no hydration mismatch); the component calls `reveal()` from an $effect after
 * mount, which is the only place we consult localStorage and flip it on.
 */
const KEY = 'tangent:hint:actions:v1';

class ActionHint {
	visible = $state(false);
	#checked = false;

	/** Client-only, post-mount: show the hint unless it was dismissed on a past visit. */
	reveal(): void {
		if (this.#checked || !browser) return;
		this.#checked = true;
		try {
			if (localStorage.getItem(KEY) !== 'dismissed') this.visible = true;
		} catch {
			this.visible = true;
		}
	}

	/** Hide and remember — called on explicit dismiss or the first feed interaction. */
	dismiss(): void {
		if (!this.visible && this.#checked) return;
		this.visible = false;
		this.#checked = true;
		if (!browser) return;
		try {
			localStorage.setItem(KEY, 'dismissed');
		} catch {
			// localStorage unavailable (private mode); the hint just reappears next load.
		}
	}
}

export const actionHint = new ActionHint();
