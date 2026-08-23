# weblio.design

The site for Weblio — web design and development by Ravi.

Astro, no UI framework, no animation library. **9.6 KB of JavaScript gzipped**,
CLS 0, and a printer's loupe rendered in about a hundred lines of GLSL.

Lighthouse, production build, all three pages, mobile and desktop:
**100 / 100 / 100 / 100**.

---

## The idea

*Weblio* contains **folio** — a sheet, a leaf of a book. So the site is a
printed folio: warm paper, warm ink, one printer's-registration vermilion, a
hairline 12-column grid, folio numbers, and no rounded corners anywhere.

Then it does the one thing print can't. Move the pointer and a real magnifier
appears: the page's actual column rules open up, a sub-grid resolves, a 45°
halftone screen becomes visible, and the rim refracts with genuine chromatic
aberration. The headline magnifies under it too, and both effects read their
position from one shared eased value so they can never disagree about where the
lens is.

## Running it

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # → dist/
npm run check      # types
```

Copy `.env.example` to `.env` and fill it in — without a Web3Forms key the
contact form still renders and validates, it just composes a mail draft instead
of posting.

## Verifying it

```bash
node scripts/verify.mjs --shots   # 3 pages × 5 viewports, headless
node scripts/shots.mjs            # per-section screenshots
node scripts/og.mjs               # regenerate the share image
python3 scripts/build-fonts.py    # re-subset the fonts (needs fonttools)
```

`verify.mjs` builds, then audits every page at every viewport for console
errors, failed requests, horizontal overflow, content stuck invisible, heading
order, form labels, touch-target size, CLS and LCP. It drives a headless Chrome
it launches itself — a backgrounded tab freezes `requestAnimationFrame`, which
silently suppresses every scroll reveal and makes screenshots lie.

## A few decisions worth knowing about

Each of these was measured, and several reversed an assumption:

- **No GSAP.** ScrollTrigger cost ~43 KB gzipped — triple the rest of the
  site's JS — to do what IntersectionObserver and the Web Animations API now do
  natively. Removing it took JS from 56.7 KB to 9.6 KB.
- **The WebGL loupe is built on first pointer interaction, not on load.**
  Creating the context and compiling the shader costs ~770ms of blocking time
  under a 4× CPU throttle. Deferring to `requestIdleCallback` was tried and was
  *worse* (it moves the work into the Total Blocking Time window: Performance
  74). Deferring to interaction gives TBT 0ms.
- **Every `h1` is revealed by CSS, never by script.** It is the LCP element on
  every page, so script-revealing it added the whole parse-plus-animation time
  to LCP — measured 2044ms → 132ms.
- **Fonts are subset with every variation axis preserved**, 187 KB → 110 KB.
  The fallback faces are metric-matched by comparing a frequency-weighted mean
  advance width against the *real* system font files. Comparing
  `OS/2.xAvgCharWidth` across families does not work — foundries compute it over
  different glyph sets, and it produced a `size-adjust` wrong by 20%. Result is
  CLS 0.000 everywhere.
- **The lens is flat-field to 96% of its radius.** A hemisphere profile (the
  obvious choice) bows the column rules into meridians and the whole thing reads
  as a glass marble instead of a loupe.

More in [`docs/ai/`](docs/ai/) — `BRIEF.md` for why it looks like this,
`PLAN.md` for architecture and what was tried and rejected, `STATE.md` for
measurements, known limitations, and the independent review log.

## Deploying

Static output, so it runs anywhere. Built for Cloudflare Pages:

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | 22 (see `.nvmrc`) |

Set `PUBLIC_WEB3FORMS_KEY` and `PUBLIC_CONTACT_EMAIL` as build environment
variables — `.env` is gitignored, so the form falls back to mail-draft mode
without them.
