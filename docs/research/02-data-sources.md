# Live Data Sources — verified capability study

**Researched:** 2026-10-03 · **Method:** direct API probes against production endpoints
**Status:** complete — every endpoint below was called live and its response captured

The reference ships no data (see [`01-reference-teardown.md`](./01-reference-teardown.md)).
Everything the brief asks for — live price action, performance, trends, trading — must come
from primary sources. This document establishes exactly what is available.

---

## Summary

| Capability                      | Available? | Source                         | Auth       | Latency            |
| ------------------------------- | ---------- | ------------------------------ | ---------- | ------------------ |
| Full market universe            | ✅         | Hyperliquid `info`             | none       | ~250 ms            |
| Live price + 24h change         | ✅         | Hyperliquid `info` / WS        | none       | ~250 ms / realtime |
| OHLCV candles                   | ✅         | Hyperliquid `candleSnapshot`   | none       | ~340 ms            |
| Order book (L2)                 | ✅         | Hyperliquid `l2Book`           | none       | ~200 ms            |
| Open interest, funding          | ✅         | Hyperliquid `metaAndAssetCtxs` | none       | ~250 ms            |
| Realtime stream                 | ✅         | Hyperliquid WS                 | none       | push               |
| Trading                         | ✅         | Hyperliquid exchange API       | wallet sig | —                  |
| Solana tokenized stocks         | ✅         | Jupiter token API              | none       | ~400 ms            |
| Sector / country / fundamentals | ❌         | **none — we must own this**    | —          | —                  |

**No API keys. No rate-limit negotiation. No vendor contract. No cost.** This is the single
biggest de-risking factor for a hackathon timeline.

---

## 1. Hyperliquid `info` API — the primary source

**Endpoint:** `POST https://api.hyperliquid.xyz/info`
**Content-Type:** `application/json` · **Auth:** none · **CORS:** `access-control-allow-origin: *`

All queries are POSTs to one URL, discriminated by a `type` field.

### 1.1 `perpDexs` — discovering the venue

```json
{ "type": "perpDexs" }
```

Returns 11 builder-deployed perp DEXs. Tokenized equities live on **`xyz`** (trade[XYZ],
built by Hyperunit). The others: `flx vntl hyna km abcd cash para mkts io`.

> ⚠️ **Critical gotcha.** The default `meta` call with no `dex` returns the _main_ perp
> universe — 234 crypto markets, **zero equities**. Every equity call must pass
> `"dex": "xyz"`, and every coin ID is namespaced `xyz:NVDA`, not `NVDA`. This is the
> single easiest thing to get wrong.

### 1.2 `metaAndAssetCtxs` — the workhorse

```json
{ "type": "metaAndAssetCtxs", "dex": "xyz" }
```

**One call returns the entire market state: 129 markets, 57 KB, ~250 ms.** This is the
backbone of the index page.

Returns a 2-tuple `[meta, contexts]` — **positionally aligned**, `universe[i]` ↔ `ctxs[i]`.

`meta.universe[i]`:

```json
{
  "name": "xyz:NVDA",
  "szDecimals": 4,
  "maxLeverage": 30,
  "marginTableId": 30,
  "growthMode": "enabled",
  "deployerFeeScale": "1.0",
  "lastFeeScaleChangeTime": "2025-11-23T17:37:10.033211662"
}
```

`ctxs[i]`:

```json
{
  "markPx": "30775.0",
  "midPx": "30774.5",
  "oraclePx": "30781.0",
  "prevDayPx": "30542.0",
  "openInterest": "6593.8042",
  "dayNtlVlm": "319973455.865000248",
  "dayBaseVlm": "10401.0805",
  "funding": "0.0000049755",
  "premium": "-0.0002111692",
  "impactPxs": ["30774.0", "30775.0"]
}
```

> ⚠️ **Every numeric is a JSON string.** Parse at the boundary, once. Never `Number()` at
> render time in a component — that's how you get `NaN` in the UI and float drift in sorts.

Derivations:

- 24h change % = `(markPx − prevDayPx) / prevDayPx`
- OI in USD = `openInterest × markPx` (`openInterest` is in **base units**, not dollars)
- Volume in USD = `dayNtlVlm` (already notional)

### 1.3 `candleSnapshot` — charts

```json
{
  "type": "candleSnapshot",
  "req": {
    "coin": "xyz:NVDA",
    "interval": "1h",
    "startTime": 1790359200000,
    "endTime": 1790964000000
  }
}
```

Returns standard OHLCV. Verified: 169 candles for a 7-day 1h window, 23 KB, ~340 ms.

```json
{
  "t": 1790359200000,
  "T": 1790362799999,
  "s": "xyz:NVDA",
  "i": "1h",
  "o": "224.79",
  "c": "224.09",
  "h": "225.21",
  "l": "224.09",
  "v": "7133.32",
  "n": 1308
}
```

`t`/`T` = open/close ms, `v` = base volume, `n` = trade count.
Intervals: `1m 3m 5m 15m 30m 1h 2h 4h 8h 12h 1d 3d 1w 1M`.

> ⚠️ Capped at ~5000 candles per request. For long ranges on fine intervals, page by
> `startTime` — or just use a coarser interval, which is what we'll do.

### 1.4 `l2Book` — order book depth

```json
{ "type": "l2Book", "coin": "xyz:NVDA" }
```

```json
{ "coin":"xyz:NVDA", "time":1790966559181,
  "levels": [ [ {"px":"234.6","sz":"21.6","n":1}, … ],   // bids
              [ … ] ] }                                   // asks
```

`levels[0]` = bids descending, `levels[1]` = asks ascending, `n` = orders at that level.
Powers the depth/spread view on the detail page.

---

## 2. Hyperliquid WebSocket — realtime

**Endpoint:** `wss://api.hyperliquid.xyz/ws` · **Auth:** none
**Verified live** — connected, subscribed, received streaming trades within seconds.

```jsonc
{ "method": "subscribe", "subscription": { "type": "allMids", "dex": "xyz" } }
{ "method": "subscribe", "subscription": { "type": "trades",  "coin": "xyz:NVDA" } }
```

Captured frame:

```json
{
  "channel": "trades",
  "data": [
    {
      "coin": "xyz:NVDA",
      "side": "B",
      "px": "234.55",
      "sz": "0.64",
      "time": 1790966491983,
      "tid": 1033221279683928,
      "hash": "0xfd3f71…",
      "users": ["0x4692…", "0x…"]
    }
  ]
}
```

| Channel                      | Payload                   | Use                                                              |
| ---------------------------- | ------------------------- | ---------------------------------------------------------------- |
| `allMids` (`dex:"xyz"`)      | All mid prices, one frame | **Index page live ticks — one subscription for all 129 markets** |
| `trades` (per coin)          | Executed trades           | Detail page tape                                                 |
| `l2Book` (per coin)          | Book deltas               | Detail page depth                                                |
| `candle` (per coin+interval) | Live candle updates       | Detail page chart                                                |
| `activeAssetCtx` (per coin)  | Mark/funding/OI updates   | Detail page stats                                                |

**Refresh strategy this implies — and it directly answers the "no spinners" requirement:**

| Surface                         | Mechanism                               | Why                      |
| ------------------------------- | --------------------------------------- | ------------------------ |
| Market universe, names, sectors | Build-time + ISR (~60 s)                | Changes rarely           |
| Index page prices               | Server snapshot → `allMids` WS takeover | Instant paint, then live |
| Detail page chart               | Server-rendered candles → `candle` WS   | No chart spinner, ever   |
| Book / trade tape               | WS only                                 | Inherently live          |

Server-render the first frame from a cached snapshot, then let the socket take over. The
user never waits on a request to see a number. Note the socket is a **client-side progressive
enhancement** — the page is fully readable before it connects, and fully functional if it
never does.

> ⚠️ `allMids` on a busy venue is a high-frequency firehose. Coalesce frames into a single
> animation-frame batch before touching React state, or the index page will re-render
> itself to death. This is a real performance trap, and the reference's
> `innerHTML`-on-every-keystroke grid would not survive it.

---

## 3. Trading

Hyperliquid's exchange API takes EIP-712-signed actions (`POST /exchange`) — orders,
cancels, leverage. Wallet via Privy / RainbowKit / wagmi.

**Recommendation: do not build live order placement for the hackathon MVP.** Rationale:

- It is the single highest-risk surface — signing bugs lose real user funds.
- It forces wallet infra, nonce management, and error-state design that will eat the
  entire timeline and produce the least demo value per hour.
- **The brand copy you supplied explicitly scopes it out** — "no wallet connection,
  custody or trading" (see §5).

**Proposed instead:** a complete, accurate _pre-trade_ surface — live price, depth, spread,
funding, OI, max leverage, contract specs, risk disclosure — with a deep link out to
`app.trade.xyz`. Architecturally we leave a clean seam (an `ExecutionProvider` interface)
so live trading drops in later without a refactor. This is what the reference does too,
minus everything that makes it useful.

If you want real trading in-scope, say so and I'll plan it as a dedicated phase with
testnet (`api.hyperliquid-testnet.xyz`) first — but it should not block the MVP.

---

## 4. What no API gives us — the part we must own

**Sector, industry, country, company name, and editorial context do not exist in any
Hyperliquid response.** `meta.universe` gives a ticker and leverage; that is all.

This is not a gap to paper over — **it is the product.** A raw market screen is a
commodity; trade[XYZ]'s own UI already does that. Marketroom's value is the layer the API
can't provide: knowing `xyz:SKHX` is SK hynix, that it's South Korean memory, that memory
and `DRAM` and `MU` move together.

So we own a **curated catalog**, version-controlled in-repo:

```
packages/catalog/src/markets/
  nvda.ts   skhx.ts   sp500.ts   gold.ts   …   # one file per market
```

| Field                     | Source                                                                          |
| ------------------------- | ------------------------------------------------------------------------------- |
| `marketId` (`xyz:NVDA`)   | Join key to live data                                                           |
| `name`, `country`, `flag` | Curated                                                                         |
| `sector` → `industry`     | Curated — **two-level**, fixing the reference's 49 flat strings                 |
| `assetClass`              | `equity` / `index` / `etf` / `commodity` / `fx` — reference has no such concept |
| `summary`                 | Curated editorial (seeded from the reference's 62)                              |
| `peers[]`                 | Curated — enables "related markets", which the reference lacks                  |
| `listedAt`, `isPrivate`   | Curated                                                                         |

**One file per market is deliberate** — it is the single biggest lever for parallel work.
Two people adding catalog entries never touch the same file, so git never conflicts.

A CI check fails the build when a live `marketId` has no catalog entry, so the 67-market
drift that rotted the reference cannot silently happen to us.

---

## 5. ⚠️ Scope conflict — needs your decision

**The two briefs you gave me describe different products.** Flagging before any code:

|                 | Handwritten note + brand page                                               | Typed brief                           |
| --------------- | --------------------------------------------------------------------------- | ------------------------------------- |
| **Chain**       | **Solana**                                                                  | **Hyperliquid** (reference is HIP-3)  |
| **Instrument**  | Tokenized stocks / RWA — real backing, redemption rights                    | Perpetual futures tracking an oracle  |
| **Scope**       | **"read-only"**, "no wallet connection, custody or trading"                 | "**Trade** / act on those listings"   |
| **Form factor** | "read-only **mobile** guide"                                                | Desktop-style index + trading surface |
| **Core value**  | Compare issuer, legal structure, **holder rights, redemption, eligibility** | Live price action, trends, trading    |

These aren't details — they're different products on different chains. The brand page's
whole thesis is that _"the same ticker can hide very different products: share ownership, a
custody-backed token, or price exposure."_ An HIP-3 perp is the third of those three, and
the brand copy exists to warn people about exactly that conflation.

**Good news: Solana data is equally available.** Verified against Jupiter — `NVDAx`
(NVIDIA xStock, Backed Finance) returns mint `Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh`,
`usdPrice` 234.45, `holderCount` 169,775, `liquidity` $4.46m, FDV $75.4m, plus 5m/1h/24h
price, volume and holder deltas. `GET https://lite-api.jup.ag/tokens/v2/search?query=…`,
no auth.

**My recommendation — build the architecture venue-agnostic and ship Hyperliquid first.**

Both are "a tokenized claim on an equity's price," so one `Market` entity models both
behind a `VenueAdapter` interface (`HyperliquidAdapter`, `SolanaAdapter`). Ship the
Hyperliquid adapter for the MVP because its data is richer (real OHLCV, order book, OI,
funding — Jupiter gives spot price and aggregates, no candles) and because it matches the
reference you asked us to build on.

Then the Solana adapter lands as a **second venue, not a rewrite** — and the moment both
are in, you get the thing the brand page actually promises and that nobody else has:
**the same ticker, side by side across venues, with the structural differences made
explicit.** `NVDA` as an HIP-3 perp (leveraged price exposure, no ownership) next to
`NVDAx` as a Backed-issued token (custody-backed, redeemable). That comparison _is_ the
brand thesis, and it's a genuinely stronger product than either half.

**What I need from you:** confirm Hyperliquid-first with the Solana adapter as phase 2 —
or tell me to flip it. The adapter boundary means this choice is reversible, but the
MVP's demo surface depends on it.

---

## 6. Risks

| Risk                                     | Severity | Mitigation                                                                                                             |
| ---------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| Undocumented rate limits on `info`       | Medium   | Single server-side poller → cache fan-out to all clients. Never let browsers hit Hyperliquid directly for shared data. |
| `allMids` firehose melts the client      | Medium   | Coalesce into one rAF batch; `useSyncExternalStore`, not state-per-tick                                                |
| String numerics cause float/sort bugs    | Medium   | Parse once at the adapter boundary; typed `Market` after that                                                          |
| Catalog drifts from live book            | High     | CI check fails on unmapped `marketId` — this is what rotted the reference                                              |
| `dex: "xyz"` omitted → silent wrong data | High     | Adapter is the only thing that may construct a query; enforce in types                                                 |
| Venue adds/removes markets               | Low      | Catalog keyed on `marketId`; unmapped markets degrade gracefully, never crash                                          |

---

## Appendix — reproduce every probe

```bash
H='Content-Type: application/json'; U=https://api.hyperliquid.xyz/info

curl -s -X POST $U -H "$H" -d '{"type":"perpDexs"}'
curl -s -X POST $U -H "$H" -d '{"type":"metaAndAssetCtxs","dex":"xyz"}'
curl -s -X POST $U -H "$H" -d '{"type":"l2Book","coin":"xyz:NVDA"}'
curl -s -X POST $U -H "$H" \
  -d '{"type":"candleSnapshot","req":{"coin":"xyz:NVDA","interval":"1h",
       "startTime":1790359200000,"endTime":1790964000000}}'

curl -s 'https://lite-api.jup.ag/tokens/v2/search?query=NVDAx'
```

WebSocket:

```js
const ws = new WebSocket('wss://api.hyperliquid.xyz/ws');
ws.onopen = () =>
  ws.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'allMids', dex: 'xyz' } }));
```
