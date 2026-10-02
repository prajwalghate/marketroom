# Marketroom

**Every tokenized equity, across every venue.**

The same ticker can hide very different products. `NVDA` on Hyperliquid is a perpetual
future — leveraged price exposure, no ownership. `NVDAx` on Solana is a custody-backed
token — a redeemable claim on a real share. Marketroom indexes both, side by side, with
live prices and the structural differences made explicit.

Long-term direction: the DexScreener / DefiLlama of on-chain equities.

---

## Quick start

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000.

**No API keys required.** Every data source is a public, unauthenticated endpoint.
`.env` is optional — copy `.env.example` to `.env.local` only to point at different
endpoints or tune cache timings.

Requires Node ≥ 20.11 and pnpm 9.

| Command              | What it does                                                  |
| -------------------- | ------------------------------------------------------------- |
| `pnpm dev`           | Dev server, Turbopack                                         |
| `pnpm build`         | Production build of every package                             |
| `pnpm typecheck`     | `tsc --noEmit` across the workspace                           |
| `pnpm test`          | Vitest across the workspace                                   |
| `pnpm lint`          | ESLint across the workspace                                   |
| `pnpm format`        | Prettier write                                                |
| `pnpm catalog:check` | Fails if the live venue lists a market the catalog is missing |

---

## Architecture

```
apps/web            Next.js 15 App Router — thin, composition only
packages/
  core              Entities + pure derivations. Zero dependencies.
  adapters          ALL network I/O. One adapter per venue.
  catalog           Curated market data. One file per asset.
  ui                Design system — tokens + presentational primitives.
  config            Shared tsconfig / eslint
docs/
  research          Reference teardown, data-source study, proposal
  adr               Architecture decision records
```

**Dependencies point inward.** `web → ui → core`, `web → adapters → core`. `core` imports
nothing. A violation fails CI rather than being caught in review.

### The central model

An **Asset** (the underlying company) is separate from a **Listing** (one tradable claim
on it, on one venue):

```
Asset "NVDA"
 ├── Listing hyperliquid:xyz:NVDA     perp · leveraged exposure · no ownership
 └── Listing solana:Xsc9qvGR…         SPL token · custody-backed · redeemable
```

Everything else follows from that split — cross-venue spreads, aggregate volume, and the
comparison view all exist only because one asset holds many listings. Adding a third
venue means writing one adapter; `core`, the UI and the catalog do not change.

### Why it feels instant

The "no loading spinners" requirement is solved by rendering architecture, not by loading
states:

1. **One poller, many readers.** A single server-side snapshot is cached and fanned out to
   every request. The browser never calls a venue API for shared data.
2. **Server Components paint real numbers.** Prices and charts are in the first HTML
   response — there is no client fetch on the critical path to spin for.
3. **ISR + prefetch.** Every market page is pre-rendered; `next/link` prefetches on hover,
   so navigation is a cache hit.
4. **The websocket only upgrades what is already on screen.** It never gates a render.

---

## Data sources

| Source                 | Provides                                      | Auth |
| ---------------------- | --------------------------------------------- | ---- |
| Hyperliquid `info` API | Universe, prices, OI, funding, OHLCV, L2 book | none |
| Hyperliquid WebSocket  | Live mid prices, trades, book deltas          | none |
| Jupiter token API      | Solana xStocks price, liquidity, FDV, holders | none |
| `packages/catalog`     | Sector, country, identity, editorial, peers   | —    |

> ⚠️ Hyperliquid equity markets live on the **`xyz` perp DEX**, not the default universe.
> Omitting `dex: "xyz"` silently returns 234 crypto markets and zero equities. The adapter
> injects it centrally so this cannot be got wrong at a call site.

Full endpoint study with verified request/response shapes:
[`docs/research/02-data-sources.md`](docs/research/02-data-sources.md).

---

## Working together

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for branching, commits and the merge-conflict
strategy. The short version:

- Trunk-based. `main` is always deployable. Branches live < 2 days.
- `feat/<scope>`, `fix/<scope>`, `chore/<scope>`, `docs/<scope>`
- Conventional Commits, scoped by package: `feat(adapters): add funding rate`
- Squash merge. CI green required.

**The structure is designed so two people rarely touch the same file.** The catalog is one
file per asset; packages have clear owners; routes are thin shells over package logic.

---

## Design system

Tokens live in [`packages/ui/src/tokens.css`](packages/ui/src/tokens.css) — the only place
a raw colour value may appear.

Governing principle: **the data is the only thing allowed to be colourful.** Chrome is
neutral, hairlines are untinted, one restrained accent is reserved for interactive
affordance, and the saturation budget goes to price direction because that is the only
colour carrying meaning. Direction is never signalled by hue alone — every price also
carries a sign and an arrow glyph.

---

## Scope

The MVP is a **pre-trade surface**: live prices, depth, funding, structure, holder rights,
and a deep link out to the venue. It does not place orders. An `ExecutionProvider` seam is
left in `adapters` so live trading can be added without a refactor.

---

## Deploy

Deployed on Vercel from `main`.

### Import (one-time)

[vercel.com/new](https://vercel.com/new) → import the repo → **set Root Directory to
`apps/web`** → Deploy.

That one setting is the whole configuration. Everything else is zero-config: Vercel
detects Next.js, finds `pnpm-workspace.yaml` above the root directory, installs the whole
workspace from there, and builds the app in place.

> **Why `apps/web` and not the repo root.** Vercel's Next.js builder expects to run _in_
> the Next app and find `.next` beside it. Driving it from the repo root with a
> `buildCommand` and `outputDirectory: apps/web/.next` compiles fine and then fails with
> _"The Next.js output directory was not found"_ — the build succeeds and the deploy
> still dies. There is deliberately **no `vercel.json`** in this repo; it was the cause,
> not the cure.

Or from the CLI:

```bash
vercel login
vercel link          # when prompted, set the root directory to apps/web
vercel --prod
```

Once linked, pushes to `main` deploy automatically and every PR gets a preview URL.

### Why no build orchestration is needed

**No workspace package has a build step.** `core`, `ui`, `adapters` and `catalog` ship
TypeScript source and are compiled by Next through `transpilePackages`, so `next build`
alone produces everything. Turborepo still runs `typecheck`, `test` and `contrast` in CI,
but the deploy does not need it.

**No environment variables are required.** Every data source is a public, unauthenticated
endpoint. The vars in `.env.example` only point at alternative endpoints (e.g. a testnet)
or tune the cache, and all have working defaults in code.

### What gets rendered how

| Route               | Mode        |                                                                         |
| ------------------- | ----------- | ----------------------------------------------------------------------- |
| `/`                 | Dynamic     | Reads `searchParams` so a shared filtered link arrives already filtered |
| `/market/[id]`      | SSG         | Every market prerendered at build time                                  |
| `/trends`, `/about` | Static      |                                                                         |
| `/api/snapshot`     | Cached JSON | `s-maxage=15, stale-while-revalidate=60`, set by the route handler      |

`/` being dynamic costs little — the data underneath is the shared cached snapshot, so
filtered links serve in tens of milliseconds rather than hitting an upstream API.

---

## Docs

- [Reference teardown](docs/research/01-reference-teardown.md) — what the reference
  actually was, and why it could not be "rebuilt"
- [Data sources](docs/research/02-data-sources.md) — every endpoint, verified live
- [Proposal](docs/research/03-proposal.md) — stack, structure, decisions
