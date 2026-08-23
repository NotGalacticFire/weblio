/* ============================================================================
   The running head.

   A book tells you where you are on every spread. This does the same: the nav
   carries the folio number and name of whichever section currently owns the
   middle of the viewport, and swaps as you move between them.

   Wayfinding first, decoration second — which is why it is here at all and why
   it uses no scroll listener. IntersectionObserver with a centre-band root
   margin tells us exactly when a section takes over.
   ========================================================================= */

export function initFolio() {
  const out = document.querySelector<HTMLElement>('[data-folio-out]');
  if (!out) return () => {};

  const numEl = out.querySelector<HTMLElement>('[data-folio-num]');
  const nameEl = out.querySelector<HTMLElement>('[data-folio-name]');
  if (!numEl || !nameEl) return () => {};

  const sections = [...document.querySelectorAll<HTMLElement>('main section')]
    .map((section) => {
      const num = section.querySelector('[aria-label^="Folio"]')?.textContent?.trim();
      // The eyebrow is the first .label in the section's folio header.
      const name = section.querySelector('header .label')?.textContent?.trim();
      return num && name ? { section, num, name } : null;
    })
    .filter((x): x is { section: HTMLElement; num: string; name: string } => x !== null);

  if (!sections.length) return () => {};

  let current = '';

  const set = (num: string, name: string) => {
    const key = num + name;
    if (key === current) return;
    current = key;
    numEl.textContent = num;
    nameEl.textContent = name;
    // Retrigger the swap animation.
    out.removeAttribute('data-swap');
    void out.offsetWidth;
    out.setAttribute('data-swap', '');
    out.hidden = false;
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const hit = sections.find((s) => s.section === entry.target);
        if (hit) set(hit.num, hit.name);
      }
    },
    // A narrow band across the middle of the viewport: a section becomes
    // current when it crosses the centre line, not when it first peeks in.
    { rootMargin: '-45% 0px -45% 0px', threshold: 0 }
  );

  for (const s of sections) io.observe(s.section);

  // The hero has no folio; hide the running head while it owns the screen.
  const hero = document.querySelector('[data-hero]');
  let heroIo: IntersectionObserver | null = null;
  if (hero) {
    heroIo = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (e && e.isIntersecting && e.intersectionRatio > 0.55) {
          out.hidden = true;
          current = '';
        }
      },
      { threshold: [0, 0.55, 1] }
    );
    heroIo.observe(hero);
  }

  return () => {
    io.disconnect();
    heroIo?.disconnect();
  };
}
