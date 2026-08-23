# Weblio — Brief

## Phase 1 findings (inspection, 2026-08-22)

**There is no existing website or codebase.**

| Check | Result |
| --- | --- |
| Repo `/weblio` | Completely empty. No framework, no assets, no git. |
| `weblio.design` DNS | Porkbun nameservers → `pixie.porkbun.com` (Porkbun parking) |
| `https://weblio.design` | TLS handshake fails against system LibreSSL; plain HTTP serves a **Porkbun "Coming Soon" parked page** |
| Page content | Porkbun boilerplate: bun graphic, "Coming Soon", "A brand new website is on its way", "Start Building My Website" CTA, Porkbun UA analytics tag |
| Wayback Machine | `archived_snapshots: {}` — the domain has **never** hosted a real site |
| Existing brand assets | None found anywhere on the machine |

**Conclusion:** this is a greenfield build, not an evolution. Nothing from the parked page is worth
preserving. There is no technical debt to inherit and no design to respect. Every decision below is
made from scratch.

## Confirmed constraints (from Ravi, 2026-08-22)

1. **No real client work exists yet.** The Work section must be honest capability demonstration and
   clearly-labelled concept work. No invented clients, logos, testimonials, metrics, awards,
   employees, or years of experience. The site itself is the primary proof.
2. **Contact** goes to a static-friendly form endpoint (Web3Forms), configured by env var, with a
   `mailto:` degradation when unset.
3. **Hosting**: "whatever is both free and makes the site the best it can possibly be."
   → **Cloudflare Pages** (free tier has unlimited bandwidth and requests, and the best free edge
   network). Build output is fully static, so it drops onto Netlify / Vercel / Porkbun unchanged.
4. **Art direction**: "The Folio" (chosen from three presented directions).

## Positioning

Weblio is Ravi, working solo, building websites for businesses whose current sites are dated.

- Do **not** posture as a large agency.
- Do **not** claim a team, a history, or clients that do not exist.
- Do **not** mention being a student.
- Confidence comes from the craft of this site, not from claims.

Target visitor: a local business owner who knows their website is bad but cannot articulate why.
They must, within seconds, understand (a) this person is unusually good at websites, (b) they build
sites like this, (c) here is how to reach them.

## Visual concept — "The Folio"

The name *Weblio* contains **folio** — a sheet, a page, a leaf of a book. The concept is the web as
a printed folio: print-grade typography, a hairline grid, generous margins, folio numbers, register
marks — colliding with the one thing print can never do: **light that responds to you**.

The tension the whole site is built on:

> **Very calm composition. Very unexpected optics.**

- **Paper** `#F2EFE9` — warm off-white ground, not white
- **Ink** `#14110E` — warm near-black, not `#000`
- **Vermilion** `#E4431F` — a printer's registration-mark red, used sparingly and only with intent
- Display type with **live variable axes** (Fraunces `wght` / `SOFT` / `WONK` / `opsz`)
- A hairline print grid that **refracts through a real WebGL lens** under the cursor

Explicitly rejected: purple gradients, glowing orbs, glass card walls, bento grids, floating
feature cards, stock 3D shapes, fake dashboards, gradient text, generic SaaS sections.

## Architecture decisions (Opus, owns risk)

| Decision | Rationale |
| --- | --- |
| **Astro 7, static output** | Zero JS by default; ships only the islands that need it. Directly serves the Lighthouse targets. Portable to any host. |
| **No React / no UI framework** | Removes ~45 KB gzip and makes hydration warnings structurally impossible. Islands are plain TypeScript. |
| **Raw WebGL2, not Three.js** | The hero is one fullscreen quad. It needs no scene graph. Three.js would cost ~150 KB gzip for nothing. Custom GLSL instead. |
| **No animation library** | GSAP + ScrollTrigger cost ~43 KB gz — triple the rest of the site's JS — to do what IntersectionObserver and the Web Animations API now do natively. Removed after measuring; JS fell 56.7 KB → 9.3 KB gz. |
| **Lenis** | 5.4 KB gz smooth scroll, dynamically imported. Never loaded under `prefers-reduced-motion` or on touch, so most mobile visitors never fetch it. |
| **Self-hosted variable fonts** | `@fontsource-variable/*`, subset, preloaded. No render-blocking third-party font CSS, no FOUT. |
| **Astro view transitions** | Route changes with no white flash and a shared motif. |

## Acceptance criteria

1. First viewport is extraordinary and works without JS as a static composition.
2. Every expensive effect has a desktop path, a mobile path, a reduced-motion path, and a fallback.
3. Lighthouse (production build, mobile): Performance ≥ 90, A11y ≥ 95, Best Practices ≥ 95, SEO ≥ 95.
4. Zero console errors, zero hydration warnings, zero layout shift from font or canvas loading.
5. Keyboard-operable end to end with visible focus; contrast passes AA.
6. Every factual claim on the page is true.
7. The contact path is obvious from any scroll position.

## Non-goals

- A CMS. Content is small and hand-authored.
- A blog.
- Any server runtime.
- Fabricated social proof of any kind.
