# ADR 0002 — Solana research platform

**Status:** accepted · 2026-10-10

## Context

Marketroom pivots from a tokenized-equities index to a research platform for
the Solana ecosystem: projects, their funding, the investors behind them, and
the market around them. One chain, covered in depth.

## Decision

Build a Solana-only research platform with the page types a researcher
actually uses, under the Marketroom brand, on live public data.

| Route                 | Purpose                                                                 |
| --------------------- | ----------------------------------------------------------------------- |
| `/`                   | Solana market overview: SOL, TVL, stablecoins, volume, fees, funding    |
| `/projects`           | Project database — filter by category, investor, funding, token, status |
| `/projects/[slug]`    | Project profile — metrics, token, funding rounds, investors, peers      |
| `/fundraising`        | Funding-round feed — filter by category, size, round, date              |
| `/investors`          | Investor database — ranked by Solana deals                              |
| `/investors/[slug]`   | Investor profile — portfolio, rounds, deal sizes, co-investors          |
| `/exchanges`          | Solana DEXes by volume and market share                                 |
| `/staking`            | Liquid-staking pools — SOL staked, yield, fees, validators              |
| `/discover`           | Rankings and trending                                                   |
| `/compare`            | Up to four projects side by side                                        |
| `/watchlist`          | A personal watchlist, kept in the browser                               |
| `/api-docs`           | Free, read-only JSON for everything above                               |
| `/calendar`           | Dated events: rounds, listings, unlocks where a free source exists      |
| `/tokenized-assets/…` | The existing tokenized-equities product and its trust check             |

### What it is, and what it is not

It is defined by the **questions it answers and the way it is organised**:
who is building what, who funded it and when, who else those investors back,
what runs on-chain, and what changed — each a page type with its filters and
drill-downs.

It is **not** built from anyone else's brand, written content, proprietary
scores or data. Marketroom keeps its own design system and voice, names its
own metrics, and sources every figure from public APIs it is entitled to use —
and says where each figure came from. No site is scraped and no other
database is republished.

### Data

Live only. No hand-entered market data, no frozen snapshots. Each dataset is
fetched server-side, cached for as long as it plausibly stays true, and dated
on the page. Sources are recorded in `docs/research/03-solana-data-sources.md`.

## Consequences

- Coverage is bounded by public data. Features with no free live source
  (team rosters, social reach) are shown where data exists and omitted, not
  faked, where it does not.
- Adding a chain later is an adapter and a filter, not a rewrite — the same
  property ADR 0001 established for venues.
