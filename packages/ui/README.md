# @marketroom/ui

The design system: one token file, a handful of presentational primitives, and
the rules that keep a dense financial UI readable.

Nothing in here fetches, derives or formats. Data comes in as props; numbers
arrive pre-formatted by `@marketroom/core` (`formatPrice`, `formatPercent`, …).
A lint rule enforces that this package never imports `@marketroom/adapters`.

```
src/tokens.css          the contract — the only file allowed to name a colour
src/components/         the primitives
scripts/contrast.mjs    the WCAG gate: pnpm --filter @marketroom/ui contrast
```

---

## 1. The five rules

These are not style preferences. Each one is a direct fix for a measured defect
in the reference UI we replaced — see `docs/research/01-reference-teardown.md`
§5, which has the numbers.

**1. The data is the only thing allowed to be colourful.** Chrome is neutral.
Borders, labels, headings, nav, footers, table rules: greys. If a page looks
monochrome apart from the prices, it is correct.

**2. Hairlines are never tinted.** `--mr-border*` are neutral greys and have no
hue variants. The reference tinted its hairlines with its accent at 13–28%
alpha, and the result was a page that hummed green. Depth comes from the surface
ramp — `--mr-bg` → `--mr-surface-3` have real, measurable luminance separation —
never from a glowing border.

**3. One accent, for interactive affordance and focus only.** `--mr-accent` marks
things you can act on: focus rings, the pressed state of a control, a selected
filter. It is never a label colour, never a heading colour, never decoration.
There is no second accent. If you need to distinguish two things and neither is
interactive, use weight, size, position or a label — not a new hue.

**4. Price direction carries the whole saturation budget.** `--mr-up`,
`--mr-down` and `--mr-flat` are the only colours in the product that mean
something. They are deliberately desaturated relative to a typical trading
terminal, which works precisely because nothing else competes for attention.

**5. Direction never relies on hue alone — and that is not optional.** Every
price change carries, simultaneously:

| channel                            | comes from                            |
| ---------------------------------- | ------------------------------------- |
| a sign (`+` / `-`)                 | `formatPercent` in `@marketroom/core` |
| an arrow glyph (`▲` / `▼`)         | `PriceChange`, `aria-hidden`          |
| a word (`up` / `down` / `no data`) | `PriceChange`, via `VisuallyHidden`   |
| colour                             | `--mr-up` / `--mr-down`               |

The measurement behind the rule: simulate `--mr-up` and `--mr-down` under
deuteranopia and protanopia (Machado 2009, severity 1.0) and they land 6.0–9.4
ΔE2000 apart, with a luminance ratio of 1.07–1.29:1. A just-noticeable
difference is ≈2.3 and "comfortable" is ≈10+. So to a dichromat the two are
_nearly the same olive colour_. There is no way to fix that while green still
looks green and red still looks red — which means the sign and the arrow are not
a courtesy, they are the only channel that works for ~8% of men. **Never ship a
red/green signal in this product without one of them.**

Same logic for every other colour-coded thing: an order book's bid/ask rows, a
sector bar's direction, a venue mark. If you remove the colour and the user can
still tell, it is fine. If not, add a glyph, a label, or a position.

---

## 2. The token contract

`tokens.css` defines two themes: `:root` is dark, `[data-theme='light']` is light.
The attribute is set on `<html>` by an inline script in `apps/web/app/layout.tsx`
before first paint, so there is no flash of the wrong theme.

### Surfaces

| token                 | role                                          |
| --------------------- | --------------------------------------------- |
| `--mr-bg`             | the page                                      |
| `--mr-surface-1`      | cards, panels, table row hover                |
| `--mr-surface-2`      | a panel's own sub-header; control backgrounds |
| `--mr-surface-3`      | control hover; neutral badge fill             |
| `--mr-surface-raised` | popovers, tooltips, the skip link             |

`--mr-surface-raised` is a _popover_ surface, not the fourth step of the content
ramp. Text on it must be `--mr-text` or `--mr-text-muted` — `--mr-text-subtle`
measures 4.15:1 there, below the gate.

### Text

| token              | contrast on bg (dark / light) | use                                            |
| ------------------ | ----------------------------- | ---------------------------------------------- |
| `--mr-text`        | 14.8 / 17.6                   | values, headings, anything primary             |
| `--mr-text-muted`  | 7.5 / 5.9                     | prose, secondary values, control labels        |
| `--mr-text-subtle` | 5.8 / 5.1                     | column headers, hints, timestamps, breadcrumbs |

Three steps, and that is all there are. If you want a fourth, you want a
different size or weight.

### Direction and status

`--mr-up`, `--mr-down`, `--mr-flat`, plus `--mr-warn`, `--mr-danger`, `--mr-ok`
(aliases of down/up). Each has a `-soft` fill at ~11–13% alpha for chip
backgrounds, and up/down also have a `-border`.

The non-obvious trap: **a direction colour has to clear 4.5:1 against its own
`-soft` fill, not just against the bare surface.** A `tone="down"` badge puts
`--mr-down` text on `--mr-down-soft` over `--mr-surface-1`, and that composite is
~0.7 of a ratio point worse than the bare case. Two tokens shipped failing on
exactly this pair. The gate checks it; trust the gate, not your eye.

### Everything else

Typography (`--mr-font-*`, `--mr-text-2xs` … `--mr-text-3xl`), radii, shadows,
`--mr-focus-width` / `--mr-focus-offset`, `--mr-duration*` / `--mr-ease`.

Shadows are nearly invisible on purpose. Elevation is the surface ramp's job.

### Adding or changing a colour token

1. Change it in `tokens.css`, in **both** themes.
2. If the token is new, add its real-world pairs to `CASES` in
   `scripts/contrast.mjs` — including against any `-soft` fill it sits on.
3. `pnpm --filter @marketroom/ui contrast`. It exits non-zero on a failure.
   Adjust the token, not the gate.
4. Look at `/` and `/market/nvda` in both themes. The gate catches contrast; it
   cannot tell you the page now has two competing greens.

Gates: **4.5:1 for all text and all numerics** — our smallest numeric is 11px
(`--mr-text-2xs`), so nothing here qualifies for WCAG's 3:1 large-text
allowance — and **3:1 for non-text that carries meaning or state**: the focus
ring, a pressed control's border, venue dots, sparkline strokes. Purely
decorative hairlines are exempt (WCAG 1.4.11) and are deliberately left at
~1.2–1.5:1; that is what makes the chrome recede. Disabled controls are exempt
too (WCAG 1.4.3), which is why the base `:disabled` rule may dim them.

---

## 3. Base layer

`tokens.css` also ships the small amount of global CSS the system depends on.
Import it once, at the top of the root layout, **before** the app's own
stylesheet.

| class / selector                      | what it does                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.mr-num`                             | mono + tabular figures. **Every numeric in the product.** Without `tabular-nums` a ticking price visibly changes width and table columns stop aligning.                                                                                                                                                                                                                   |
| `:focus-visible`                      | `outline` + `outline-offset`. Do not replace this with a `box-shadow` ring — a shadow has to paint its own gap, which means baking a backdrop colour in, and that gap then renders as a halo on anything not sitting on `--mr-bg`. An outline needs no backdrop, follows the element's own radius, and survives forced-colors mode, where shadows are not painted at all. |
| `.mr-sr-only` / `.sr-only`            | visually hidden, still announced. Prefer the `VisuallyHidden` component.                                                                                                                                                                                                                                                                                                  |
| `.mr-surface` / `.mr-interactive`     | `Surface`'s styling and its hover / active / `:focus-within` states.                                                                                                                                                                                                                                                                                                      |
| `.mr-tooltip*`                        | `Tooltip`'s styling.                                                                                                                                                                                                                                                                                                                                                      |
| `.mr-flash-up` / `.mr-flash-down`     | one-shot tinted background on a price tick. Deliberately faint: a table where every row flashes brightly is unreadable, which is the failure mode of most trading UIs.                                                                                                                                                                                                    |
| `:disabled`, `[aria-disabled='true']` | `cursor: not-allowed` and dimming, qualified by element so it outranks the app's `.mr-btn` / `.mr-chip` classes.                                                                                                                                                                                                                                                          |
| `prefers-reduced-motion`              | kills every animation and transition. Price flashes are decoration; nobody should be forced to watch them.                                                                                                                                                                                                                                                                |

---

## 4. The primitives

### `PriceChange`

```tsx
<PriceChange fraction={change?.fraction ?? null} direction={change?.direction} />
<PriceChange fraction={f} showArrow={false} size="sm" />   // dense chips
```

A signed percentage with direction encoded four ways (§1 rule 5). `fraction` is
a **fraction, not a percent** — `0.0213` renders `+2.13%`.

`null` renders an em dash in neutral grey and announces "no data". A missing
value is always neutral even if you pass `direction`: an em dash tinted green
claims a direction we do not have.

### `Price`

A formatted price in tabular mono. Use it rather than `formatPrice` in a bare
`<span>` so the sizing and weight ramp stays in one place.

### `Sparkline`

```tsx
<Sparkline candles={candles} direction={change?.direction} />
```

Hand-rolled SVG, ~40 lines, one path string — a table renders up to a hundred of
these, and a charting library's axes and responsive machinery are pure overhead
at 88×28.

`aria-hidden`, because the number is always next to it. **If you render one
without the number beside it, that is a bug** — there is then no accessible path
to the information.

With fewer than two candles it renders an empty `<svg>` of exactly the same
dimensions, so a market with no history does not change the row height. One point
is not a trend, so there is nothing honest to draw.

### `Badge`

```tsx
<Badge>Semiconductors</Badge>
<Badge tone="warn" mono>2.14% spread</Badge>
<Badge tone="accent" title="Listed on more than one venue">3 venues</Badge>
```

Tones: `neutral` `accent` `up` `down` `warn`. `mono` for digits.

`title` keeps the native tooltip for mouse users **and** emits the text
visually-hidden, so keyboard and screen-reader users get it too. That is
deliberately not a `Tooltip`: badges are routinely rendered inside a table-row
link, and `Tooltip` adds a tab stop — interactive content inside interactive
content is invalid HTML and wrecks tab order.

### `VenueBadge`

```tsx
<VenueBadge venue="hyperliquid" />          // dot + label
<VenueBadge venue="solana" compact />       // dot only
```

`compact` is for the market table's Venues column. The dot is `aria-hidden`
decoration, so compact mode emits a `VisuallyHidden` name — otherwise the column
is simply blank to a screen reader. The two venue hues stay 14+ ΔE2000 apart
under deuteranopia and protanopia, so the dot survives as a _distinction_; the
text is what makes it an _identifier_.

### `InstrumentBadge`

```tsx
<InstrumentBadge kind={listing.kind} />
```

`PERP` / `TOKEN` / `SPOT`. This is the product's central distinction: a perp and
a custody-backed token can share a ticker and be entirely different products, so
labelling the instrument wherever a price appears is a correctness requirement,
not decoration.

The expansion goes through `Tooltip`, so it is reachable by keyboard and on
touch. **That makes it focusable — do not place it inside a link or button.**
Use `<Badge title>` there.

### `Tooltip`

```tsx
<Tooltip content="Perpetual future — leveraged price exposure.">
  <Badge mono>PERP</Badge>
</Tooltip>
<Tooltip content="Sum of 24h volume across every venue." underline side="bottom">
  Volume
</Tooltip>
```

CSS-only, zero JavaScript, safe inside Server Components. It replaces native
`title`, which takes ~1s to appear, cannot be styled, is unreliably announced on
a `<span>`, and **never appears on touch at all** — on a phone the explanation of
what `PERP` means simply did not exist.

Two constraints:

- The trigger is focusable, so it must not be nested inside a link or button.
- The bubble is absolutely positioned inside the trigger, so an ancestor with
  `overflow: hidden` clips it. Pass `side="bottom"` near the top of the viewport.

Known deviation from the WAI-ARIA tooltip pattern: dismissing with `Escape`
needs a key handler, which needs JavaScript. Moving focus away dismisses it,
which is the part keyboard users actually need.

### `VisuallyHidden`

```tsx
<VisuallyHidden>up</VisuallyHidden>
```

For information sighted users get from colour, position or an icon and nobody
else would get. The inverse operation is `aria-hidden`, which is for decoration —
do not reach for this one to hide something.

It lives here rather than in the app because this package depends on it:
`PriceChange` emits a direction word. A component cannot rely on a class defined
one layer above it, which is what `.sr-only` in the app's `globals.css` was.

### `Surface`

```tsx
<Surface level={2} interactive>
  …
</Surface>
```

A card. `interactive` adds hover, active and `:focus-within` states — a Surface
is a `<div>` and never focusable itself, so `:focus-within` is what makes the
card agree with the focus ring of the link inside it.

Its background goes through `--mr-surface-bg` rather than an inline
`background`. Not stylistic: a CSS class can never override an inline style, so
a hover state would be impossible otherwise.

### `Stat`

```tsx
<Stat
  label="24h volume"
  value={formatCompactUsd(volume)}
  hint="Summed across every venue."
  align="right"
/>
```

A one-row `<dl>`. A label and its figure are a description pair; two anonymous
`<div>`s lose the association for assistive tech. `hint` becomes a `Tooltip` on
the label, so it is not inside a link.

### `SectionTitle`

```tsx
<SectionTitle action={<Badge mono>2.1% spread</Badge>}>Order book</SectionTitle>
<SectionTitle level={3} id="peers">Related</SectionTitle>
```

`level` exists because heading order is document structure, not style: an `<h2>`
nested inside another `<h2>`'s section skips a level and breaks heading
navigation. Default `2` — every page has exactly one `<h1>`.

### `EmptyState`

```tsx
<EmptyState
  title="No markets match"
  hint={`Nothing in the index matches “${query}”.`}
  action={
    <button type="button" className="mr-btn" onClick={reset}>
      Clear all filters
    </button>
  }
/>
```

Nothing to show, why, and the way out. Pass `action` whenever the emptiness is
the result of something the user did — a filter, a search. A dead end the user
cannot leave is not an empty state, it is a trap.

No live region: the market explorer already announces its result count through
`aria-live`, and two announcements for one action is worse than one.

## 5. Adding a primitive

The bar is **two existing call sites**, or one plus a concrete near-term second.
A design system's cost is not the code, it is the ambiguity of having two ways to
do the same thing. We are two people; a primitive nobody reaches for is worse
than a bit of duplication.

Then:

1. **One file per component** in `src/components/`, named for the component.
   `primitives.tsx` holds the small token-only ones; anything with real logic,
   an id, or its own CSS gets its own file.
2. **Export it from `src/index.ts`.** Alphabetical.
3. **Style with tokens only.** No hex literals outside `tokens.css` — a lint rule
   rejects them. Inline `style` with `var(--mr-*)` is the house pattern: it keeps
   the component portable and puts the contract at the point of use. Reach for a
   class in `tokens.css` only when you need something inline style cannot do —
   a pseudo-class, a media query, an animation.
4. **No `'use client'` unless it genuinely needs state.** Most of these render
   inside Server Components. That rules out `useId`, which is why `Tooltip` and
   `Sparkline` derive their ids by hashing their content — deterministic, so
   server and client agree and hydration does not warn.
5. **Say what happens with no data.** Every component here takes `null` and
   renders an em dash. A finance UI that shows `0` or `NaN` for "we do not know"
   is lying.
6. **Write the accessibility decision down in the file.** Not "added aria" — the
   actual reasoning, so the next person does not undo it. Examples worth copying:
   why `Sparkline` is `aria-hidden`, why `Badge` uses `title` instead of
   `Tooltip`, why `EmptyState` has no live region.
7. **Check it keyboard-only.** Tab to it. Is the focus ring visible on every
   surface it can sit on? Is it reachable at all? Is it a tab stop that should
   not be one?
8. If you touched a colour, `pnpm --filter @marketroom/ui contrast`.

Then `pnpm typecheck && pnpm lint` from the repo root. Both must pass.

---

## 6. What this package deliberately does not own

Buttons, chips, inputs, selects, the table and the layout shell live in
`apps/web/app/globals.css` as `.mr-*` classes. They are app chrome, used once
each, and wrapping them in React components would add indirection without
removing duplication.

The consequence worth knowing: **their interaction states are maintained over
there, not here.** If you add a `:hover` to a control, also add `:active`,
`:disabled` and make sure `:focus-visible` is not suppressed — the base layer
here gives every element a focus ring, and an `outline: none` in `globals.css`
silently removes it.
