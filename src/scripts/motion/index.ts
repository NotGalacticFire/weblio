import { initReveals } from './reveal';
import { initMagnetic } from './magnetic';
import { initFolio } from './folio';

/* ============================================================================
   Motion bootstrap.

   Smooth scrolling is opt-in by capability, not by default:
     · prefers-reduced-motion → native scrolling, untouched
     · coarse pointer         → native scrolling; touch momentum is already
                                good, and hijacking it makes phones feel worse
   ========================================================================= */

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const coarse = matchMedia('(pointer: coarse)');

/** Anchor scrolling that respects reduced motion and the sticky nav. */
function initAnchors(scrollTo?: (el: HTMLElement) => void) {
  document.querySelectorAll<HTMLAnchorElement>('a[href^="/#"], a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href')?.split('#')[1];
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      if (scrollTo) {
        scrollTo(target);
      } else {
        const top = target.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top, behavior: reduced.matches ? 'auto' : 'smooth' });
      }
      // Keep the heading focusable target for keyboard users.
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      history.pushState(null, '', `#${id}`);
    });
  });
}

async function initSmoothScroll() {
  if (reduced.matches || coarse.matches) {
    initAnchors();
    return;
  }

  try {
    const { default: Lenis } = await import('lenis');
    const lenis = new Lenis({
      duration: 0.85,
      // Short, near-linear-out. Long durations read as lag, not polish.
      easing: (t: number) => 1 - Math.pow(1 - t, 3),
      smoothWheel: true,
      touchMultiplier: 1,
    });

    /* The loop runs only while the page is actually scrolling.
       The obvious implementation — `raf(loop)` rescheduling unconditionally —
       burns a frame every 16ms forever on every page, including /404 where
       there is nothing to scroll. It also makes the claim in the Evidence
       section ("stops entirely when nothing is moving") untrue, which matters
       more than the cycles. */
    let raf = 0;
    let idleFrames = 0;

    const loop = (time: number) => {
      lenis.raf(time);

      // Settle detection: Lenis reports isScrolling while it is interpolating.
      // A few grace frames avoid stopping between a wheel tick and the easing
      // that follows it.
      if (!lenis.isScrolling && Math.abs(lenis.velocity) < 0.05) {
        if (++idleFrames > 6) {
          raf = 0;
          return;
        }
      } else {
        idleFrames = 0;
      }
      raf = requestAnimationFrame(loop);
    };

    const kick = () => {
      if (raf || document.visibilityState !== 'visible') return;
      idleFrames = 0;
      raf = requestAnimationFrame(loop);
    };

    // Lenis attaches its own wheel/touch listeners and updates its target; we
    // only need to make sure a frame loop exists to animate toward it.
    window.addEventListener('wheel', kick, { passive: true });
    window.addEventListener('touchstart', kick, { passive: true });
    window.addEventListener('keydown', kick, { passive: true });

    // Stop entirely when the tab is hidden rather than letting rAF be
    // throttled — a paused loop that resumes with a huge delta makes Lenis jump.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      } else {
        kick();
      }
    });

    kick();

    // Anchor jumps also need a live loop to animate toward the target.
    initAnchors((el) => { kick(); lenis.scrollTo(el, { offset: -80 }); });
  } catch {
    // Smooth scroll is a nicety; never let it take the page down with it.
    initAnchors();
  }
}

function boot() {
  // The hero's entire opening is CSS (see Hero.astro) so that the LCP element
  // is not waiting on this script.
  initReveals();
  initMagnetic();
  initFolio();
  initSmoothScroll();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
