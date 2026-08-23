# Weblio — state

**Status: production-ready.** Built 2026-08-22 from an empty repository.

## Measured results

Lighthouse 12, production `dist/` served gzipped, headless Chrome with software
GL (SwiftShader — a pessimistic stand-in for a real GPU):

| Page | Form factor | Perf | A11y | BP | SEO | FCP | LCP | TBT | CLS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | mobile | 100 | 100 | 100 | 100 | 0.9s | 1.7s | 0ms | 0 |
| `/` | desktop | 100 | 100 | 100 | 100 | 0.3s | 0.4s | 0ms | 0 |
| `/contact` | mobile | 100 | 100 | 100 | 100 | 1.0s | 1.7s | 0ms | 0 |
| `/contact` | desktop | 100 | 100 | 100 | 100 | 0.3s | 0.4s | 0ms | 0 |
| `/404` | mobile | 100 | 100 | 100 | 100 | 0.9s | 1.7s | 0ms | 0 |
| `/404` | desktop | 100 | 100 | 100 | 100 | 0.3s | 0.4s | 0ms | 0 |

Payload: **9.3 KB JS gzipped** (+5.4 KB Lenis, loaded only for pointer devices
that allow motion) · 7 KB CSS, inlined · 110.6 KB fonts.

`node scripts/verify.mjs` — 3 pages × 5 viewports: **0 failures**.

## Decisions that were measured, not assumed

Each of these was tried, measured, and reversed or kept on the evidence.

| Change | Result |
| --- | --- |
| Remove GSAP + ScrollTrigger | JS 56.7 → 9.3 KB gz. Kept. |
| Defer WebGL init to `requestIdleCallback` | Perf 98 → **74**, TBT 80 → 1,400ms. Moves the work into the TBT window. **Reverted.** |
| Defer WebGL init to first pointer interaction | TBT → **0ms**, Perf → **100**. Kept. |
| Inline stylesheets | FCP 1.9 → 1.5s. Kept. |
| Hero opening moved from JS to CSS | LCP element (`p.lede`) 2044ms → **132ms**. Kept. |
| Halftone: 3 rosette screens → 1 at 45° | Three interfere into speckle; one reads as print. Kept. |

## Known limitations

1. **`PUBLIC_WEB3FORMS_KEY` is not set.** The form renders and validates either
   way, but until a key is configured it composes a pre-filled mail-client
   draft rather than posting. Set it in `.env` (see `.env.example`) to switch to
   direct submission. Nothing else needs to change.
2. **Contact address is `ravi@weblio.design`** (confirmed by Ravi to exist).
   Override with `PUBLIC_CONTACT_EMAIL` if it ever changes.
3. **Safari and Firefox have not been run.** Only Chrome 151 was available in
   this environment, headless and headed. The code avoids the usual Safari
   traps (`100svh` not `100vh`; `-webkit-backdrop-filter` paired and dropped on
   small screens; `woff2-variations` with a `format()` fallback path;
   `requestIdleCallback` not relied upon) but this is reasoning, not testing.
4. **Software GL only.** All WebGL measurements used SwiftShader. Real hardware
   will be faster, so the numbers above are a floor, not a ceiling.
5. **The comparison in section 02 is invented.** "Halliday & Sons" is a
   fictional business, labelled as such on the page.

## Truthfulness audit

Every factual claim on the site was checked against reality:

- No clients, testimonials, logos, awards, metrics, headcount or years claimed.
- The Proof section says plainly that there are no client logos yet.
- The colophon lists only what is actually used — GSAP was removed from the
  build *and* from the colophon in the same change.
- The font figure quoted on the page (110 KB) is the real subset output.
- The comparison is explicitly labelled a demonstration, not a client.

## If picking this up again

- `docs/ai/BRIEF.md` — why the site looks like this
- `docs/ai/PLAN.md` — architecture, and what was tried and rejected
- Run `node scripts/verify.mjs --shots` first; it will tell you what is broken
  faster than reading anything.

## Independent adversarial review (Sol / GPT-5.6, 2026-08-22)

13m 40s, read-only. **No critical or high defect proven.** Its own verification
was sandbox-blocked (it could not write `.astro/`, bind port 4322, or launch
Chrome), so its findings were code-reading, not measurement — each was
confirmed or rejected here before acting.

| # | Sev | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | med | Lenis rAF loop never stops | **Fixed.** Loop now starts on input and stops after 6 idle frames. Also an honesty fix: the Evidence section claims motion stops. |
| 2 | med | Unkeyed form is dead without JS — POSTs to the static page and discards input | **Fixed.** `action` falls back to `mailto:` with `enctype="text/plain"`. |
| 3 | med | `webglcontextrestored` resumes painting with destroyed GL objects | **Fixed.** No longer clears `contextLost`; the CSS sheet is a complete end state. |
| 4 | med | Re-measure after font swap never repaints | **Fixed.** `measure()` now calls `requestGlassFrame()`. |
| 5 | med | Enabling reduced motion mid-session freezes magnified letters | **Fixed.** `apply()` releases transforms before bailing. |
| 6 | med | Open mobile sheet survives resize past the breakpoint | **Fixed.** CSS hides it above the breakpoint + a `matchMedia` handler closes it. |
| 7 | med | Intro animation and type-loupe both own character transforms → snap ~1s after load | **Already fixed** before the review landed: `apply()` is gated on `measured`, which is only set after the intro animations settle. |
| 8 | med | Audit had no LCP failure threshold; reported 2.9s and still passed | **Fixed.** 2500ms budget, plus a browser warmup that removed the cold-start artifact entirely (2928ms → ~130ms). |
| 9 | low | `verify.mjs` printed "building…" without building | **Fixed.** It now actually builds; `--no-build` opts out. |
| 10 | low | Teardown handles discarded | **Accepted, not fixed.** Static MPA: page unload frees everything. Fixing it would add lifecycle code with no user-visible benefit. Noted here so the next person does not re-derive it. |
| 11 | low | Slider announces the same value on consecutive key presses | **Fixed.** The input's own `min`/`max` are now the 26–74 clamp, so one arrow press is one percent. |

One flake remains: under heavy host load the new LCP budget can trip (observed
once in ~12 runs while RobloxStudio and Chrome were saturating the CPU). That is
the threshold working, not a site defect.
