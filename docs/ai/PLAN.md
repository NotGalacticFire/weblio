# Weblio — architecture and decisions

## Routes

| Route | Purpose |
| --- | --- |
| `/` | The whole argument: hero, situation, the comparison, the honest proof, services, process, CTA |
| `/contact` | The conversion page. Form always renders. |
| `/404` | In the same voice as the rest of the site |

Sitemap at `/sitemap-index.xml` (generated), `robots.txt` points at it.

## The signature interaction — the loupe

The page is a printed sheet ruled with a faint 12-column grid, drawn in CSS
(`.sheet-grid`). The pointer carries a printer's loupe, rendered in WebGL2.

- `src/scripts/glass.ts` — the single source of truth for where the glass is.
  Owns pointer input, easing and one rAF loop. **Both** the shader and the
  per-character type response subscribe to it, so they can never disagree about
  where the lens is — which is the whole illusion.
- `src/scripts/gl/loupe.frag` — draws only what is under the glass and emits
  nothing elsewhere, so the CSS sheet stays the page's single grid and
  "no WebGL" degrades to "no magnifier", not to a broken layout.
- `src/scripts/gl/loupe.ts` — GL objects and painting. Draws are scissored to
  the lens bounding box, so cost scales with the glass, not the screen.
- `src/scripts/motion/type-loupe.ts` — characters magnify under the glass using
  compositor-only transforms.

**Built on first pointer interaction, not on load.** Context creation, shader
compile and the first draw cost ~770ms of blocking time under a 4× CPU throttle
with software GL. See STATE.md for the measurements behind this.

### Things that were tried and rejected

| Tried | Why it was wrong |
| --- | --- |
| Hemisphere lens profile | Bows the column rules into meridians; reads as a glass marble, not a loupe |
| Flat field to 0.58 of radius | That is only 34% of the *area* — two thirds of the disc still curved |
| Three halftone screens at rosette angles | Interfere into random speckle; one screen at 45° reads as print |
| Full-screen shader with its own grid | Fought the CSS grid; two misaligned grids on one page |
| `requestIdleCallback` for GL init | Moves the work into the TBT window: worse than eager *and* worse than deferring to interaction |

## Motion

`src/scripts/motion/` — three moves only: **rise**, **wipe**, **draw**.

- IntersectionObserver + Web Animations API, no animation library.
- IO alone is not sufficient: it coalesces, so a fast scroll can leave an
  element permanently at opacity 0. A scroll-position sweep (`reveal.ts`) makes
  that structurally impossible.
- Every `h1` is revealed by **CSS**, never by script — it is the LCP element on
  every page, and script-revealing it adds parse + animation time to LCP.
- Above-the-fold elements animate immediately; below-the-fold wait for IO.

## Colour and contrast

Contrast is computed, not eyeballed. See `src/styles/tokens.css`:

- `--ink-60` is 6.3:1 on paper. The obvious 60% alpha value computed to 4.48:1 —
  a near-miss under AA that would have shipped.
- `--ink-45` and `--ink-30` are **non-text only** (2.8:1 and below).
- `--accent` (#E4431F) is 3.42:1 — large text, rules and marks only.
  `--accent-ink` (#B8300F) is 5.05:1 and is what any text under 24px uses.

## Fonts

`scripts/build-fonts.py` subsets three variable faces and emits
`src/styles/fonts.css`.

- 187 KB → **110.6 KB** (−41%), with every variation axis preserved.
- Size won by per-face glyph sets and partial axis instancing, never by
  flattening axes: `WONK` and `SOFT` are load-bearing for the brand.
- Metric-matched fallback faces are generated from the **real** system font
  files, comparing a frequency-weighted mean advance width on both sides.
  Comparing `OS/2.xAvgCharWidth` across families does not work — foundries
  compute it over different glyph sets, and it produced a `size-adjust` that was
  wrong by 20%. Result: **CLS 0.000** on every page and viewport.

## Verification

| Command | What it does |
| --- | --- |
| `npx astro check` | Types |
| `npx astro build` | Build |
| `node scripts/verify.mjs [--shots]` | Headless audit: 3 pages × 5 viewports — console errors, failed requests, horizontal overflow, stuck reveals, heading order, form labels, touch targets, CLS/LCP |
| `node scripts/shots.mjs [id…]` | Per-section screenshots for visual review |
| `node scripts/og.mjs` | Regenerates `public/og.png` using the real webfonts |
| `node scripts/serve-dist.mjs [port]` | Serves `dist/` gzipped, like a CDN would |

Everything runs in a headless Chrome the scripts launch themselves. This is not
incidental: a backgrounded tab freezes `requestAnimationFrame`, which silently
suppresses every scroll reveal and makes screenshots lie.
