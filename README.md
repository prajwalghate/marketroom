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

## Docs

- [Reference teardown](docs/research/01-reference-teardown.md) — what the reference
  actually was, and why it could not be "rebuilt"
- [Data sources](docs/research/02-data-sources.md) — every endpoint, verified live
- [Proposal](docs/research/03-proposal.md) — stack, structure, decisions
