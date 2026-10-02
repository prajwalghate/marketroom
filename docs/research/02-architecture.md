# Marketroom — Architecture

**Status:** ✅ implemented
**Depends on:** [`01-data-sources.md`](./01-data-sources.md)

---

## 1. Tech stack

| Layer        | Choice                                                                 | Why this one                                                                                                                                                                                        |
| ------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework    | **Next.js 15, App Router**                                             | RSC lets us server-render live prices into the first paint — the "no spinners" requirement is a rendering-architecture decision, not a loading-state decision. Deploys to Vercel with ISR for free. |
| Language     | **TypeScript, `strict`**                                               | The API returns stringly-typed numerics everywhere; types are what stop that leaking into the UI.                                                                                                   |
| Styling      | **Tailwind v4 + CSS custom properties**                                | v4's `@theme` makes design tokens first-class CSS vars. Tokens live in one file; components never name a raw color. Directly addresses the palette brief.                                           |
| Primitives   | **Radix UI**                                                           | Unstyled + accessible. We own 100% of the visual layer — no fighting a theme.                                                                                                                       |
| Charts       | **`lightweight-charts`** (TradingView)                                 | 45 KB, canvas, built for streaming OHLCV. Recharts/Chart.js are SVG and will drop frames on live candles.                                                                                           |
| Server cache | **Next `unstable_cache` + Vercel Data Cache**                          | One poller → cached snapshot → fanned out to every client. No per-browser API hits.                                                                                                                 |
| Client state | **TanStack Query + `useSyncExternalStore`**                            | Query for request/response; the external store for the WS firehose — it batches outside React, which is what keeps 129 live tickers from melting the page.                                          |
| Validation   | **Zod** at the adapter boundary only                                   | Parse once, at the edge. Everything downstream is a typed `Market`.                                                                                                                                 |
| Tests        | **Vitest** + **Playwright**                                            | Vitest for adapters/derivations (where the real bugs are). Playwright for the two critical paths.                                                                                                   |
| Tooling      | **pnpm workspaces + Turborepo**, ESLint, Prettier, Husky + lint-staged | Workspace boundaries are the merge-conflict firewall (see §3).                                                                                                                                      |
| CI/CD        | **GitHub Actions + Vercel preview deploys**                            | Every PR gets a live URL.                                                                                                                                                                           |

**Deliberately excluded for MVP:** no database (the catalog is in-repo and git-versioned —
a DB adds ops burden and solves nothing we have), no auth, no order placement (see
`01-data-sources.md` §3).

---

## 2. Repository structure

pnpm monorepo. The split is chosen so that **two people can work all day without touching
the same file.**

```
marketroom/
├── apps/
│   └── web/                        # Next.js app — thin; composition only
│       ├── app/
│       │   ├── (index)/page.tsx            # market index
│       │   ├── market/[id]/page.tsx        # detail + chart
│       │   ├── trends/page.tsx             # movers, sector heatmap
│       │   ├── api/snapshot/route.ts       # cached fan-out
│       │   └── layout.tsx
│       └── components/             # app-specific composition
│
├── packages/
│   ├── core/                       # ⬅ entities + derivations. Pure, zero deps.
│   │   └── src/{market,price,derive,types}.ts
│   ├── adapters/                   # ⬅ ALL network I/O lives here, nowhere else
│   │   └── src/
│   │       ├── venue.ts                    # VenueAdapter interface
│   │       ├── hyperliquid/{rest,ws,map}.ts
│   │       └── solana/                     # phase 2
│   ├── catalog/                    # ⬅ curated data — one file per market
│   │   └── src/markets/{nvda,skhx,gold,…}.ts
│   ├── ui/                         # ⬅ design system. Tokens + primitives.
│   │   └── src/{tokens.css,Button,Card,Sparkline,…}
│   └── config/                     # shared tsconfig / eslint / tailwind preset
│
├── docs/
│   ├── research/                   # ⬅ this research (deliverable 1)
│   └── adr/                        # architecture decision records
└── .github/workflows/ci.yml
```

**The one rule that makes this work:** dependencies point inward.
`web → ui → core` and `web → adapters → core`. `core` imports nothing.
`catalog` is pure data. Enforced by ESLint `no-restricted-imports`, so a violation fails CI
rather than being caught in review.

---

## 3. How this prevents merge pain

The brief asks for modular boundaries so merges stay simple. Concretely:

| Risk                              | Structural fix                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Both editing one giant data file  | **One file per market** in `catalog/`. Adding NVDA and GOLD touches two different files. Zero conflicts.                  |
| Both editing one giant stylesheet | Tokens in `ui/src/tokens.css` (rarely changes, both read it); every component owns its own file.                          |
| Both editing route files          | Routes are thin shells. Logic lives in packages, so work lands in separate package files.                                 |
| `pnpm-lock.yaml` conflicts        | Lockfile churn is the #1 silent conflict in JS monorepos. Rule: dependency changes go in their own small PR, merged fast. |
| Hidden coupling via shared types  | `core` is append-mostly. New fields are added, not reshaped.                                                              |
| Long-lived divergent branches     | Trunk-based, branches < 2 days (see §4).                                                                                  |

**Suggested ownership split** (not binding, just the lowest-friction seam):

| You                                                | Your partner                              |
| -------------------------------------------------- | ----------------------------------------- |
| `adapters/` — REST, WS, mapping                    | `ui/` — design system, tokens, primitives |
| `core/` — entities, derivations                    | `web/app/` — routes, layout, composition  |
| `api/snapshot`, caching                            | `trends/`, charts                         |
| Shared: `catalog/` — one file each, never collides |

---

## 4. Git & collaboration

**Trunk-based, short-lived branches, squash merges.** Git Flow is overkill for two people
on a hackathon clock and its long-lived branches cause exactly the merge pain we're
avoiding.

```
main                 always deployable; protected; squash-merge only
└── feat/<scope>     short-lived, < 2 days
    fix/<scope>  chore/<scope>  docs/<scope>
```

- **Commits:** Conventional Commits — `feat(adapters): add candle normalization`.
  Scope = package name, so `git log` reads as a map of the repo.
- **PRs:** small, one concern, self-reviewed first. CI green required. Preview URL auto-posted.
  With two people, review is a ~5-minute sanity pass, not a gate.
- **CI on every PR:** typecheck → lint → test → build → catalog-coverage check.
- **Protection on `main`:** no force-push, CI must pass, linear history.
- **Env:** `.env.example` committed, `.env.local` gitignored. (MVP needs no secrets at all —
  every data source is unauthenticated. `.env` exists only for optional tuning.)

---

## 5. Design system direction

Answering the "too vibrant, use restrained color with managed tokens" brief, informed by
the measured teardown in `01` §5.

**Principle: the data is the only thing allowed to be colorful.** Chrome is neutral.

- **Neutral ramp.** A near-neutral surface ramp with _real_ luminance separation, so depth
  comes from surfaces rather than glowing borders. **Hairlines untinted** — this alone kills
  most of the visual hum dense financial UIs suffer from.
- **One accent, used sparingly** — interactive affordance and focus only. Not borders, not
  labels, not values, not decoration.
- **Semantic price tokens** — `up` / `down` / `flat`, desaturated well below the
  reference's mint. They carry meaning, so they get the saturation budget, and nothing else
  competes with them.
- **Never hue alone.** Direction is reinforced by sign (`+`/`−`) and arrow glyph — required
  for red/green color blindness, which is ~8% of men and unavoidable in a finance UI.
- **Tabular numerals** throughout. Digits must not jitter when a price ticks.
- **Tokens only.** Zero raw hex outside `tokens.css`; a lint rule enforces it.
- Light + dark from the same token contract.

---

## 6. Build plan

| Phase | Deliverable                                                             |
| ----- | ----------------------------------------------------------------------- |
| ✅ 0  | Research docs (`01`, `02`, this)                                        |
| 1     | Scaffold: monorepo, CI, design tokens, git protection                   |
| 2     | `core` + `adapters`: REST, mapping, derivations, cached snapshot route  |
| 3     | Index page: full universe, live prices, search/filter/sort, virtualized |
| 4     | Detail page: chart, book, stats, catalog context, routable deep link    |
| 5     | Trends: movers, sector heatmap, OI/volume leaders                       |
| 6     | WS live layer, share card, polish, a11y pass                            |

Phases 3–5 are parallelizable across two people once phase 2 lands.

---

## 7. Open decisions — need your call

1. **Venue:** Hyperliquid-first with Solana as phase 2? (recommended — `02` §5)
2. **Trading:** pre-trade surface + deep-link out for MVP, live orders as a later phase?
   (recommended — `02` §3)
3. **Scope conflict:** your handwritten note says Solana / read-only / mobile; the typed
   brief says Hyperliquid / trading / desktop. Which is the real target?
4. **Catalog depth:** all 129 live markets at launch, or the ~62 equities first with
   indices/commodities/FX following?

---

## 8. ✅ Decisions — signed off 2026-10-03

| Decision      | Outcome                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| **Venue**     | **Multi-venue from day one: Hyperliquid + Solana.**                         |
| **Trading**   | Pre-trade surface + deep-link out. `ExecutionProvider` seam left for later. |
| **Stack**     | Approved as proposed (§1).                                                  |
| **Branching** | Approved as proposed (§4). Local git now; remote at your discretion.        |

### The stated long-term vision changes the core model

> _"hyperliquid + solana — longer vision is dexscreener or defillama of stocks on chain"_

That is an **aggregator**, and an aggregator cannot be built on a single-venue data model
where one row = one market. We need one row = **one company, listed on many venues**. So
the central entity splits in two:

```
Asset                        the underlying company/instrument — NVDA
 └── Listing[]               a tradable claim on it, on one venue
      ├── hyperliquid:xyz:NVDA     perp · leveraged price exposure · no ownership
      └── solana:NVDAx             SPL token · custody-backed · redeemable
```

Everything hangs off that split:

- **Asset-level** — company identity, sector, country, editorial, peers. Venue-independent.
- **Listing-level** — price, volume, liquidity, OI, funding, structure, holder rights.
  Venue-specific, supplied by a `VenueAdapter`.
- **Cross-venue derivations** — best price, aggregate volume, **spread between venues**,
  structural diff. These are only possible because of the split, and they are the product.

This is exactly the DexScreener shape (one token, many pools) and the DefiLlama shape (one
protocol, many chains) — applied to equities. Adding a third venue later becomes _"write an
adapter + map tickers"_, with no change to `core`, the UI, or the catalog.

It also resolves the brief conflict rather than picking a side: the brand page's thesis —
_"the same ticker can hide very different products: share ownership, a custody-backed token,
or price exposure"_ — stops being a disclaimer and becomes the **primary comparison view**.
