# Directional Tangents — Design

Date: 2026-07-19
Origin: Ben's feedback (#all-707-labs 2026-07-18): tangent leaps feel too large;
distill 3-4 categories of directional relevance — "another event in that region in
a similar timeline", "something happening in the world at that time in a totally
different place".
Plan: docs/plans/2026-07-19-ben-feedback-round1-plan.md (workstream D).

## Problem

A break pick (select.ts) optimizes hook quality under a variety penalty that
pushes OUT of the run's whole token neighborhood. The landing is deliberately
far — but it shares no *nameable* dimension with where the reader was, which is
exactly what "too large a leap" feels like. Ben's frame: a good tangent holds
one dimension fixed and varies another.

## Directions

A tangent pick gets a `direction` when it relates to the run along exactly one
axis. Detection is precision-first (same rule as departments: a wrong label
reads worse than no label); unlabelable candidates stay wild-card eligible.

| Direction | Holds | Varies | Divider copy |
|---|---|---|---|
| `era` | time bucket | place (must have a detectable, disjoint place) | "Meanwhile, elsewhere" |
| `place` | place | time (must have a detectable, disjoint era) | "Same place, another time" |
| `theme` | a meaningful category token | era and place both unshared | "Pulling the thread" |
| (wild) | — | — | department ?? "Tangent" (today's behavior) |

Direction wins the divider slot over department when both exist (direction
explains WHY the jump followed; department says what the card is). Reversible.

## Signals — `src/lib/feed/directions.ts` (pure, no I/O)

- `eraBuckets({description, categories})`: set of time buckets from description
  years + category names ("Conflicts in 1982", "17th-century …", "1980s", "27
  BC"). Buckets: decade for years >= 1800 ("1980s"), century otherwise ("17c",
  "3c-bc"). Rationale: the felt size of "same time" scales with distance —
  1914 vs 1999 is NOT "meanwhile" but 1560s vs 1580s is. Titles are excluded
  (numbers in titles are identifiers more often than dates).
- `placeTokens({description, categories})`: set of place names matched against a
  flat gazetteer (countries, continents, oceans, major regions, a few historical
  polities: Roman Empire, Ottoman Empire, Soviet Union, Mesopotamia, Persia…),
  word-boundary matched against category names + description. Titles are
  excluded ("Michael Jordan" must not read as Jordan). Ambiguous bare names
  dropped (guinea); mild risks kept (turkey, chad) — categories dominate the
  input and are title-cased country contexts in practice.
- `classifyDirection(candidate, runEras, runPlaces, runCategories)`:
  - shares era, no shared place, has ≥1 place → `era`
  - shares place, no shared era, has ≥1 era → `place`
  - neither, but shares ≥1 meaningful category token (digit-free, non-place,
    minus a generic stoplist: history/people/births/deaths/…) → `theme`
  - else → null (wild)
  - shares BOTH era and place → null: that's the neighborhood, not a tangent
    (the variety penalty already sinks those).

## Engine changes

- `EngineContext` += `runEras: Set<string>`, `runPlaces: Set<string>` —
  accumulated per run exactly like runTokens/runCategories.
- `Selection` += `direction?: 'era' | 'place' | 'theme'`.
- Break path in `selectNext`:
  1. Hook-gate + boost the break pool as today, but partition BEFORE the top-K
     cap (capping first would starve directions the same way it starved hooky
     candidates — see tangentRanked's comment).
  2. Partition into era/place/theme pools (each sorted, capped at
     surpriseTopK); wild pool = today's undirected top-K.
  3. One rng roll chooses: wild with probability `directionWildShare` (0.25, so
     serendipity survives), else uniformly among directional pools with ≥
     `directionMinPool` (2) members. No available directions → wild.
  4. Softmax within the chosen pool at surpriseTemperature (unchanged).
  - Thin gated pool (< surpriseMinPool) → drift fall-through, unchanged. All
    existing invariants (anti-orbit, heal, drift) preserved: directions only
    re-weight WITHIN the already-safe pool.
  - RNG discipline: the direction roll happens only on the break path; call
    counts stay deterministic for identical inputs, which is what the sim's
    mulberry32 reproducibility actually needs. Old recorded sequences shift —
    re-baseline the sim before comparing.

## Wire changes (native parity — the categoryTokens pattern)

- `SessionPayload` += `runEras?: string[]`, `runPlaces?: string[]` (absent →
  empty sets → directions never fire; old clients degrade to today's behavior).
- `NextResponse` += `direction?`, plus the pick's `eraTokens?: string[]` /
  `placeTokens?: string[]` so native clients accumulate run state without
  their own extractor (server-computed, like categoryTokens).
- `/api/next` computes all three server-side.

## Web client changes

- `feedState.#runState` also accumulates eras/places (shared extractors).
- `FeedCard` += `direction?`; set on surprise picks in `#doBuild`.
- `TangentDivider` renders direction copy ?? department ?? "Tangent".

## Validation

- Unit: tests/directions.test.ts (bucketing, gazetteer, classification,
  including the Michael-Jordan title trap and both-shared → null).
- Unit: tests/feed.test.ts additions — deterministic-rng break lands in the
  expected direction pool; wild share honored; thin-pool fall-through intact.
- Sim (scripts/feed-sim): record `direction` per tangent landing. Report:
  direction distribution, share of tangents with ≥1 held dimension (target:
  most tangents nameable; wild still present), attractor/bimodality metrics
  not regressed vs a same-night baseline. Hand-check ~20 labeled landings for
  precision, the way departments were validated.

## Non-goals (v1)

- No candidate-generation changes: directions re-rank the existing one-hop
  pool. The sim's honest-gaps note (tangent size bounded by generation) stands.
- No cities/US states in the gazetteer; no adjacent-decade tolerance; no
  direction rotation memory. All are v2 knobs if the sim shows starvation.
- Category entry point (workstream C) stays decoupled from directions.
