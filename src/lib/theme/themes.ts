/**
 * Theme registry. Each entry's full token set lives in `src/app.css` as a
 * `:root[data-theme='<id>']` override block (the default `nightstand` needs none —
 * it's the canonical `@theme` palette). This file holds only the metadata the
 * runtime needs: the label + preview swatch for the picker, the `mode` (so 'system'
 * can resolve to a light/dark pair), and `bg` for the `<meta name="theme-color">` tint.
 *
 * Adding a curated theme = one entry here + one CSS block + (if it's the default
 * light/dark for 'system') the inline no-flash map in app.html.
 */
export type ThemeMode = 'dark' | 'light';

export interface Theme {
	id: string;
	label: string;
	mode: ThemeMode;
	/** Page background — drives the browser chrome tint and the picker swatch base. Mirrors --color-void. */
	bg: string;
	/** Primary text — the picker swatch's "ink" bar. Mirrors --color-ink. */
	ink: string;
	/** Accent — the picker swatch's accent dot. Mirrors --color-accent. */
	accent: string;
}

export const THEMES = [
	{ id: 'nightstand', label: 'Nightstand', mode: 'dark', bg: '#15110c', ink: '#ece4d6', accent: '#e0a14e' },
	{ id: 'daylight', label: 'Daylight', mode: 'light', bg: '#f5efe3', ink: '#2a2218', accent: '#9a5410' },
	{ id: 'sepia', label: 'Sepia', mode: 'light', bg: '#f3e8d2', ink: '#3a2c18', accent: '#9a5212' },
	{ id: 'slate', label: 'Slate', mode: 'dark', bg: '#15171c', ink: '#e6e9ef', accent: '#d8a548' },
	{ id: 'forest', label: 'Forest', mode: 'dark', bg: '#0f1410', ink: '#e4ecdf', accent: '#d2a458' },
	{ id: 'high-contrast', label: 'High Contrast', mode: 'dark', bg: '#000000', ink: '#ffffff', accent: '#ffb000' }
] as const satisfies readonly Theme[];

export type ThemeId = (typeof THEMES)[number]['id'];

/** Used by 'system' to pick a concrete theme from the OS color-scheme. */
export const DEFAULT_DARK_ID: ThemeId = 'nightstand';
export const DEFAULT_LIGHT_ID: ThemeId = 'daylight';
export const DEFAULT_THEME_ID: ThemeId = DEFAULT_DARK_ID;

export const THEME_BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t])) as Record<ThemeId, Theme>;

/** What the user chose: a concrete theme, or 'system' (track the OS). */
export type ThemePreference = 'system' | ThemeId;

export function isThemeId(value: string): value is ThemeId {
	return Object.prototype.hasOwnProperty.call(THEME_BY_ID, value);
}
