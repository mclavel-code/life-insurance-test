# Life Insurance Hub — INS-912

U.S. News Insurance section-front. Static site, no build step, no framework.

**Live:** https://mclavel-code.github.io/life-insurance-test/

> Internal user-testing prototype. Not for public distribution.

## What this is

The design prototype (`Life Insurance Hub v6`, Claude Design handoff) shipped as
a 4 MB self-extracting bundle: the page lived as a JSON string inside a runtime
that rendered it with JavaScript. This repo is that page **unpacked into real
source code** — same pixels, same behavior, no runtime.

Verified against the original render:

| Check | Result |
|---|---|
| Visible text | byte-identical (9,459 chars) |
| Computed styles (every visible element) | identical hash |
| Visible element count | 1,207 = 1,207 |
| Page height | identical |
| Cost tabs (term/whole × F/M) | all values match |
| Calculator (simple + detailed) | formulas ported 1:1, outputs match to the dollar |

## Files

```
index.html   the page — snapshot of the rendered design, one comment block
             per section; dynamic UI (calculator panels, whole-life table,
             mobile menu, sticky bar) included as hidden data-driven blocks
styles.css   self-hosted fonts + the responsive media queries
app.js       all behavior, ported 1:1 from the prototype component
assets/      images + 6 woff2 font files (latin, latin-ext)
```

## Running locally

```sh
ruby -run -e httpd . -p 8000    # or any static server
```

Works from `file://` too, except fonts (CORS).

## How the pieces talk

`index.html` carries declarative hooks that `app.js` resolves:

| Hook | Meaning |
|---|---|
| `data-if="key"` | block shows when derived state `key` is truthy |
| `data-action="fn"` | click/change dispatches to the ported handler |
| `data-bind` / `data-bind-checked` | input value/checked mirrors state |
| `data-text="key"` | text content of a derived value (calc results) |
| `data-hov` / `data-foc` | hover/focus style swaps, mined from the design |
| `data-reveal`, `data-bar` | scroll-in animations (honor reduced motion) |

The page renders completely with JavaScript disabled; app.js only adds the
interactions.

## Data status

- Rate tables and carrier scores are **samples** — final figures come from the
  U.S. News ratings feed at launch (`app.js` → `COST_TERM` / `COST_WHOLE`).
- The cost-table source line still reads `[Source name] / [Month Year]`.
- Education presets are College Board 2022–23 totals, as designed.

## Post-testing updates (round 2 fixes, v2)

Applied from the final design revision and verified pixel-identical to it
(identical computed-style hash, byte-identical visible text at 1280px):

1. "No company can pay for placement in our rankings." under the company
   directory (both variants).
2. Companies ordered by U.S. News rating, highest first (4.6 → 3.6).
3. Mobile: jump-bar "Get quote" is a red **outline** pill; the hero button
   stays solid red (outline version was tried and reverted in testing).
4. "How we rate" and "Companies we've reviewed" merged into one connected
   card; duplicate factor line removed; desktop shows 6 companies by
   default with "Show all 11 companies", mobile shows 5 (accordion rows).
5. Coverage note under the cost table ("Smaller policies typically cost
   less…"). Cost tables stay fixed at $1M — term 35/45/55/65, whole
   30/40/50/60/70 — no placeholders anywhere.

The directory ships as **two captured variants** (`data-dirvariant`,
desktop link-list / mobile accordion) toggled by `matchMedia(640px)` in
app.js — same mechanism the prototype runtime used.

## Known micro-differences from the prototype runtime

- The "saved estimate" pill's check icon is an inline SVG equivalent of the
  runtime-generated one (2 fewer wrapper elements; visually identical).
- Fonts are self-hosted instead of fetched from Google Fonts — same binaries,
  no third-party request.
- The `noscript` experience is *better* than the prototype's (which rendered
  a blank page).
