/* ============================================================================
   The glass — shared state for everything the loupe touches.

   The WebGL sheet and the per-character type response must agree on exactly
   where the glass is, or the illusion falls apart: the type would magnify
   somewhere the lens is not. So the easing lives here, once, and both
   consumers subscribe to the same driver.

   One rAF loop for the whole hero. It stops completely when the glass has
   settled, when the tab is hidden, and when the user asks for reduced motion.
   ========================================================================= */

export interface GlassState {
  /** Eased position of the glass, in px relative to the viewport. */
  x: number;
  y: number;
  /** 0..1 normalised speed. Drives the vermilion rim flash. */
  vel: number;
  /** 0..1 presence. 0 before the first pointer move, 0 when the pointer leaves. */
  active: number;
  /** Radius of the glass in CSS px. */
  radius: number;
}

type Subscriber = (s: GlassState) => void;

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const coarse = matchMedia('(pointer: coarse)');

const state: GlassState = { x: 0, y: 0, vel: 0, active: 0, radius: 140 };

let targetX = 0;
let targetY = 0;
let targetActive = 0;
let prevX = 0;
let prevY = 0;

let subs: Subscriber[] = [];
let raf = 0;
let running = false;
let lastTime = 0;
let pageVisible = true;
let started = false;
let hasPointer = false;

function emit() {
  for (const fn of subs) fn(state);
}

function frame(now: number) {
  raf = 0;
  if (!pageVisible) { running = false; return; }

  const dt = Math.min(48, now - lastTime || 16);
  lastTime = now;

  // Framerate-independent exponential easing. The glass has noticeable mass —
  // it trails the pointer, which is what makes it read as a physical object
  // sitting on the page rather than a cursor decoration.
  const k = 1 - Math.pow(0.0022, dt / 1000);
  state.x += (targetX - state.x) * k;
  state.y += (targetY - state.y) * k;
  state.active += (targetActive - state.active) * (1 - Math.pow(0.004, dt / 1000));

  const dx = state.x - prevX;
  const dy = state.y - prevY;
  prevX = state.x;
  prevY = state.y;
  const speed = (Math.hypot(dx, dy) / Math.max(dt, 1)) * 16;
  state.vel += (Math.min(1, speed / 22) - state.vel) * 0.16;

  emit();

  const settled =
    Math.abs(targetX - state.x) < 0.12 &&
    Math.abs(targetY - state.y) < 0.12 &&
    Math.abs(targetActive - state.active) < 0.004 &&
    state.vel < 0.004;

  if (settled) {
    // Snap residuals so the resting frame is exact, emit once more, then stop
    // scheduling entirely. Idle costs nothing.
    state.x = targetX;
    state.y = targetY;
    state.active = targetActive;
    state.vel = 0;
    emit();
    running = false;
    return;
  }

  raf = requestAnimationFrame(frame);
}

/** Ask for frames. Safe to call as often as you like. */
export function requestGlassFrame() {
  if (!pageVisible) return;
  if (reduced.matches) { emit(); return; }  // one static frame, never a loop
  if (running) return;
  running = true;
  lastTime = performance.now();
  raf = requestAnimationFrame(frame);
}

export function setGlassRadius(r: number) {
  state.radius = r;
  requestGlassFrame();
}

/** Place the glass without easing — used on resize and for the resting pose. */
export function placeGlass(x: number, y: number) {
  targetX = state.x = prevX = x;
  targetY = state.y = prevY = y;
  requestGlassFrame();
}

export function glassHasPointer() {
  return hasPointer;
}

export function subscribeGlass(fn: Subscriber): () => void {
  subs.push(fn);
  start();
  requestGlassFrame();
  return () => {
    subs = subs.filter((s) => s !== fn);
    if (!subs.length) stop();
  };
}

// --- input ----------------------------------------------------------------

const onPointerMove = (e: PointerEvent) => {
  if (reduced.matches) return;
  targetX = e.clientX;
  targetY = e.clientY;
  if (!hasPointer) {
    // First sighting: drop the glass where the pointer already is rather than
    // flying it in from the resting pose.
    hasPointer = true;
    state.x = prevX = targetX;
    state.y = prevY = targetY;
  }
  targetActive = 1;
  requestGlassFrame();
};

const onPointerLeave = () => {
  // Touch devices have no hover, so the glass stays put rather than vanishing.
  targetActive = coarse.matches ? 1 : 0;
  requestGlassFrame();
};

const onVisibility = () => {
  pageVisible = document.visibilityState === 'visible';
  if (pageVisible) requestGlassFrame();
  else if (raf) { cancelAnimationFrame(raf); raf = 0; running = false; }
};

const onReducedChange = () => {
  if (reduced.matches && raf) { cancelAnimationFrame(raf); raf = 0; running = false; }
  requestGlassFrame();
};

function start() {
  if (started) return;
  started = true;
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerleave', onPointerLeave, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  reduced.addEventListener('change', onReducedChange);
  if (coarse.matches) targetActive = 1;
}

function stop() {
  if (!started) return;
  started = false;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  running = false;
  window.removeEventListener('pointermove', onPointerMove);
  document.removeEventListener('pointerleave', onPointerLeave);
  document.removeEventListener('visibilitychange', onVisibility);
  reduced.removeEventListener('change', onReducedChange);
}

export const glassPrefs = { reduced, coarse };
