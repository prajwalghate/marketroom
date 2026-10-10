# ADR 0003 — A connected research database

**Status:** accepted · 2026-10-10

## Context

The research platform (ADR 0002) assembled every page from live upstream
datasets held in a short-lived cache. That made pages fast and data fresh, but
it could not hold anything the upstreams do not: who works at a project, which
announcement backs a round, whether a person checked a fact, that two investor
names are the same firm. Facts were scattered across sources rather than
connected, and nothing on a page said where it came from or when it was
checked.

## Decision

Keep a database of separate records — projects, people, organisations, funding
rounds, tokens, Solana programs, news, events, sources — joined by typed
relationship rows (person ↔ project with a role and dates, investor ↔ round
with a lead flag, project ↔ program as operator or user). Facts carry
**evidence**: a row tying a record, a field of a record, or a relationship to a
source, with how it was obtained (imported, on-chain, inferred, editor) and when
it was checked.

- **Postgres everywhere.** `DATABASE_URL` for a hosted Postgres; without it, an
  embedded Postgres (PGlite) under `apps/web/.data/`, so a fresh checkout runs
  with no setup. One schema (Drizzle), one set of migrations, embedded into the
  bundle (`packages/db/src/migrations.ts`) so a deployment never reads SQL from
  disk.
- **Imports are continuous upkeep, not a one-off load.** Jobs per source, each
  on its own cadence, stalest records first, every run logged. They run when
  pages are read (after the response) and from `/api/cron/upkeep`. A job runs
  on one server at a time: claiming a run is an insert that a unique index
  lets only one server make, so instances waking together on a shared
  database do not import twice.
- **History is kept at the resolution it is read at.** Token prices stay
  15-minute for a week and program activity hourly for two weeks; older
  readings are thinned to the last of each day, and import logs go after 30
  days — so a free hosted Postgres holds years of it.
- **Imports never overwrite people.** Fields an editor sets are locked;
  rejected and merged records stay as tombstones so a re-import cannot
  resurrect them; aliases keep a merged duplicate's name resolving.
- **Funding is announced, not observed.** Rounds come from announcements,
  press, filings, posts and funding databases. On-chain sources cannot evidence
  a round; the write layer refuses them.
- **Estimates say so.** Program activity is estimated from recent transaction
  signatures and labelled with its method everywhere it appears.
- **Inferences are suggestions.** Automatic mappings (program ↔ project by
  repository or label, investor names read as people, news and events matched
  by name) are stored unconfirmed and queued for editors, and pages that show
  them say so. A name the funding import once read as a person is read again on
  every run: if the rules now read it as a firm, and no editor has touched it,
  it becomes an organisation and keeps its rounds.
- **Editors are configured, not registered.** `ADMIN_TOKENS` names them; every
  change is logged with the editor's name and a field-level diff.

## Consequences

- Pages read the database; only market charts still fetch live series — the
  tokenized-asset charts, and daily price candles for project tokens from
  GeckoTerminal, cached for an hour and never stored.
- The embedded database runs on the server's thread. Imports and Turbopack
  compete with page renders in development; production should set
  `DATABASE_URL`.
- Without paid keys, funding rounds cite DefiLlama's record, which often names
  no announcement. Editors attach announcements from the round's edit page;
  until then the round says so.
- Team data from free sources is limited to code contributors on GitHub,
  labelled as such. Founders and executives are entered by editors with the
  source that names them.
- Watchlists and alerts need no accounts: the list lives in the browser, the
  bell and RSS feeds read the update feed.
