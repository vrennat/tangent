# feed-sim — rabbit-hole journey simulator

A standalone evaluation harness for the feed algorithm. It drives the **real shipped
engine** (`fetchExploreCandidates` → `selectNext` → `buildEngineContext`) over live
Wikipedia, replicating the web client's traversal (`feedState.more` / `#context` /
`#effectiveTip`) and the engagement-profile update logic (`profile.svelte.ts`), so the
numbers reflect production behaviour rather than a reimplementation.

It answers two questions:

1. **Does selective engagement shape the feed toward what the user reads?** — runs an
   _adaptive_ arm (a synthetic reader dwells on / likes on-topic cards, skips off-topic)
   against a no-learning _control_ arm; the lift is `adaptive − control`, which nets out
   topical locality (both arms share it and the same classifier).
2. **How often does a walk drift into the Hitler / Nazi cluster, and why?** — tallies
   cluster landings and logs the full `scoreCandidate` term breakdown at each, so you can
   see exactly which signal pulled it there and whether `isPolitical` fired.

## Run

Requires [bun](https://bun.sh). From this directory:

```sh
bun run sim.ts validate          # ~15 walks from German-history seeds — sanity check the cluster is reachable
bun run sim.ts main 30           # full grid: 660 walks (cold-start + 5 personas × adaptive/control), maxLen 30
bun run analyze.ts main          # aggregate results-main.json → report-main.md (+ stdout)
bun run jumpdist.ts main         # consecutive-card jump-distance report → report-jumpdist-main.md
bun run compare.ts               # diff results-baseline.json vs results-main.json (save a baseline first: cp results-main.json results-baseline.json)
bun run diag.ts "Adolf Hitler"   # inspect how the scorer sees specific cached pages
```

## Notes

- **Live Wikipedia.** First run is slow (one Action-API round trip per new article,
  with retry+backoff for 429s). Results are memoized to `cache.json` (gitignored) keyed
  by title and independent of scoring, so re-runs after a config change are fast — only
  newly-reached titles fetch. Delete `cache.json` to force a cold rebuild.
- **Deterministic.** Each journey seeds two `mulberry32` streams (engine + behaviour)
  from `seed|persona|arm|rngSeed`, so runs reproduce. Tune the seed list / personas /
  engagement probabilities at the bottom of `sim.ts`.
- **Imports the engine by relative path** (`../../src/lib/...`) so it runs under plain
  `bun` without a `svelte-kit sync` / `$lib` alias step. It lives outside the tsconfig
  `include` globs, so `bun run check` and the test suite ignore it.
- **Caveat:** the engagement probabilities and the `tasteAffinity`-based on-interest
  classifier are modelling assumptions — read the adaptive-vs-control _lift_ (with its
  CI and n), not the absolute on-interest rate, as the robust signal.

## What it found (2026-07-16): jump distance

`jumpdist.ts` measures reader-felt topical jump between consecutively shown cards
(category Jaccard, era/region-aware category-token Jaccard, lexical Jaccard), run
against the full grid (660 journeys, 18,379 transitions) as the diagnosis gate for
`docs/specs/2026-07-16-run-based-feed-design.md`:

- **The felt-jump distribution is unimodal with no close/far separation.** A normal
  top-K pick and a deliberate surprise are the same felt size on every lens
  (cat-token mean 0.113 [CI 0.109–0.116] vs 0.124 [0.113–0.135]; lexical 0.102
  [0.100–0.104] vs 0.093 [0.087–0.099]; direction inconsistent across lenses).
  Median exact-category overlap between consecutive cards is **zero** — "one link
  hop" is not topical closeness. This confirms the spec's premise directly.
- **The single farthest jump in the system is the unframed snap-back after a
  detour.** Post-surprise transitions (next card built from the pre-surprise tip)
  are the most distant on all three lenses (lexical 0.049 [0.044–0.054] vs 0.102
  normal) and nothing in the UI explains them. At the steady 18% epsilon, ~1 in 6
  cards is followed by one. The run model's re-root-at-boundary design removes
  this class of jump entirely (heals excepted).
- **Candidate categories are truncated at fetch.** Only 63% of served cards carry
  a non-hidden category; cache-wide, empty-category rate climbs from 18% at
  candidate index 0 to 67% at index 49 (0 of 10,336 parents all-empty — a
  per-request membership budget exhausting mid-batch, not a schema artifact).
  Root cause, verified live: with `clshow=!hidden`, an exhausted category scan
  reports `batchcomplete` and offers NO continuation — silent truncation. Fixed
  in `action.ts` (2026-07-16) with a dedicated chunked category pass using
  `clprop=hidden` + client-side filtering; `enrich-categories.ts` backfills the
  sim cache to match.

## What it found (2026-06-13)

Diagnosed two issues, both fixed in `e227f39`:

- The `−500` political penalty was **~0% effective** against the WWII/Nazi attractor
  (fired on 0 of 337 cluster landings — real candidates carry no electoral stem). Adding
  `AUTHORITARIAN_STEMS` cut cold-start any-cluster drift **20% → 1.7%** and the Hitler/Nazi
  core **3.3% → 0%**.
- Implicit engagement learning shaped the feed only weakly at `relevanceWeight 2.5`
  (pooled lift +1.2%, within noise). Raising it to `4.0` lifted it to **+6.5%** (now
  separated from control) with healthier, longer walks. science/tech stay flat — a
  link-graph topology limit, not a scoring one.
