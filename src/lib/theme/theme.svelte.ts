import { browser } from '$app/environment';
import {
	DEFAULT_DARK_ID,
	DEFAULT_LIGHT_ID,
	DEFAULT_THEME_ID,
	THEME_BY_ID,
	isThemeId,
	type Theme,
	type ThemePreference
} from './themes';
import { track } from '$lib/metrics';

const STORAGE_KEY = 'tangent:theme:v1';
const SYSTEM_QUERY = '(prefers-color-scheme: dark)';

function loadPreference(): ThemePreference {
	if (!browser) return 'system';
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw === 'system' || (raw !== null && isThemeId(raw))) return raw;
	} catch {
		// localStorage unavailable (private mode / blocked) — fall through to 'system'.
	}
	return 'system';
}

/**
 * Appearance preference, persisted to localStorage and applied to the DOM.
 *
 * Deliberately device-local: it is NOT routed into the D1 cross-device profile sync,
 * because the right theme depends on the device and its ambient light, not the account.
 *
 * The actual theming is pure CSS — `app.css` carries `:root[data-theme='<id>']` blocks
 * that override the `@theme` color variables; this store just owns which `data-theme`
 * is on `<html>`. An inline script in `app.html` sets it before first paint (no flash);
 * `apply()` keeps it in sync afterwards and updates the `theme-color` meta for every theme.
 */
class ThemeStore {
	preference = $state<ThemePreference>('system');
	/** Live OS color-scheme, so `resolvedId` recomputes when the system flips under 'system'. */
	#systemDark = $state(true);

	constructor() {
		this.preference = loadPreference();
		if (browser) {
			const mq = window.matchMedia(SYSTEM_QUERY);
			this.#systemDark = mq.matches;
			mq.addEventListener('change', (e) => {
				this.#systemDark = e.matches;
			});
		}
	}

	get resolvedId() {
		if (this.preference === 'system') return this.#systemDark ? DEFAULT_DARK_ID : DEFAULT_LIGHT_ID;
		return this.preference;
	}

	get resolved(): Theme {
		return THEME_BY_ID[this.resolvedId] ?? THEME_BY_ID[DEFAULT_THEME_ID];
	}

	set(preference: ThemePreference): void {
		this.preference = preference;
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, preference);
		} catch {
			// Best-effort persistence; the in-memory preference still applies this session.
		}
		track('theme_change', { theme: preference });
	}

	/** Reflect the resolved theme onto the document. Reactive — call inside an `$effect`. */
	apply(): void {
		if (!browser) return;
		const theme = this.resolved;
		document.documentElement.dataset.theme = theme.id;
		document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.bg);
	}
}

export const theme = new ThemeStore();
