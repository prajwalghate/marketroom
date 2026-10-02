# Reference Teardown — `hyperliquid-pink.vercel.app`

**Researched:** 2026-10-03 · **Method:** live browser session + network capture + raw source extraction
**Status:** complete

---

## TL;DR — the headline finding

**The reference has no backend, no API, and no live data. It is a single static HTML file.**

| What was expected             | What is actually there           |
| ----------------------------- | -------------------------------- |
| An app with API endpoints     | 1 HTTP request, total            |
| A data provider / market feed | A hardcoded JS array literal     |
| Live price action             | No prices anywhere on the page   |
| Charts / candles              | None                             |
| Trading                       | An `<a href>` to `app.trade.xyz` |
| Polling / WS / SSE            | None                             |
| Routes / pages                | One route: `/`                   |

This materially changes the plan. "Rebuild the reference, then extend" was the stated
approach — but there is almost nothing underneath to rebuild. The reference is a
**well-designed static infographic**, not a product. Everything in the brief that matters
(live price action, performance, trends, trading) has to be built from primary sources,
because the reference never had it.

The good news: the primary sources exist, are free, are fast, and are fully verified below.

---

## 1. Network layer — complete inventory

Captured on a cold load with devtools network recording.

```
GET https://hyperliquid-pink.vercel.app/   →  200   68,021 bytes   text/html
```

That is the entire network inventory. **Zero XHR/fetch. Zero API calls. Zero JSON.**

Response headers:

```http
server: Vercel
x-vercel-cache: HIT
cache-control: public, max-age=0, must-revalidate
content-type: text/html; charset=utf-8
etag: "bcd0320258fe4d8aa5a2bbe864bf75c3"
content-length: 68021
```

Only three external references exist in the document, none of them data:

| URL                                                                   | Purpose                       |
| --------------------------------------------------------------------- | ----------------------------- |
| `fonts.googleapis.com/css2?family=Space+Grotesk…Inter…JetBrains+Mono` | Webfonts                      |
| `cdnjs.cloudflare.com/…/html-to-image/1.11.11/html-to-image.min.js`   | Renders the share card to PNG |
| `app.trade.xyz`, `oakresearch.io/en/hyperliquid/hip-3/1`              | Outbound `<a>` links          |

**No build step, no framework, no bundler.** The document contains 1 `<style>` block and
2 `<script>` blocks, all inline. No React, no Next.js, no hydration.

---

## 2. Where the data actually comes from

It doesn't come from anywhere at runtime. It is a literal baked into the HTML:

```js
const DATA = [
  { tk:"NVDA", name:"NVIDIA Corporation", country:"USA", flag:"🇺🇸",
    sector:"Semiconductors", pe:50, oi:500, type:"Common", lev:20,
    sum:"The defining chipmaker of the AI era. …" },
  …62 entries total
];
```

Extracted in full to [`reference-dataset.json`](./reference-dataset.json).

### Field schema (the reference's entire data model)

| Field     | Type           | Meaning                                                    | Live?                  |
| --------- | -------------- | ---------------------------------------------------------- | ---------------------- |
| `tk`      | string         | Ticker                                                     | —                      |
| `name`    | string         | Legal company name                                         | —                      |
| `country` | string         | Home country (`"USA / Australia"` for duals)               | —                      |
| `flag`    | string         | Emoji flag                                                 | —                      |
| `sector`  | string         | Freeform sector label (49 distinct values)                 | —                      |
| `pe`      | number \| null | Indicative P/E; `null` → renders `N/A`                     | ❌ stale, hand-entered |
| `oi`      | number         | Max-OI **cap** in $m — a config ceiling, not a measurement | ❌                     |
| `type`    | string         | `Common` / preferred / etc.                                | —                      |
| `lev`     | number         | Max leverage                                               | ❌                     |
| `sum`     | string         | Hand-written editorial paragraph (~90 words)               | —                      |
| `peNote`  | string?        | Optional caveat, rarely present                            | —                      |

The page's own methodology section is candid about this: it admits live volume "can't be
honestly frozen in a static page" and substitutes the **Max-OI cap** as a liquidity proxy.
The `~$1.1B` volume stat and `62` / `10` counts are the only derived numbers — computed
client-side from the array at load.

### Sector taxonomy is unusable as-is

49 distinct `sector` strings across 62 rows, freeform and overlapping:
`Semiconductors`, `Semiconductors (Memory)`, `Semiconductors (NAND)`,
`Semiconductors & Software`, `Semiconductors & Electronics`, `Semiconductor Equipment`,
`Semiconductor Foundry`, `Semiconductor IP` — eight separate buckets for what is one
sector with sub-industries. The filter UI inherits this and shows a wall of ~50 chips.
**We need a real two-level taxonomy (sector → industry), not this.**

---

## 3. How stale is it?

Compared the reference's 62 rows against the live trade[XYZ] book (fetched today):

- **Live book: 129 markets. Reference: 62.** The reference covers **48%** of the book.
- **67 live markets are entirely absent from the reference**, including some of the
  highest-volume ones on the venue:

  ```
  XYZ100 SP500 GOLD SILVER CL BRENTOIL NATGAS COPPER PLATINUM PALLADIUM URANIUM
  ALUMINIUM CORN WHEAT TTF HO DXY VIX VOL EUR JPY GBP KRW NIFTY JP225 KR200 IBOV
  EWY EWJ EWT EWZ XLE SMH SOXL MAGS XBI TLT URNM DRAM H100
  NET CRWD RDDT MRNA IREN AAOI SHEIN YMTC BMNR SNXX CVX LRCX UMC GLW TWST OURA
  UNITREE CAMBRICON GIGADEV IBIDEN CXMT KSTR GEV KORU LYTE NCLD SKHY
  ```

- **Ticker symbols don't match the venue.** The reference invents display names that
  aren't the real market IDs:

  | Reference | Actual market ID                              |
  | --------- | --------------------------------------------- |
  | `SKHYNIX` | `xyz:SKHX` (and a separate `xyz:SKHY` exists) |
  | `SAMSUNG` | `xyz:SMSN`                                    |
  | `WTIOIL`  | `xyz:CL`                                      |

- **The `~$1.1B` 24h volume figure is wrong by ~2.2×.** Real measured 24h notional
  across the venue right now: **$2,473.7m**.

Top markets by _actual_ 24h volume — note that the #1 market by volume isn't even in the
reference:

| Market     | 24h notional | Open interest |
| ---------- | ------------ | ------------- |
| `XYZ100`   | $320.0m      | $202.9m       |
| `SP500`    | $239.8m      | $344.7m       |
| `MU`       | $229.1m      | $170.2m       |
| `CL`       | $211.9m      | $130.8m       |
| `SKHX`     | $168.1m      | $359.0m       |
| `BRENTOIL` | $167.2m      | $163.8m       |
| `SNDK`     | $124.5m      | $156.8m       |
| `SILVER`   | $123.9m      | $172.8m       |

**Conclusion:** the reference is a mid-2026 snapshot that has drifted badly. Porting its
dataset forward would mean shipping known-wrong data on day one. We should treat the
reference as a _design and editorial_ input — its copy and card layout are good — and
source all facts live.

---

## 4. Interaction inventory (what we must match)

Walked every interaction. The complete surface:

| #   | Surface                   | Behavior                                                      | Notes                                                      |
| --- | ------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | Ticker tape               | CSS marquee, array duplicated for seamless loop               | Pure CSS, no data                                          |
| 2   | Stat bar                  | 4 derived counters                                            | 2 of 4 are hardcoded strings                               |
| 3   | Sector distribution bars  | Top 9 sectors by count, width-animated on load                | Click → filters grid                                       |
| 4   | Country distribution bars | All 10 countries                                              | Click → writes to search box                               |
| 5   | Search input              | Substring match over `tk + name + sector + country`           | Client-side, no debounce                                   |
| 6   | Sector chips              | ~50 chips, single-select                                      | Unusable at this count                                     |
| 7   | Sort select               | 5 modes: Max-OI, P/E asc, P/E desc, A–Z, sector               | Nulls sort to the end                                      |
| 8   | Card grid                 | Full re-render of `innerHTML` on every keystroke              | O(n) DOM thrash                                            |
| 9   | Detail modal              | Overlay with tags, 3 stats, editorial summary, "Trade ↗" link | Not a route — no URL, no deep link, no back-button support |
| 10  | Share card                | `html-to-image` → 1080×1350 PNG download                      | Genuinely nice feature, worth keeping                      |
| 11  | Methodology section       | Static copy                                                   | Honest and well-written; worth adapting                    |

**Notable gaps to fix in ours:** the modal isn't routable (can't link to a stock), search
isn't debounced, the grid re-renders entirely on each keystroke, and there is no
virtualization. At 62 rows that's survivable; at 129+ rows with live prices it is not.

---

## 5. Design system teardown

The reference does use CSS custom properties — a reasonable starting structure:

```css
--bg: #070f0c --surface: #0d1a16 --text: #e4f3ec --bg-2: #0a1512 --surface-2: #102019
  --muted: #7c9a8e --mint: #4fe3ae --mint-bright: #7cfbd0 --muted-2: #57706a
  --mint-dim: rgba(79, 227, 174, 0.14) --line: rgba(122, 232, 190, 0.13)
  --line-strong: rgba(122, 232, 190, 0.28) --gold: #e9c46a --rose: #f2779a;
```

### Why this reads as "too vibrant / noisy" — measured, not opinion

1. **Mint is the only accent, and it's everywhere.** `#4FE3AE` and `#7CFBD0` sit at very
   high chroma. They're used for borders, labels, values, hover states, the tape, and the
   bars simultaneously. Nothing is allowed to be quiet, so nothing reads as important.
2. **Even the hairlines are tinted.** `--line` and `--line-strong` are mint at 13% / 28%
   alpha. Structural chrome should be neutral; tinting it makes the whole page hum green.
3. **Near-zero neutral surface separation.** `--bg #070F0C` → `--surface #0D1A16` →
   `--surface-2 #102019` are within a few points of luminance. Depth is carried almost
   entirely by the glowing mint borders rather than by surface steps — which is exactly
   why the accent has to be so loud.
4. **Three competing accents with no assigned roles.** Mint, gold `#E9C46A`, rose
   `#F2779A` appear without a semantic contract.
5. **Only 13 color literals total** — so the palette is small, but the _application_ of it
   is undisciplined. It isn't a token problem, it's a hierarchy problem.

### What our system must do differently

- Neutral, de-saturated surface ramp carrying depth; **untinted** hairlines.
- A single restrained accent, used sparingly for interactive affordance only.
- **Semantic** tokens with assigned roles — `up` / `down` / `flat` for price direction is
  non-negotiable once we have live prices (the reference never needed them). These must be
  distinguishable without relying on hue alone.
- Numeric data in a tabular-figure mono so columns align and digits don't jitter on tick.

---

## 6. What the reference gets right (keep these)

Not everything should be thrown out:

- **The card layout** — ticker, company name, country pill, sector tag, two key stats — is
  a clean, scannable unit.
- **The editorial summaries.** 62 hand-written ~90-word explainers are real work and are
  genuinely useful. This is the reference's actual differentiator over a raw market screen.
- **The honest methodology section.** Explicitly saying "where a number doesn't exist, it
  says N/A" and "these are perps, not shares" is good practice and we should carry the
  spirit forward.
- **The share card.** A downloadable 1080×1350 PNG is a real distribution feature.
- **`N/A` over invented numbers.** Correct instinct — keep it.

---

## Appendix — reproducing this teardown

```bash
# Full source (the entire app)
curl -s https://hyperliquid-pink.vercel.app/ -o ref.html

# Confirm single-request / no API:  load with devtools network open → 1 document request

# Extract the dataset
node -e "const h=require('fs').readFileSync('ref.html','utf8');
         console.log(JSON.stringify(eval(h.match(/const DATA=(\[[\s\S]*?\]);/)[1]),null,2))" \
  > reference-dataset.json
```

Extracted artifacts in this repo:

- [`reference-dataset.json`](./reference-dataset.json) — all 62 rows, verbatim
- [`02-data-sources.md`](./02-data-sources.md) — the live sources we'll actually build on
