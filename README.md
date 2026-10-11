# Marketroom

**Research the Solana ecosystem — every project connected to its team, investors, funding, programs, token and news, each fact with its source.**

Marketroom is a research database for Solana. Projects, people, investor
organisations, funding rounds, tokens, Solana programs, news and events are
separate records joined by typed connections — _this person works at this
project_, _this investor led this round_, _this project operates this
program_ — so every name on a profile links to its own profile. Every fact
carries its source and the date it was checked; funding comes only from
announcements and funding databases, never from on-chain transfers; on-chain
activity is labelled as the estimate it is. Imports keep it current; editors
keep it correct.

Profiles read like a terminal, not a table dump: price candles for a project's
token, value-locked history, funding and event timelines, investment maps,
round-size and deal charts, a section rail that follows you down the page, and
a header search that groups every match by type with counts. Charts draw their
colour from a fixed data palette, and every chart also ships its numbers as a
table for screen readers.

| Section          | What it answers                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| Overview         | SOL, value locked, stablecoins, volume, fees; funding by category and month; latest rounds; top investors |
| Projects         | What every Solana project does, its category, status, latest funding, activity, checks                    |
| Project profiles | Price candles, value locked, tokens, team, events and funding timelines, investors, programs, sources     |
| People           | Founders, team, angels and partners, connected to their projects, rounds and organisations                |
| Investors        | Investment map, round sizes led or joined, deals per year, portfolio, co-investors                        |
| Rounds           | Amount, date, type, valuation, investors — and which source states each fact                              |
| Programs         | Solana programs, who runs them, upgradeability, verified builds, estimated activity                       |
| Tokens           | Market snapshots from the provider, with the provider's time and ours                                     |
| Fundraising      | Every disclosed round, by type, size, category, year and investor, with trend charts                      |
| Calendar         | A week strip, then rounds as announced, launches, milestones, incidents, conferences, hackathons          |
| Rankings         | The same records, ordered: value locked, funding, activity, deals, round size                             |
| Search           | Projects, tokens, investors, people and programs from the header, by name, ticker or address              |
| Updates & alerts | What changed — in the header bell for watched records, and as RSS feeds                                   |
| Watchlist        | Projects, people, investors and tokens you follow, kept in your browser                                   |
| API              | Free, read-only JSON for all of it, with sources and checked dates                                        |
| Editors          | `/admin`: review queue, corrections, sources, duplicates, imports, change log                             |
| Tokenized Assets | Tokenized equities across venues, with the trust check on every listing                                   |

How the database works, for readers: `/method`. The decision record:
[docs/adr/0003-connected-research-database.md](docs/adr/0003-connected-research-database.md).
Sources and their limits: [docs/research/03-solana-data-sources.md](docs/research/03-solana-data-sources.md).

---

## Quick start

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000.

**No API keys and no database to install.** Without `DATABASE_URL`, the app keeps an
embedded Postgres (PGlite) in `apps/web/.data/` and fills it on first visit: projects
and token markets within a minute, funding, programs, news and events over the next
few minutes. The editors' dashboard at `/admin` is open in development; set
`ADMIN_TOKENS` to require sign-in (production requires it).

Imports run in the background while you browse. For UI work, `MARKETROOM_UPKEEP=off pnpm dev`
keeps the dev server quiet by leaving the schedule to `/api/cron/upkeep`.

For production, set `DATABASE_URL` to a Postgres database — migrations run on start.
Optional keys add coverage: `DEFILLAMA_API_KEY` (the complete funding feed),
`GITHUB_TOKEN` (more contributors per hour), `COINGECKO_API_KEY` (all-time highs) — see
`.env.example`.

Requires Node ≥ 20.11 and pnpm 9.

| Command                                 | What it does                                                  |
| --------------------------------------- | ------------------------------------------------------------- |
| `pnpm dev`                              | Dev server, Turbopack                                         |
| `pnpm build`                            | Production build of every package                             |
| `pnpm typecheck`                        | `tsc --noEmit` across the workspace                           |
| `pnpm test`                             | Vitest across the workspace                                   |
| `pnpm lint`                             | ESLint across the workspace                                   |
| `pnpm format`                           | Prettier write                                                |
| `pnpm catalog:check`                    | Fails if the live venue lists a market the catalog is missing |
| `pnpm contrast`                         | Measures every token pairing against WCAG contrast            |
| `pnpm a11y`                             | axe plus keyboard and focus checks against a running server   |
| `pnpm --filter @marketroom/db generate` | SQL migration from a schema change, embedded for runtime      |

---

## Architecture

```
apps/web            Next.js 15 App Router — thin, composition only
  components/charts Chart kit: sparklines, pies, bars, columns, candles
packages/
  core              Entities + pure derivations. Zero dependencies.
  adapters          ALL network I/O. One adapter per venue or data source.
  db                The research database: schema, migrations, imports, reads
  catalog           Curated market data. One file per asset.
  ui                Design system — tokens + presentational primitives.
  config            Shared tsconfig / eslint
docs/
  research          Data-source studies and the architecture
  adr               Architecture decision records
```

**Dependencies point inward.** `web → ui → core`, `web → adapters → core`,
`web → db → adapters → core`. `core` imports nothing. A violation fails CI rather than
being caught in review.

### Tokenized assets: the central model

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

The research database, all public and free by default:

| Source                   | Provides                                                                 | Auth     |
| ------------------------ | ------------------------------------------------------------------------ | -------- |
| DefiLlama                | Projects, categories, value locked, fees; funding rounds; incidents      | optional |
| Jupiter                  | Token price, market cap, volume, liquidity, holders; swap-program labels | none     |
| GeckoTerminal            | Daily price candles from a token's deepest Solana pool                   | none     |
| OtterSec verified builds | Which programs were reproduced from public source                        | none     |
| Solana RPC               | Program loader, upgrade authority, last deploy, activity estimates       | none     |
| GitHub                   | Organisations and the people committing to a project's repositories      | optional |
| News feeds, solana.com   | Headlines and summaries; conferences, hackathons and meetups             | none     |

Cadences, limits and the paid upgrade path:
[`docs/research/03-solana-data-sources.md`](docs/research/03-solana-data-sources.md).

The tokenized-assets section:

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
[`docs/research/01-data-sources.md`](docs/research/01-data-sources.md).

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
affordance, and the saturation budget goes to data: price direction, and an eight-hue
data palette (`--mr-data-1…8`) for categories and chart series, each hue measured at 3:1
against both card surfaces. Direction is never signalled by hue alone — every price also
carries a sign and an arrow glyph — and every chart has a table behind it.

Motion is opt-out: the price strip under the header scrolls on its own, pauses under the
pointer and on focus, has a pause button that is remembered, and stays still for anyone
who asks the system for reduced motion. The theme follows the operating system until the
reader picks one.

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
> still dies. The only `vercel.json` is `apps/web/vercel.json`, and it holds nothing but
> the daily upkeep cron: no build settings.

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

**No environment variable is required to deploy**, but three make production what it
should be:

| Variable       | Without it                                                                                                                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | Each server instance keeps its own embedded database in `/tmp` and rebuilds it from the public sources after a cold start — a working demo, not a database. Any Postgres works; adding Neon from the Vercel Marketplace sets it for you. |
| `ADMIN_TOKENS` | The editors' dashboard does not exist in production.                                                                                                                                                                                     |
| `CRON_SECRET`  | `/api/cron/upkeep` refuses every call, so imports run only when pages are read.                                                                                                                                                          |

Every data source is public; the optional keys in `.env.example` add coverage.

### Running in public

The repository is public, so the deployment assumes everyone can read its code:

- **No secret lives in git.** Credentials exist only as Vercel environment variables; `.env*`
  files and `.vercel/` are ignored. Pull requests from forks wait for a maintainer's
  approval before Vercel builds them (Git Fork Protection), so a stranger's code never
  runs with the project's environment. Preview deployments need a Vercel login.
- **Writes need a credential.** Without `ADMIN_TOKENS` the editors' dashboard does not
  exist on any deployment, and every editing action checks the editor on the server;
  `/api/cron/upkeep` refuses every call without `CRON_SECRET`. Secrets are compared in
  constant time.
- **Public pages cannot be used to spend upstream quota.** Imports run on their own
  schedule, one server at a time, however many visitors arrive; live token pages exist
  only for tokens already in the site's market data, so an arbitrary address is a 404,
  not an API call; input reaches Postgres only as bound parameters, or as integers checked first.
- **Headers.** No site may frame it (`frame-ancestors 'none'`), content types are not
  sniffed, and the dashboard is never indexed.
- **Nothing to bill.** Vercel Hobby and Neon Free carry no payment method, so traffic,
  however heavy, can exhaust a free quota but not run up a bill; Vercel's platform
  DDoS mitigation applies on every plan.

### What gets rendered how

| Route                                   | Mode    |                                                                         |
| --------------------------------------- | ------- | ----------------------------------------------------------------------- |
| `/`, `/projects`, profiles, directories | Dynamic | Read from the research database through a one-minute in-process cache   |
| `/tokenized-assets`                     | Dynamic | Reads `searchParams` so a shared filtered link arrives already filtered |
| `/market/[id]`                          | SSG     | Every market prerendered at build time                                  |
| `/method`, `/about`, `/api-docs`        | Static  |                                                                         |
| `/api/v1/*`                             | JSON    | Cached briefly at the edge; every record carries its sources            |
| `/api/cron/upkeep`                      | Cron    | Daily, from `apps/web/vercel.json`, with `CRON_SECRET`                  |

---

## Docs

- [Data sources](docs/research/01-data-sources.md) — every endpoint, verified live
- [Architecture](docs/research/02-architecture.md) — stack, structure, decisions
- [ADR 0001](docs/adr/0001-asset-listing-split.md) — why Asset and Listing are separate
- [ADR 0002](docs/adr/0002-solana-research-platform.md) — the Solana research platform and its routes
- [ADR 0003](docs/adr/0003-connected-research-database.md) — the connected research database, evidence and upkeep
- [Solana data sources](docs/research/03-solana-data-sources.md) — what powers each figure, cadences, paid upgrade path

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branching model, commit convention and the
CI gates a change has to clear. Three of those gates exist because the normal pipeline
cannot catch what they catch: `pnpm contrast` (token contrast ratios, measured over
composited surfaces), `pnpm links:check` (every outbound issuer and venue link) and
`pnpm a11y` (axe plus keyboard and focus checks).

## Disclaimer

Marketroom aggregates public market data and is not affiliated with Hyperliquid,
trade[XYZ], Backed Finance or any issuer. Nothing here is investment advice. Perpetual
futures confer leveraged price exposure, not ownership; tokenized equities carry issuer,
custody and redemption risk. Figures come from third-party venue APIs and may be stale,
thin or wrong — verify every number at the source before acting on it. Research records
(funding, people, programs) are imported from public sources and say which; activity
figures are estimates and are labelled as such.

## License

[MIT](LICENSE) © 2026 Prajwal Ghate
