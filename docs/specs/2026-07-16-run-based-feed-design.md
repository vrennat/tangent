# Run-Based Feed: Coherent Runs, Framed Tangents

Date: 2026-07-16
Status: draft for review
Source: UJBR/toilet-reader direction + Ben's "jumps between topics feel too great" feedback (2026-07-16 session)

## Overview

Restructure selection from a per-card walk into **runs**: 3-5 consecutive cards that
stay in the current article's neighborhood (same era, region, or topic cluster),
punctuated by a **tangent** — a deliberate, quality-gated jump that starts the next
run. The jump-distance distribution becomes bimodal: very close within a run, far at
run breaks. Today it is unimodal-medium — every card is a moderately-sized hop —
which is exactly what reads as "the jumps are too great."

Why the current engine produces that feel:

1. The variety penalty (`varietyPenalty: -0.45`/token, `score.ts:134`) punishes
   candidates for sharing tokens with recent cards — after "Roman Empire", "Roman
   Republic" is *penalized* for containing "Roman". The engine actively fights local
   coherence. (The 2026-06-11 overhaul already excluded the immediate parent from
   `recentTokens` for this same reason; this spec completes that trajectory.)
2. There is no region/time relatedness signal. From "Roman Empire", "Carthage"
   (same era, same sea) and "Christianity" (a 2,000-year global sprawl) are both
   just "a lead link". Categories — which encode exactly era+region ("Ancient
   Rome", "1st-century BC establishments") — are already fetched non-hidden on
   every candidate (`action.ts:68-72`) but used only as regex text for politics.
3. Per-card independence: the pacing rhythm and steady 18% surprise epsilon re-roll
   the jump character every card. There is no "we're in a Rome stretch, stay here."

The engine stays a pure module; both entry points (web client `selectNext`, iOS via
`/api/next`) pick the change up in lockstep by construction.

## Goals

- Within a run, consecutive cards feel like the same neighborhood (era/region/topic).
- Tangents are rarer, bigger, and structurally expected — they land at run
  boundaries, not mid-flow, and every session is guaranteed one early.
- No new infrastructure: no embeddings, no LLM, no new fetches. Category overlap
  over already-fetched data is the relatedness signal.
- Attractor safety does not regress: run breaks are unconditional, so coherence
  cannot create an inescapable orbit; the WWII-cluster landing rate stays at or
  below the current sim baseline (1.7%).
- Validated in `scripts/feed-sim/` against a control arm before shipping, with a
  jump-distance metric that confirms the bimodal shift.

## Non-goals

- Department labels, length ratings, running feet — presentation of run boundaries
  lives in the experience spec (`2026-07-16-bathroom-reader-experience-design.md`).
- Explicit era/region extraction (year-range vectors, geo coordinates). Category
  token overlap is the 80% version; escalate only if the sim shows it insufficient.
- Changing candidate generation (lead links + `morelike:` top-up stays as is).
- Server-side run state. Run state is derived client-side from the trail, same as
  `recentTokens` today.

## Design

### Run state machine

The per-card pacing rhythm (`pacingPattern`, `pacingColdOpen`, slot boosts) and the
per-card surprise epsilon (`surpriseEpsilon`, `surpriseEpsilonSchedule`) are
**removed**, replaced by one piece of derived state: `runDepth` — cards since the
last run boundary. Boundaries are: seed, dive, "More like this" branch, adopted
tangent, session re-entry.

Each step:

1. `runDepth < runMinLength` (3): **in-run pick** (below).
2. Else roll `runBreakRamp[runDepth - runMinLength]` = `[0.45, 0.75, 1]`: on
   success, **tangent pick**; on failure, in-run pick. The final `1` makes a break
   at depth 5 unconditional — this is the anti-orbit guarantee.
3. Exception: the first run of a session uses `firstRunLength: 3` as its ramp start
   so a first session reliably meets a tangent by card 4 — guaranteed and framed,
   which replaces the front-loaded surprise schedule's job (probabilistic and
   unframed) of showing what the product is.

### In-run pick: coherence instead of variety

`scoreCandidate` changes within a run:

- Variety penalty **off** (staleness is handled by run termination, dedupe by
  `seenTitles`).
- **Lexical coherence bonus**: `coherenceWeight * tanh(sharedRunTokens / 2)` —
  overlap between candidate tokens and the accumulated tokens of the current run's
  cards (`runTokens`).
- **Category affinity bonus**: `categoryAffinityWeight * tanh(sharedCatTokens / 2)`
  — overlap between the candidate's normalized category tokens and the run's
  accumulated category tokens (`runCategories`). This is the era/region signal:
  "Ancient Roman generals" ∩ "Ancient Rome" keeps Carthage ahead of Christianity.
  Category names are normalized (lowercase, tokenized) and junk-filtered; hidden
  maintenance categories are already excluded at fetch time (`clshow=!hidden`).
- Everything else (relevance, avoidance, specificity, position, politics, image,
  related penalty) unchanged. The politics penalty at -500 dwarfs the bounded
  coherence terms (~2 max each), so coherence cannot pull a run into a dampened
  cluster.

Selection remains softmax over top-K at `temperature: 0.6` — a run should still
breathe, not railroad.

### Tangent pick: the surprise machinery, promoted

The existing surprise pool construction (`surpriseRanked`, `select.ts:82-96`) is
reused nearly verbatim as tangent selection — quality floor, intrigue floor,
political exclusion, hook-boosted softmax at 0.85. Changes:

- It fires **only** at run breaks, with probability from the ramp — never mid-run.
- Scoring at the break step applies the variety penalty **hard against the whole
  run's tokens** (`runTokens` feeds `recentTokens`) and drops the coherence
  bonuses, so the tangent pool is pushed *out* of the neighborhood, not just
  outside top-K.
- **A tangent re-roots.** The next run grows from the tangent card. Today a
  surprise is a detour (next card from the pre-surprise tip) because it fired
  unexpectedly mid-flow; at a structured boundary the break is expected, so the
  detour rationale no longer applies. The dud-tangent risk transfers to a heal
  affordance instead: a fast skip (existing `skipThresholdMs` signal) on a tangent
  card rebuilds from the pre-tangent tip — same client rebuild path as
  `branchFrom`. Default = adopt, skip = heal; this inverts today's default
  (adopt only via "More like this") deliberately.
- Pool too shallow (`< surpriseMinPool`): fall through to an in-run pick **with the
  break-step variety penalty still applied** and reset `runDepth` anyway — the feed
  drifts out of the neighborhood instead of jumping, but never orbits.

### State and wire changes

- `EngineContext` gains `runDepth: number`, `runTokens: Set<string>`,
  `runCategories: Set<string>`; loses nothing (`stepIndex` stays — first-run logic
  and cold-cache paths use it). Clients derive all three from the trail exactly as
  `recentTokens` is derived today; run boundaries are recoverable from stored
  relations, so rehydration reconstructs run state for free.
- `/api/next` context payload gains the three fields (arrays on the wire). The
  fields are additive; `TangentTests` wire-contract fixtures update alongside.
- Trail relation vocabulary is unchanged: tangents keep relation `'surprise'` in
  storage and on the wire (no `trail:v1` migration, no Swift enum change);
  presentation of that relation changes in the experience spec.
- `isDetour` no longer marks steady-state tangents (they re-root); the flag and the
  `#effectiveTip` plumbing are kept for the heal path.

### Config deltas (`config.ts`)

| Knob | From | To |
| --- | --- | --- |
| `varietyPenalty` | -0.45 per-card, always | break-step only, vs `runTokens` |
| `coherenceWeight` | — | 0.9 (sim-tuned) |
| `categoryAffinityWeight` | — | 1.6 (sim-tuned) |
| `runMinLength` / `runBreakRamp` | — | 3 / `[0.45, 0.75, 1]` |
| `firstRunLength` | — | 3 |
| `surpriseEpsilon`, `surpriseEpsilonSchedule` | 0.18, `[0,0,.35…]` | removed |
| `pacingPattern`, `pacingColdOpen`, `pacingBalancedFallback`, slot boosts | 5-slot loop | removed |
| `surprise*` pool knobs (floors, boost, temp, topK, minPool) | unchanged | unchanged (now tangent-only) |

Starting values for the new weights are priors, not conclusions — the sim sweep
picks them, same method as the `relevanceWeight` 2.5→4.0 and `specificityWeight`
1.5→2.0 changes.

## Open questions (resolved with defaults)

| Question | Default |
| --- | --- |
| Tangent adopt-vs-heal default | Adopt (re-root); fast skip heals. Structured boundary removes the mid-flow-yank rationale for detour-by-default. |
| Dwell as an adoption signal | No — only skip (heal) is engagement-conditional; passive dwell must not silently re-root or un-root. |
| Run length distribution | Ramp `[0.45, 0.75, 1]` over depths 3-5; sim may retune but max-5 stays hard. |
| Category token normalization | Lowercase, split on non-word, drop stopwords + bare digits; share `tokens.ts` machinery. |
| Coherence vs relevance interaction | Independent additive terms; if the sim shows liked-token gravity compounding with coherence into bubbles, taper coherence by `1/(1+relevance)` like specificity. |
| Prefetch invalidation on heal | Reuse the `branchFrom` rebuild path; heal is rare (requires a fast skip on a gated tangent). |

## Acceptance criteria

- Vitest over the pure engine: run-depth ramp (break guaranteed at depth 5),
  coherence/category bonuses, break-step variety scope, tangent pool exclusions,
  shallow-pool fall-through resets `runDepth`, first-run tangent by card 4.
- Feed-sim (`scripts/feed-sim/`), adaptive arm vs control, reported as lift with
  noise bounds per repo convention:
  - New **jump-distance metric**: per-step category-Jaccard between consecutive
    cards. Current engine confirmed unimodal before knobs move (diagnosis check);
    new engine shows bimodal separation (low in-run, high at breaks).
  - WWII/authoritarian-cluster landing rate ≤ 1.7% baseline; political-penalty
    fire rate reported.
  - **Neighborhood-escape rate**: fraction of run breaks landing outside the prior
    run's dominant category cluster — the anti-orbit measure.
  - Walk length and on-interest rate do not regress beyond noise vs current engine.
- Web and iOS produce identical picks for identical context (existing parity tests
  extended with run fields).
- `bun run check` and `bun run test` pass; no new dependencies.
