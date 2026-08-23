/* ============================================================================
   PULL — magnetic hover.

   The element leans toward the pointer inside its own padded bounds, then
   releases. Smoothing is done by a CSS transition rather than a rAF loop, so
   this costs one style write per pointermove and nothing at all at rest.
   ========================================================================= */

const STRENGTH = 0.3;
const PAD = 26;
const MAX = 14;   // px — beyond this it stops looking magnetic and starts looking broken

export function initMagnetic(scope: ParentNode = document) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)');
  if (reduced.matches || coarse.matches) return () => {};

  const cleanups: Array<() => void> = [];

  scope.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((el) => {
    el.style.transition = 'transform 480ms cubic-bezier(0.16, 1, 0.3, 1)';

    let engaged = false;
    /* Cached resting geometry.
       Reading getBoundingClientRect() inside pointermove would force a layout
       on every event, because the previous move already wrote a transform to
       this element — the classic write-then-read reflow. It is also wrong:
       the rect it returns is the *displaced* box, so the magnet would chase
       its own output. Measure once on entry instead. */
    let box = { cx: 0, cy: 0, left: 0, right: 0, top: 0, bottom: 0 };

    const measure = () => {
      const prev = el.style.transform;
      el.style.transform = '';
      const r = el.getBoundingClientRect();
      el.style.transform = prev;
      box = {
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
      };
    };

    const release = () => {
      if (!engaged) return;
      engaged = false;
      el.style.transform = '';
      window.removeEventListener('pointermove', onMove);
    };

    const onMove = (e: PointerEvent) => {
      if (
        e.clientX < box.left - PAD || e.clientX > box.right + PAD ||
        e.clientY < box.top - PAD || e.clientY > box.bottom + PAD
      ) {
        release();
        return;
      }
      const cx = Math.max(-MAX, Math.min(MAX, (e.clientX - box.cx) * STRENGTH));
      const cy = Math.max(-MAX, Math.min(MAX, (e.clientY - box.cy) * STRENGTH));
      el.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
    };

    const onEnter = () => {
      if (engaged) return;
      engaged = true;
      measure();
      window.addEventListener('pointermove', onMove, { passive: true });
    };

    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointerleave', release);
    // A magnetic element still offset after focus moves away looks broken.
    el.addEventListener('blur', release);

    cleanups.push(() => {
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', release);
      el.removeEventListener('blur', release);
      window.removeEventListener('pointermove', onMove);
      el.style.transition = '';
      el.style.transform = '';
    });
  });

  return () => cleanups.forEach((fn) => fn());
}
