# Solana research platform — data sources

Verified live on 2026-10-10. Every figure the platform shows comes from one of
these, is cached server-side on the cadence below, and is dated on the page.

## In use

| Data                        | Source                                                                               | Auth | Cadence | Notes                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------ | ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Projects (≈345)             | DefiLlama `/protocols` + `/lite/protocols2`                                          | none | 1 h     | Solana protocols; product lines rolled up under their parent; `CEX` custody wallets excluded.                                              |
| Project detail              | DefiLlama `/updatedProtocol/{slug}`                                                  | none | 1 h     | TVL history on Solana, funding rounds, milestones, incidents, audit links. 0.3–3 MB each.                                                  |
| Funding rounds (default)    | the `raises` inside each project's detail                                            | none | 12 h    | ≈147 rounds / ≈500 investors; DeFi projects only, since rounds are linked to protocols DefiLlama tracks. Assembled in six cached slices.   |
| Funding rounds (complete)   | DefiLlama API plan `/api/raises`                                                     | key  | 6 h     | Used when `DEFILLAMA_API_KEY` is set. One request; includes projects with no TVL.                                                          |
| Chain TVL                   | DefiLlama `/v2/historicalChainTvl/Solana`                                            | none | 15 min  |                                                                                                                                            |
| Stablecoins                 | `stablecoins.llama.fi/stablecoincharts/Solana`                                       | none | 15 min  |                                                                                                                                            |
| Fees / revenue / DEX volume | DefiLlama `/overview/{fees,dexs}/solana`                                             | none | 15 min  | Per-protocol, Solana only.                                                                                                                 |
| Token markets               | Jupiter `lite-api.jup.ag/tokens/v2`                                                  | none | 5 min   | By mint; plus `toptrending`, `toptraded`, `toporganicscore` lists. Holders, liquidity, organic score.                                      |
| Token history (optional)    | CoinGecko `/coins/markets`                                                           | key  | 5 min   | ATH and 7-day sparkline, only when `COINGECKO_API_KEY` is set.                                                                             |
| Daily price candles         | GeckoTerminal `/networks/solana/tokens/{mint}/pools`, then `/pools/{pool}/ohlcv/day` | none | 1 h     | The token's deepest Solana pool by reserves; about 180 daily candles. Labelled on the chart as one pool's trades, not a cross-venue price. |
| Sentiment                   | alternative.me Fear & Greed                                                          | none | 1 h     | Market-wide, labelled as such.                                                                                                             |
| Liquid staking              | Solana Compass `/api/v1/lsts?offset=N&limit=50`                                      | none | 1 h     | 217 pools; fees as numerator/denominator pairs; credited on the page as they ask.                                                          |

Project ↔ token joins use the Solana mint DefiLlama records (`address:
"solana:<mint>"`), not names — 148 projects carry one.

## Ruled out, and why

- **DefiLlama `/raises` (free)** — now HTTP 402. The paid plan is $300/month and
  also unlocks `/api/emissions` (token unlocks).
- **CoinGecko keyless** — HTTP 429 within a handful of calls. Never called
  without a key.
- **Token unlocks via Streamflow** — the public API works, but for JUP it lists
  four small third-party locks, not the team or investor schedule. Showing
  those as "JUP unlocks" would mislead, so unlocks wait for the paid emissions
  API.
- **DefiLlama's dataset host** (`defillama-datasets.llama.fi`) still serves the
  emissions data the paid API sells. It is undocumented and sidesteps the
  paywall; we are not entitled to it and do not use it.
- **Scraping any site** — not done, for any source.

## Paid upgrade path

1. **DefiLlama API plan, $300/month** — complete Solana funding feed and token
   unlocks on one key. Set `DEFILLAMA_API_KEY`; funding switches automatically.
2. **CoinGecko demo key, free** — all-time highs and sparklines. Set
   `COINGECKO_API_KEY`.
3. Optional: a GitHub token (5,000 req/h vs 60 unauthenticated) would enable a
   developer-activity signal; not built yet.

## Operational notes

- Expensive assemblies (project list, funding, markets, events) are
  single-flight: concurrent requests on a cold cache share one assembly rather
  than each starting their own.
- Pages whose main content does not depend on funding render without it while
  it assembles, and say so; funding-dependent pages show a self-refreshing
  notice. The first load after a deploy takes about a minute; every load after
  is a cache read.
- xStocks are Token-2022 mints with a UI multiplier (splits, dividends). The
  tokenized-assets section converts fills with each mint's on-chain multiplier;
  without it, NFLXx reads 10× after its split.
