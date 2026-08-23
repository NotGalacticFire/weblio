/* ============================================================================
   The motion language.

   Three moves, used everywhere, and nothing else:

     RISE   content arrives from 14px below, fading in.
     WIPE   headings are uncovered by a rising edge, like a sheet being lifted.
     DRAW   hairlines scale in from their left edge. The sheet being ruled.

   No scale, no rotation, no blur, no bounce. The restraint is the point: when
   almost everything moves the same way, the loupe reads as the one
   extraordinary thing on the page rather than one effect among many.

   Built on IntersectionObserver and the Web Animations API rather than a
   scroll library. That is not austerity for its own sake — GSAP plus
   ScrollTrigger costs ~43 KB gzipped, roughly triple the rest of this site's
   JavaScript, to do work the platform now does natively. IO also recomputes
   its own geometry, so unlike a cached-position scroll library it cannot leave
   an element stranded at opacity 0 because it measured before the webfont
   landed.
   ========================================================================= */

const reduced = matchMedia('(prefers-reduced-motion: reduce)');

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
const RISE = 14;
const STAGGER = 70;

type Variant = 'rise' | 'wipe' | 'draw';

function variantOf(el: Element): Variant {
  const v = el.getAttribute('data-reveal');
  if (v === 'wipe') return 'wipe';
  if (el.hasAttribute('data-rule')) return 'draw';
  return 'rise';
}

function keyframes(variant: Variant): Keyframe[] {
  switch (variant) {
    case 'wipe':
      return [
        { opacity: 0, clipPath: 'inset(0 0 100% 0)', transform: `translateY(${RISE}px)` },
        { opacity: 1, clipPath: 'inset(0 0 -10% 0)', transform: 'translateY(0)' },
      ];
    case 'draw':
      return [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }];
    default:
      return [
        { opacity: 0, transform: `translateY(${RISE}px)` },
        { opacity: 1, transform: 'translateY(0)' },
      ];
  }
}

function play(el: HTMLElement, variant: Variant, delay: number, quick = false) {
  const duration = quick ? 520 : variant === 'draw' ? 1000 : 820;
  if (variant === 'draw') el.style.transformOrigin = '0 50%';

  const anim = el.animate(keyframes(variant), {
    duration,
    delay,
    easing: EASE,
    fill: 'both',
  });

  // Hand the final state to CSS and drop the animation, so the element is not
  // left owning a permanent WAAPI fill that would override later styles.
  anim.addEventListener('finish', () => {
    el.style.opacity = '';
    el.style.transform = '';
    el.style.clipPath = '';
    el.style.transformOrigin = '';
    el.setAttribute('data-revealed', '');
    anim.cancel();
  });
}

export function initReveals(scope: ParentNode = document) {
  const nodes = [
    ...scope.querySelectorAll<HTMLElement>('[data-reveal], [data-rule]'),
    // The hero runs its own scripted opening; exclude it from scroll reveals
    // so the two never fight over the same properties.
  ]
    // The hero runs its own opening, and every h1 is revealed by CSS so it can
    // paint without waiting for this script (see base.css).
    .filter((el) => !el.closest('[data-hero]') && el.tagName !== 'H1');

  if (!nodes.length) return () => {};

  if (reduced.matches) {
    for (const el of nodes) el.setAttribute('data-revealed', '');
    return () => {};
  }

  /* Anything already on screen at load must not wait for an observer round
     trip. On a page whose largest text sits above the fold, that wait is
     added directly to LCP — the heading cannot be the largest *contentful*
     paint while it is still at opacity 0. Start those immediately, and on a
     shorter curve, then hand the rest to the observer. */
  const immediate: HTMLElement[] = [];
  const deferred: HTMLElement[] = [];
  const fold = window.innerHeight;
  for (const el of nodes) {
    (el.getBoundingClientRect().top < fold ? immediate : deferred).push(el);
  }

  immediate.forEach((el, i) => play(el, variantOf(el), Math.min(i, 5) * 55, true));

  const waiting = new Set(deferred);

  // Elements that come into view together should arrive together, staggered,
  // rather than each animating on its own clock.
  let pending: HTMLElement[] = [];
  let flushId = 0;

  const flush = () => {
    flushId = 0;
    // Top-to-bottom so the stagger reads as a sequence down the page.
    pending.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    pending.forEach((el, i) => play(el, variantOf(el), Math.min(i, 6) * STAGGER));
    pending = [];
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        /* `isIntersecting` alone is not enough. Scroll fast — a flung
           trackpad, a jump to an anchor, restoring a scroll position — and the
           observer can report an element only once it is already above the
           viewport, having never sampled it while it was on screen. Without
           the second test those elements stay at opacity 0 permanently, with
           their content unreachable. Anything that has ended up above the fold
           has been passed, so reveal it. */
        const passed = entry.boundingClientRect.bottom < (entry.rootBounds?.top ?? 0);
        if (!entry.isIntersecting && !passed) continue;

        const el = entry.target as HTMLElement;
        if (!waiting.has(el)) continue;   // the sweep already claimed it
        waiting.delete(el);
        io.unobserve(el);
        // Already scrolled past: show it, do not animate something the visitor
        // has moved beyond.
        if (passed) {
          el.setAttribute('data-revealed', '');
          continue;
        }
        pending.push(el);
      }
      if (pending.length && !flushId) flushId = requestAnimationFrame(flush);
    },
    // Fire a little before the element reaches the fold, so content is already
    // settled by the time it is properly in view.
    { rootMargin: '0px 0px -12% 0px', threshold: 0.01 }
  );

  for (const el of deferred) io.observe(el);

  /* Safety net.
     IntersectionObserver coalesces: scroll far enough between two deliveries
     and an element goes from below the viewport to above it having never been
     reported as intersecting, so it stays at opacity 0 with its content
     unreachable. Catching the transition is not reliable, so instead sweep
     absolute positions on scroll — cheap, since the set only shrinks, and it
     makes "content stuck invisible" structurally impossible rather than
     merely unlikely. */
  let sweepId = 0;
  const sweep = () => {
    sweepId = 0;
    if (!waiting.size) return;
    const h = window.innerHeight;
    for (const el of waiting) {
      const top = el.getBoundingClientRect().top;
      if (top >= h) continue;         // still below the fold; leave it to IO
      waiting.delete(el);
      io.unobserve(el);
      if (top < 0) el.setAttribute('data-revealed', '');  // already passed
      else if (!el.hasAttribute('data-revealed')) play(el, variantOf(el), 0, true);
    }
  };
  const onScroll = () => {
    if (!sweepId) sweepId = requestAnimationFrame(sweep);
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  return () => {
    io.disconnect();
    window.removeEventListener('scroll', onScroll);
    if (flushId) cancelAnimationFrame(flushId);
    if (sweepId) cancelAnimationFrame(sweepId);
  };
}
