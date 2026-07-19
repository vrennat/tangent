# Ben's Feedback Round 1 — Implementation Plan

Date: 2026-07-19
Source: #all-707-labs, 2026-07-18 11:23–11:33 PDT (Ben Green).
Figma: figma.com/design/GTccCi8WH1zoNmvpLHqcLv/Tangent-design?node-id=4-18 ("Screens" section).

## The feedback, verbatim-ish

1. "Did you know is a nice add but make the vertical span taller so it doesn't cut
   off the fun fact" — screenshot shows DYK shelf cards clamping hooks to 2 lines.
2. "Quick facts is kinda busted for responsive container for photos as the
   wikipedia call-out refers to right to left in a grid" — screenshot: Falklands War
   infobox montage stacked into a ragged left-aligned column while the caption still
   says "Clockwise from top left: …".
3. "Still too large of leaps in the suggested content tangents … distill 3-4
   categories for relevant info in directional tangents. Like, if looking at an
   event from a time, show another event in that region in a similar timeline. Or
   show something happening in the world at that time in a totally different place."
4. "Consider a categories entry point on this page too: History - Animals -
   Geography - Culture - Space … as a user I would want to go into a specific
   subject matter and dive deeper based on being in the mood."
5. "Wanna try implementing what I did so far in this figma" — Screens section:
   Article (reader-split desktop 1440px), /start, /feed, all in Nightstand +
   Daylight (which are already the app's theme names — this is an evolution of the
   current system, mostly layout/chrome, not a re-theme).
6. "Btw I don't have repo access" — github.com/vrennat/tangent is private; Tanner
   must invite him. Not a code task.

## Sequencing

Two quick fixes (A, B) shippable independently today; C is a contained
start-page feature; D is the meaty engine work, sim-validated; E is an ongoing
design workstream coordinated with Ben. A–D have no dependencies on each other.
E touches the same surfaces as A/C, so land A/C first and fold their outcomes
into E rather than the reverse.

### A — DYK cards: stop clipping the fun fact (S)

`src/routes/start/+page.svelte:283` clamps `pick.hook` to `line-clamp-2` on every
shelf card. For DYK the hook IS the payload — the title is incidental.

- In the shelf branch, vary clamp by section: `section.id === 'dyk'` → drop the
  thumbnail-height card assumption; widen DYK cards (`w-44` → ~`w-56`) and clamp
  hooks at ~6 lines (`line-clamp-6`) so nearly all hooks fit; keep 2 lines for
  other shelves. Flex row already stretches cards to equal height per shelf.
- DYK hooks arrive as "... that X did Y" (`src/lib/wikipedia/featured.ts:230`).
  Keep the leading "… that" (it's the DYK idiom) but confirm with a live render.
- Adjust the loading skeleton (`h-48 w-44` at `+page.svelte:201`) so the DYK row
  reserves the taller/wider footprint without layout shift.
- Verify: mobile viewport (Ben screenshots at ~412px), long-hook day, empty-hook
  fallback (falls back to description — keep that at 2 lines).

### B — Quick facts montage: honor the authored grid (S)

`src/app.css:633-645` deliberately flattens `{{multiple image}}` montages inside
`.quick-facts` to a stacked column ("uniform column of images"). Two failures:
captions with spatial references (clockwise/left-to-right) become lies, and in
practice the stack renders ragged (inline per-cell widths on inner wrappers
survive, so images come out assorted widths, left-pinned — Ben's screenshot).

- Remove the `.quick-facts .tmulti` stacking overrides; let the generic
  `.tmulti .trow` flex tiling (app.css:615) apply inside the drawer too. In a
  24rem panel paired tiles are ~11rem each — same as Wikipedia mobile; spatial
  captions become truthful again.
- Keep tiles from overflowing: cells carry inline pixel widths; cap with
  `max-width: calc(50% - gap)` on `.quick-facts .thumbimage` (or `flex: 1 1 0`
  per row) so a 200px-wide pair fits a 320px phone. Reproduce with
  `/?seed=Falklands War` before/after; also spot-check a 3-tile montage and a
  taxobox so the fix doesn't regress the singles case the old comment worried
  about (mixed full-width singles + pairs is acceptable; wrong captions are not).
- This is the one place Ben said "responsive container": test 320px, 412px,
  desktop drawer.

### C — Categories entry point on /start (M)

Mood-based entry: a row of 5 category chips/cards above "Or dive into".

- `src/lib/seeds.ts`: add `category: 'history' | 'animals' | 'geography' |
  'culture' | 'space' | 'science'` to `Seed` (the current 30 seeds cover these
  well; add a few seeds where a category is thin). Ben named five; current seed
  list argues for science as a sixth — confirm with him, default to shipping his
  five and filing science under culture/space where it fits.
- `/start` UI: category row renders above the seed chips; tapping a category
  swaps the "Or dive into" chip row to that category's seeds (client-side filter,
  no navigation), plus a per-category "Surprise me". Keeps his mental model —
  "in the mood for animals" → see only animal starting points.
- Optional v2 (defer): carry `?mood=animals` into the feed and pre-warm
  `tokenWeights` so early tangents stay in-domain. Do NOT couple this to D;
  ship the entry point first.

### D — Directional tangents (L — the real product work)

Today a break pick (`src/lib/feed/select.ts:135-148`) optimizes hook/intrigue
with a variety penalty pushing OUT of the run's neighborhood — which is exactly
"too large a leap": the pick shares no dimension with where you were. Ben's
frame: a good tangent holds one dimension fixed and varies another. Distill 3-4
directions:

1. **Same place, another time** — shares region signal with the run, era differs.
2. **Same time, another place** — shares era/century, region differs.
3. **Same craft/theme, elsewhere** — shares a category stem (shipwrecks,
   painters, volcanoes) with neither era nor region held.
4. **Wild card** — today's hook-ranked behavior, kept as one direction among
   four, not the only move.

Implementation sketch:

- New `src/lib/feed/directions.ts`:
  - `eraBucket(candidate)`: century bucket from description years
    (`HAS_YEAR`/`HAS_ERA` regexes already in `score.ts:28-31`) + category
    patterns ("18th-century…", "1982 in…", "…establishments in").
  - `placeTokens(candidate)`: country/region tokens from categories +
    description tail ("… in Argentina"). Reuse `categoryTokenSet`; likely needs
    a small gazetteer of country/continent names — keep it a flat list, no API.
  - `classify(candidate, runEra, runPlaces)` → direction or null.
- `EngineContext` accumulates `runEras`/`runPlaces` alongside `runTokens`
  (`src/lib/feed/context.ts`, `feedState.svelte.ts`).
- Break path in `selectNext`: partition the tangent pool by direction; pick a
  direction (rotate or weighted-random among non-empty pools, wild card as
  fallback — thin pools must never trap the break, same invariant as today's
  drift fall-through), then softmax within it. Extend `Selection` with
  `direction` so the UI can say what kind of jump this was.
- Surface: `TangentDivider` / `ConnectionBreadcrumb` copy per direction
  ("Meanwhile, in 1982…", "Same coast, four centuries earlier"). Departments
  (`departments.ts`) stay orthogonal — a department labels WHAT the card is, a
  direction labels WHY it followed.
- Validation (this is why the sim exists — commit 250c958): extend the feed sim
  with metrics: share of tangents carrying ≥1 held dimension, direction
  distribution, no attractor regressions. Target: most tangents land with a
  nameable relation to the run; wild cards still occur. Hand-check ~20 landings
  the way departments were validated.
- Era/place extraction from title/desc/categories will be noisy; precision >
  coverage (mislabeled direction reads worse than plain "Tangent" — same rule
  departments follow). Unlabelable candidates simply stay wild-card eligible.
- Spec first (docs/specs/) before building — this touches the engine's core
  loop; run it past the sim's bimodality/attractor checks from the run-based
  feed design.

### E — Implement Ben's Figma screens (M, coordinate with Ben)

Reviewed all four frames at full resolution (2026-07-19). Key finding: Ben
mirrored most of the shipped app faithfully (footer copy verbatim, breadcrumb
eyebrows, quick-facts disclosure, action row, split reader — which already
exists via the `shellWidth` morph in `+layout.svelte:74`). His design is an
emphasis pass, not a rearchitecture. Concrete deltas:

| Surface | Figma | Current | Delta |
|---|---|---|---|
| Top nav | BrandMark + "tangent" wordmark; "New tangent" is a FILLED cream pill (primary CTA) | mark only (`+layout.svelte:88-94`); hairline outline pill (`:139-148`) | add wordmark; invert CTA to filled |
| ArticleCard actions | "More like this" filled pill, Like outline, Read article → right | all three hairline/ghost (`ArticleCard.svelte:189-236`) | promote More-like-this to filled |
| Card breadcrumb | relation glyph + colored uppercase label + source title in SERIF | identical structure, source title in sans (`ConnectionBreadcrumb.svelte:48`) | serif the source title |
| Card body extract | sans-serif | serif `font-display` (`ArticleCard.svelte:184`) | REAL typography decision — serif extract is the bathroom-reader voice; ask Ben before switching |
| Card description | italic serif, warm accent tone | italic serif, `text-faint` (`:179`) | tint warmer |
| Reader panel | header + hatnote/caption italics + full-width QUICK FACTS rows | same anatomy; quick-facts capped 24rem centered (`app.css:714`) | minor width/styling |
| reader-split | 560px feed col + 560px reader at 1200px | exists (max-w-7xl split) | proportions polish only |
| /start | hero + surprise + "OR PICK A SEED" chips, no search/shelves, chips without emoji | richer (search, Today shelves) | his mock predates the shipped page; merge styling, keep features — he called DYK "a nice add" in the same thread |

Approach:

- Themes are already Nightstand/Daylight — no re-theme; his canvases confirm the
  existing palette.
- Order: (1) nav chrome (wordmark + filled CTA), (2) card emphasis pass
  (filled More-like-this, serif breadcrumb source, description tint),
  (3) reader/quick-facts polish, (4) /start reconciliation last, with Ben.
- Hold the extract serif→sans change until Ben confirms it's intentional.
- Mechanics: pull `get_design_context` per frame (60:1323, 19:11, 19:224, 18:5)
  at implementation time for exact values. His component names match
  `src/lib/components/` filenames 1:1.
- Visual-only steps; verify nightstand + daylight, and that the other 6 themes
  don't break.

## For Tanner (not code)

- Invite Ben to github.com/vrennat/tangent (he flagged no repo access).
- Confirm with Ben: (a) five categories or five+science, (b) /start keeps
  search + Today shelves under his visual language, (c) direction copy tone for
  tangent dividers.
