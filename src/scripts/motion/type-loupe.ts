import { subscribeGlass, requestGlassFrame, glassPrefs, type GlassState } from '../glass';

/* ============================================================================
   Type under the glass.

   The headline is real text, split into characters at build time — not by JS,
   so the HTML ships complete, there is no CLS, and it works with JS disabled.

   As the glass passes over it, characters magnify the way anything under a
   loupe does: scaled up, and pushed outward from the centre of the lens. Both
   are compositor-only transforms. Nothing here touches layout, and in
   particular nothing animates font-variation-settings per frame — changing a
   variation axis reshapes glyphs and would reflow the whole headline on every
   pointer move.
   ========================================================================= */

interface Char {
  el: HTMLElement;
  /** Centre offset relative to the measured container. */
  dx: number;
  dy: number;
  /** Last written values, so we can skip no-op style writes. */
  lastScale: number;
  lastX: number;
  lastY: number;
}

const MAGNIFY = 0.20;   // peak scale increase at the centre of the glass
const PUSH = 0.10;      // outward displacement, as a fraction of the offset
const REACH = 1.12;     // how far past the rim the effect still registers

export function createTypeLoupe(root: HTMLElement): () => void {
  const { reduced, coarse } = glassPrefs;

  // No pointer means no glass to magnify under. Leave the type alone.
  if (coarse.matches) return () => {};

  const chars: Char[] = Array.from(
    root.querySelectorAll<HTMLElement>('[data-char]')
  ).map((el) => ({ el, dx: 0, dy: 0, lastScale: 1, lastX: 0, lastY: 0 }));

  if (!chars.length) return () => {};

  let containerRect = root.getBoundingClientRect();
  let measured = false;
  let anyActive = false;

  function measure() {
    // Read every character box once, and store centres relative to the
    // container. From here on we only ever read one rect per frame.
    containerRect = root.getBoundingClientRect();
    for (const c of chars) {
      // Clear any transform first so we measure the resting position.
      c.el.style.transform = '';
      c.lastScale = 1;
      c.lastX = 0;
      c.lastY = 0;
    }
    for (const c of chars) {
      const r = c.el.getBoundingClientRect();
      c.dx = r.left + r.width / 2 - containerRect.left;
      c.dy = r.top + r.height / 2 - containerRect.top;
    }
    measured = true;
    // Geometry changed, so the current frame is now stale. Without this the
    // effect stays absent until the visitor happens to move or scroll again —
    // which is exactly what happens when a slow webfont lands after the glass
    // has already settled.
    requestGlassFrame();
  }

  function releaseAll() {
    for (const c of chars) {
      c.el.style.transform = '';
      c.el.style.willChange = '';
      c.lastScale = 1;
      c.lastX = 0;
      c.lastY = 0;
    }
    anyActive = false;
  }

  function apply(s: GlassState) {
    if (!measured) return;
    // Reduced motion can be switched on mid-session. Returning early without
    // releasing would freeze whatever letters were magnified at that moment.
    if (reduced.matches) {
      if (anyActive) releaseAll();
      return;
    }

    // The effect is off entirely when the glass is not present, so we can skip
    // the whole pass and reset in one go.
    if (s.active < 0.002) {
      if (anyActive) releaseAll();
      return;
    }
    anyActive = true;

    containerRect = root.getBoundingClientRect();
    const gx = s.x - containerRect.left;
    const gy = s.y - containerRect.top;
    const R = s.radius;
    const reach = R * REACH;

    for (const c of chars) {
      const ox = c.dx - gx;
      const oy = c.dy - gy;
      const d = Math.hypot(ox, oy);

      let scale = 1;
      let tx = 0;
      let ty = 0;

      if (d < reach) {
        const nd = Math.min(1, d / R);
        // Hemisphere profile, identical to the one the shader uses so the
        // glass and the type agree about where the lens is thickest.
        const h = Math.sqrt(Math.max(0, 1 - nd * nd)) * s.active;
        scale = 1 + h * MAGNIFY;
        const push = h * PUSH;
        tx = ox * push;
        ty = oy * push;
      }

      // Skip writes that would not be visible. At typical display sizes a
      // 0.0015 scale delta is well under a tenth of a pixel.
      if (
        Math.abs(scale - c.lastScale) < 0.0015 &&
        Math.abs(tx - c.lastX) < 0.05 &&
        Math.abs(ty - c.lastY) < 0.05
      ) {
        continue;
      }

      c.lastScale = scale;
      c.lastX = tx;
      c.lastY = ty;

      if (scale === 1 && tx === 0 && ty === 0) {
        c.el.style.transform = '';
        c.el.style.willChange = '';
      } else {
        c.el.style.willChange = 'transform';
        c.el.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
      }
    }
  }

  /* Measure only when the boxes are actually at rest.
     Two things move them:
       · the webfont swapping in, which changes every advance width
       · the headline's CSS intro, which holds a translateY on each character
     The second is easy to miss. A CSS animation overrides inline styles, so
     clearing `style.transform` in measure() does not undo it — measuring
     mid-intro records every centre several pixels high, and the glass then
     magnifies the wrong characters for the rest of the session. Waiting on the
     animations costs nothing: this only runs on the first pointer move. */
  function measureWhenSettled() {
    const anims = root.getAnimations?.({ subtree: true }) ?? [];
    const finished = anims.map((a) => a.finished.catch(() => undefined));
    if (!finished.length) {
      measure();
      return;
    }
    // Never let a stalled or infinite animation block measurement entirely.
    Promise.race([
      Promise.all(finished),
      new Promise((r) => setTimeout(r, 1500)),
    ]).then(measure);
  }

  if (document.fonts?.status === 'loaded') measureWhenSettled();
  else document.fonts?.ready.then(measureWhenSettled).catch(measureWhenSettled);

  const ro = new ResizeObserver(() => measure());
  ro.observe(root);

  const unsubscribe = subscribeGlass(apply);

  return () => {
    unsubscribe();
    ro.disconnect();
    for (const c of chars) {
      c.el.style.transform = '';
      c.el.style.willChange = '';
    }
  };
}
