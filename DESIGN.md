# Tangent Design Manifest

> This file is the design source of truth for AI-assisted development.
> When generating or modifying UI, read this file first.

---

## Design Philosophy

**Nightstand** — a warm, brown-black dark theme that reads like a book by lamplight.
Tangent is a Wikipedia rabbit-hole feed; the surface should feel editorial and calm, never
app-y or neon. The palette is warm neutrals on a near-black ground, lit by a single faint
wash from the top (lamplight, not glow). There is exactly **one ember accent** — reserve it
for the branded moment (logo touch-point, link/CTA hover); it is a highlight, not a fill.
A sage "spark" tone marks serendipity/discovery, a warm coral marks "like".

Type is the design: **Newsreader** (serif) carries headings and long-form reading;
**Hanken Grotesk** carries the UI. Iconography is a deliberately geometric node/edge/point
vocabulary echoing the brand mark (a line going off on a tangent).

**Hard nos:** no purple, no cyan, no glassmorphism, no Inter. Every text token clears WCAG AA
on its own background (the High Contrast theme clears AAA).

---

## Technical Constraints

| Constraint | Value |
|---|---|
| Framework | SvelteKit (Svelte 5 runes — `$state`/`$derived`/`$effect`/`$props`) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 (`@theme`) + CSS custom properties; utilities compile to `var(--color-*)` |
| Component Library | None — `@lucide/svelte` for icons; components are bespoke |
| Tokens | CSS custom properties in `src/app.css` (`@theme` block) |
| Theming | 8 curated themes via `:root[data-theme='…']` overrides; registry in `src/lib/theme/themes.ts` |
| Fonts | Self-hosted via Fontsource (no Google Fonts request) |
| Deploy target | Cloudflare Workers (`@sveltejs/adapter-cloudflare`) |

The `@theme` block IS the default theme (Nightstand). Re-declaring its `--color-*` variables
under `:root[data-theme='…']` re-skins the whole app at runtime with zero component changes.

---

## Design Tokens

Defined in `src/app.css`. **Always use these tokens — never hardcode color, font, radius, or
shadow values.** Tailwind generates the utilities from the `@theme` block:
`--color-void` → `bg-void`/`text-void`/`border-void`, etc.

### Colors — Surfaces

| Token | Utility | Nightstand value | Role |
|---|---|---|---|
| `--color-void` | `bg-void` | `#15110c` | Page background (also the chrome tint) |
| `--color-surface` | `bg-surface` | `#1f1a13` | Card / panel surface |
| `--color-surface-2` | `bg-surface-2` | `#2a2319` | Raised / hover surface |
| `--color-hair` | `border-hair` | `#342d22` | Hairline borders |
| `--color-hair-strong` | `border-hair-strong` | `#473d2e` | Stronger dividers |

### Colors — Text

| Token | Utility | Nightstand value | Role |
|---|---|---|---|
| `--color-ink` | `text-ink` | `#ece4d6` | Primary text, headings |
| `--color-muted` | `text-muted` | `#a89c8a` | Secondary UI text |
| `--color-faint` | `text-faint` | `#9b8f76` | Tertiary / legal small-print (AA floor) |
| `--color-read` | `text-read` | `#cdbfa6` | Long-form reading body (brighter than muted, dimmer than ink) |

### Colors — Accents

| Token | Utility | Nightstand value | Role |
|---|---|---|---|
| `--color-accent` | `text-accent` | `#e0a14e` | The ember — branded moment, hover, links |
| `--color-accent-soft` | `text-accent-soft` | `#c8893a` | Pressed / darker accent |
| `--color-spark` | `text-spark` | `#86b39a` | Sage "serendipity"/discovery tone |
| `--color-like` | `text-like` | `#e0644a` | Warm "like" |
| `--color-danger` | `text-danger` | `#f3766b` | Error / alert text |

### Typography

| Token | Value | Role |
|---|---|---|
| `--font-display` | `'Newsreader', ui-serif, Georgia, …` | Headings + long-form reading (serif) |
| `--font-body` | `'Hanken Grotesk', ui-sans-serif, system-ui, …` | UI (sans). Set on `body`. |

### Borders & Shadows

| Token | Value | Role |
|---|---|---|
| `--radius-card` | `0.875rem` | Card corner radius (`rounded-card`) |
| `--shadow-card` | `0 10px 30px -18px rgba(0,0,0,.85)` | Card drop shadow (re-toned softer per light theme) |

Spacing, breakpoints, and most radii come from **Tailwind defaults** — there are no custom
spacing/breakpoint tokens. The only non-`@theme` custom property is `--tl-spine` (timeline
component-local). Motion primitives are keyframes in `app.css` (`slide-from-right`, `wh-rise`,
`wh-fade`, `wh-shimmer`, `wh-land`); all motion is gated by `@media (prefers-reduced-motion)`.

### Themes

8 curated themes (`src/lib/theme/themes.ts` + a CSS block each in `app.css`). `system` resolves
to Nightstand (dark) / Daylight (light) from the OS. Theme choice is device-local, not synced.

| id | Label | Mode | Page bg | Notes |
|---|---|---|---|---|
| `nightstand` | Nightstand | dark | `#15110c` | Default — the canonical `@theme` palette |
| `daylight` | Daylight | light | `#f5efe3` | Nightstand by day — warm paper, ink-on-cream |
| `sepia` | Sepia | light | `#f3e8d2` | Tan parchment, sepia-brown ink |
| `newsprint` | Newsprint | light | `#e9e7e1` | Cool gray-white page, coffee-brown accent |
| `slate` | Slate | dark | `#15171c` | Cool blue-grey, warm brass accent |
| `forest` | Forest | dark | `#0f1410` | Deep green-black, sage-forward |
| `wine` | Wine | dark | `#1a1012` | Oxblood-black, rose-tinted ink |
| `high-contrast` | High Contrast | dark | `#000000` | Accessibility-first, WCAG AAA, bright amber |

Adding a theme = one entry in `themes.ts` + one `:root[data-theme='…']` block in `app.css`
(+ the inline no-flash map in `app.html` only if it's a new `system` default).

---

## Layout & Navigation

Layout defined in `src/routes/+layout.svelte`.

**Navigation pattern:** sticky **top bar** (full-bleed border, inner row constrained to the
reading column). Header holds the BrandMark (home), a Trail toggle (appears once you're past the
seed), an Interests/feed-tuning popover, and a "New tangent" CTA. A footer carries Wikipedia
attribution (CC BY-SA 4.0) + About / Terms / Source links.

**Shell width:** content is a narrow reading column (`max-w-2xl`). Opening the article reader
morphs the shell into a two-pane split (`lg:max-w-7xl`) via a one-shot `transition-[max-width]`
(reduced-motion snaps it). Safe-area insets are honored (`env(safe-area-inset-top)`).

### Routes

| Route | Description |
|---|---|
| `/` | The infinite feed: scroll a stream of connected article cards; like/dive to steer it; open the reader pane and the trail of where you've been. |
| `/start` | New tangent: search Wikipedia or pick from "Today on Wikipedia" (featured / DYK / on this day / news / trending) to seed a fresh feed. |
| `/about` | Static page — what Tangent is, where content comes from, licensing and privacy. |
| `/terms` | Terms of Use + Privacy in one plain-language page. |
| `/auth/verify` | Magic-link verification landing (sign-in token check; shows recovery copy on a spent/expired link). |

---

## Components

**13 components**, all in `src/lib/components/` (flat, no domain subdirs). Grouped by role:

- **Feed & reading** — `ArticleCard` (one article in the rabbit-hole stream; like/dive actions; joins the trail on first view), `ArticleReader` (full-article reading pane; opens the two-pane split), `SkeletonCard` (feed-card loading placeholder), `ActionHint` (one-time orientation for the Like / Dive actions), `LinkPreview` (hover peek of an in-article link — pointer-fine only, inert on touch).
- **Trail & connections** — `TrailPanel` (the trail of articles you've actually reached; jump back to waypoints), `ConnectionBreadcrumb` ("came from" link back to a card's source), `RelationIcon` (geometric icon for a connection's relation type — the shared node/edge/point vocabulary).
- **Brand & chrome** — `BrandMark` (wordmark + tangent-line logo with the lone ember dot at the touch-point), `Drawer` (accessible native `<dialog>` slide-in panel primitive; focus-restoring close).
- **Settings & account** — `ProfilePanel` (interests popover: feed-tuning sliders + account), `AccountSection` (magic-link sign-in / account block inside the profile panel), `ThemePicker` (theme selector with mini live previews of each theme).

---

## Maintaining This Document

When new design decisions are made:

1. Update this file, not Figma.
2. Add decisions under the appropriate section.
3. Run `/design-ctx sync` to refresh auto-detected sections (tokens, components, routes).
4. Keep descriptions intent-focused, not pixel-focused.
