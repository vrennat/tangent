# Bathroom Reader Experience: Length Ratings, Framed Tangents, Running Feet

Date: 2026-07-16
Status: draft for review
Source: UJBR/toilet-reader direction (2026-07-16 session); companion to
`2026-07-16-run-based-feed-design.md`

## Overview

Tangent's honest session model is the toilet reader: short, interrupted, picked up
cold, and each visit has to pay off on its own. Uncle John's Bathroom Reader is the
proven format for exactly that, and its load-bearing features are structural, not
editorial: entries rated by reading length (Short / Medium / Long / "Extended
Sitting Section"), recurring named columns that make wild topic variety read as
curation instead of randomness, and "running feet" one-liner facts at every page
bottom. All three port to Tangent's card feed. The voice does **not** port —
UJBR's other half is comic editorial rewriting, and Tangent serves raw Wikipedia
extracts by design (zero-LLM). That gap is accepted, not papered over.

This spec is the presentation layer over the run-based engine: run boundaries
exist in the algorithm; here they become visible page-turn moments.

## Goals

- Every card tells the reader what it costs before they commit: a reading-time
  badge in UJBR's register.
- A tangent reads as a curated section break — a department header, like turning
  the page to a new UJBR column — not as the algorithm losing the plot.
- The space between cards occasionally offers a one-line fact (a running foot)
  that invites a pull without hijacking the feed.
- Re-entry after hours away is acknowledged and starts fresh-but-in-place.
- Web ships first; every new field rides the shared card payload so iOS adopts by
  rendering, not by re-deriving.

## Non-goals

- LLM rewriting of extracts for voice. Named decision: not doing it now; revisit
  only as its own spec with cost and identity tradeoffs on the table.
- A "how much time do you have" session picker. Passive signals first; a picker
  only if badges prove insufficient.
- New content sources beyond Wikipedia (no trivia databases, no "on this day").
- Department-driven *selection*. Departments label what the engine picked; they do
  not steer scoring in v1.

## Design

### 1. Reading-length badges

- Add `info` to the existing candidate metadata batch query
  (`prop: 'pageimages|description|pageprops|categories'`, `action.ts:68`) — the
  `length` field (wikitext bytes) comes back in the same round trip, no new fetch.
- Estimate: `words ≈ length / 7`, `minutes ≈ words / 230`, clamped and bucketed:
  - **Short** < 3 min, **Medium** 3-8, **Long** 8-20, **Extended sitting** > 20.
- Pure classifier in `src/lib/feed/` (sibling of `taste.ts`); badge text is the
  bucket plus estimate ("Short — ~2 min"). Rendered on the card near "Read
  article" and in the reader header. Buckets are estimates from wikitext bytes;
  copy stays hedged ("~").
- Card payload gains optional `readingLength: { bucket, minutes }`.

### 2. Framed tangents: departments

- A pure `department(candidate): string | null` classifier using the `taste.ts`
  regex-matcher pattern over title + description + categories. Initial columns,
  UJBR-adjacent but Tangent-flavored: **Origins**, **Strange Deaths**,
  **Disasters**, **Hoaxes & Blunders**, **Firsts & Failures**, **Lost & Found**,
  **Wonders**. No match → plain "Tangent".
- Rendering: a tangent card (trail relation `'surprise'`) gets a **section-break
  divider** above it — horizontal rule with the department name — replacing the
  "Tangent from X" breadcrumb as the primary framing (the from-title moves to
  secondary text). In-run cards keep today's breadcrumbs untouched.
- The divider is the page-turn moment: it tells the reader "new entry, clean
  break" so the jump is expected before it is read.
- Card payload gains optional `department: string` on tangent cards.

### 3. Running feet

- Source: the scored-but-not-picked pool. The engine already ranks every
  candidate; a foot is the highest-intrigue eligible runner-up (passes politics
  filter, not seen, not the pick, not disambiguation).
- `Selection` gains optional `foot: Candidate`; `/api/next` forwards it. Web reads
  it from the same client-side selection.
- Rendering: a single quiet line between cards — title + Wikidata description
  ("Garum — fermented fish sauce prized in ancient Rome") — styled as marginalia,
  clearly not a card. Tapping it dives (appends to trail, existing dive flow, so
  the trail records that the foot was pulled).
- Cadence: at most one foot per `footEvery: 3` cards; a foot below the intrigue
  floor is skipped entirely. Silence beats filler.
- Feet are ephemeral (not persisted to the trail unless tapped, not part of run
  state, no engagement signals from merely scrolling past one).

### 4. Session re-entry

- Persist a `lastSeenAt` timestamp alongside the trail. On rehydration with
  `now - lastSeenAt > reentryGapHours: 6`, show a quiet divider above the fold
  ("Picking up from <article>") and reset `runDepth` to 0 at the tip — the next
  cards open a fresh run in place, matching how a toilet-reader session actually
  resumes: same book, new sitting.
- No other rehydration changes; the existing trail restore already does the work.

### Config additions

| Knob | Default |
| --- | --- |
| `footEvery` | 3 |
| `footIntrigueFloor` | reuse `surpriseIntrigueFloor` (0.35) |
| `reentryGapHours` | 6 |
| Reading-length bucket bounds | 3 / 8 / 20 min |

## Open questions (resolved with defaults)

| Question | Default |
| --- | --- |
| "Extended sitting" as user-facing copy | Yes — it is the product voice for this feature; it is text, and it earns the homage. |
| Departments on non-tangent cards | No — labeling every card dilutes the section-break signal to noise. |
| Foot tap relation | `'dive'` — it is a deliberate pull, and dives already re-root, which is the right semantic. |
| Where length estimate lives | Computed server-side at candidate build, shipped on the card payload — iOS must not re-derive. |
| iOS timing | Follow-up pass after web ships; payload fields are optional so the wire contract stays backward-compatible. |

## Acceptance criteria

- Vitest: length bucketing (bounds + clamps), `department()` classification over
  representative fixtures, foot eligibility (politics/seen/disambiguation
  exclusions, intrigue floor, cadence).
- A tangent card renders the department divider; in-run cards are unchanged.
- Feet appear at most every 3 cards, are absent when nothing clears the floor, and
  tapping one appends a dive to the trail.
- Reload after a >6h gap shows the re-entry divider and the next pick starts a new
  run (verifiable via engine context in tests).
- Badges render on card and reader; no layout shift when absent (optional field).
- `bun run check` and `bun run test` pass; no new dependencies.
