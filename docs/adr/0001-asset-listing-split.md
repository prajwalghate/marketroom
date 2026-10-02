# ADR 0001 — Separate `Asset` from `Listing`

**Status:** Accepted · **Date:** 2026-10-03

## Context

Marketroom indexes tokenized equities across venues. The initial reference
implementation modelled one row as one market on one venue — ticker, sector, price.

That model cannot express the thing the product exists to show. `NVDA` is listed twice:

- on Hyperliquid as a **perpetual future** — leveraged price exposure, no ownership, no
  dividends, liquidatable;
- on Solana as **NVDAx**, a **custody-backed token** — a redeemable claim on a real share
  held by an issuer.

Same ticker. Same underlying company. Structurally different products with different risk.
A flat model forces a choice between showing one and hiding the other, or showing both as
unrelated rows.

The stated long-term direction — "the DexScreener or DefiLlama of on-chain stocks" — is an
aggregator, and an aggregator cannot be built on a single-venue row.

## Decision

Split the central entity in two.

```
Asset                  the underlying company or instrument — venue-independent
 └── Listing[]         one tradable claim on it, on one venue
      ├── hyperliquid:xyz:NVDA
      └── solana:Xsc9qvGR…
```

- **Asset** holds identity: name, sector, country, editorial, peers, P/E.
- **Listing** holds venue-specific facts: instrument kind, leverage, holder rights, issuer,
  trade URL.
- **Quote** attaches live market data to a listing, never to an asset.

Venues are reached through a `VenueAdapter` interface that declares its own
`capabilities`, because venues genuinely differ — Hyperliquid serves OHLCV and an order
book, Jupiter serves pool liquidity and holder counts.

## Consequences

**Good**

- Cross-venue derivations become expressible at all: aggregate volume, volume-weighted
  consolidated price, and the venue spread. None exist in a flat model.
- Holder rights sit next to the price, so the perp/token distinction is structural rather
  than a disclaimer someone can skip.
- Adding a venue is one adapter plus catalog mappings. `core`, `ui` and the routes do not
  change.
- The UI can render honestly per venue instead of showing a column of dashes for metrics a
  venue does not publish.

**Costs**

- Every list view must pick a representative listing. `primaryListing()` resolves this by
  24h volume, with fallbacks so an asset is never dropped when venues are quiet.
- The catalog must map venue symbols to canonical ids by hand. Venue tickers do not match
  display tickers (`SKHX`, `SMSN`, `CL`), and on Solana only the mint address is a safe
  identifier — a symbol search returns impostor tokens.
- Two listings can be mapped to one asset in error. This bit us immediately: `sp500` (index
  level ≈ $7,193) was mapped to `SPYx` (an ETF share ≈ $769), which rendered as a 983%
  arbitrage opportunity. Mitigated two ways — the mapping was removed, and `venueSpread()`
  now suppresses gaps above 50% as mapping errors rather than reporting them as signal.

## Alternatives considered

**Keep the flat model, add a `venue` field.** Rejected: it makes the same company appear as
unrelated rows, and no cross-venue metric can be computed.

**One asset, one "best" listing, hide the rest.** Rejected: hiding the structural
difference is the opposite of the product's purpose.

**Normalise every venue into one synthetic instrument.** Rejected: it would imply a perp
and a custody-backed token are interchangeable, which is the exact conflation the product
exists to prevent.
