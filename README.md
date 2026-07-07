# tangent

A Wikipedia rabbit hole feed, live at [tangent.page](https://tangent.page). Scroll a
feed of article cards where each one shows **why** it connects to the last — "linked
from", "related to", or a surprise "tangent". The connective tissue between articles
is the whole point.

No bundled dataset: articles are fetched live from the Wikipedia API and cached hard,
so there's nothing to download and the feed stays current.

## Stack

- **SvelteKit** + **Svelte 5 runes** + **TypeScript** (strict)
- **Tailwind CSS 4** (`@tailwindcss/vite`)
- **Cloudflare Workers** target (`adapter-cloudflare`) — develop locally first
- Wikipedia **REST** API (summaries/images) + **Action** API (links, related, search)

## Develop

```bash
bun install
bun run dev    # http://localhost:5173
```

Other scripts: `bun run check` (svelte-check), `bun run test` (vitest), `bun run build`.

## How it works

```
/start  ──pick a seed──▶  /?seed=Title  ──▶  feed
```

1. **Seed** — a curated topic, a search result, or "Surprise me" (curated, because
   `list=random` returns mostly obscure stubs).
2. **Advance** — for the current article, `GET /api/links` returns candidate next
   steps via the Action API `generator=links` (one call enriches links with image +
   description). Sparse articles fall back to `morelike:` related pages.
3. **Choose** — the pure feed engine (`src/lib/feed/`) scores candidates by relevance
   (overlap with the user's liked-token interest vector), penalizes monotony, only
   lightly prefers illustrated cards, and fires a **surprise** epsilon for serendipity —
   front-loaded across the opening cards (after a calm first hop), which also pace
   hooks ahead of continuity, so a first session shows what the product is early.
   Selection is a softmax-weighted pick among the top scorers, not a robotic argmax.
4. **Render** — the chosen article's full summary extract leads the card as its hook,
   with a breadcrumb explaining the connection and the image demoted to a small inset.
   The next few cards are prefetched so scrolling stays smooth.

Engagement (likes, dwell time, clickthroughs) lives in `localStorage` and feeds the
interest vector. Tunable knobs live in `src/lib/feed/config.ts`.

### Layout

```
src/lib/
  wikipedia/   client + REST/Action wrappers + types   (server-side fetching)
  server/      in-memory TTL cache
  feed/        pure engine: config, tokens, score, select + client feedState
  engagement/  localStorage interest profile (runes)
  components/   ArticleCard, ConnectionBreadcrumb, SkeletonCard, BrandMark
src/routes/
  +page.svelte         the feed (infinite scroll, prefetch, branching)
  start/+page.svelte   seed selection (search + curated topics)
  api/{card,links,search}/  cached Wikipedia proxies
```

## Notes

- Wikipedia asks for a descriptive `User-Agent`; set in `src/lib/wikipedia/client.ts`.
- The REST `related` endpoint is gone (404) — `morelike:` search is the stand-in.
