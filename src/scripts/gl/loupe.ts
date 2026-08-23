import fragSource from './loupe.frag?raw';
import {
  subscribeGlass,
  requestGlassFrame,
  setGlassRadius,
  placeGlass,
  glassHasPointer,
  glassPrefs,
  type GlassState,
} from '../glass';

/* ============================================================================
   Renderer for THE LOUPE.

   Owns GL objects and painting only — position, easing and input all live in
   glass.ts, so the sheet and the type magnify at exactly the same place.

   Constraints this file exists to satisfy:
     · never paint while hidden, offscreen, or in a lost context
     · cap DPR, and step it down once if we cannot hold frame budget
     · tear down completely, including forcing the context to be released
   ========================================================================= */

const VERT = `#version 300 es
/* One oversized triangle. Cheaper than a quad — no diagonal seam, three verts,
   and no attribute buffer at all: positions come from gl_VertexID. */
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

type RGB = [number, number, number];

export interface LoupeHandle {
  teardown(): void;
}

/** Resolve a CSS custom property to 0..1 RGB using the canvas colour parser. */
function readColor(el: Element, prop: string, fallback: RGB): RGB {
  const raw = getComputedStyle(el).getPropertyValue(prop).trim();
  if (!raw) return fallback;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return fallback;
  ctx.fillStyle = '#000';
  ctx.fillStyle = raw;
  const hex = ctx.fillStyle as string;
  if (!hex.startsWith('#') || hex.length !== 7) return fallback;
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error('[loupe] shader compile failed:', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function createLoupe(canvas: HTMLCanvasElement): LoupeHandle | null {
  const context = canvas.getContext('webgl2', {
    // Transparent: this canvas draws the glass and nothing else, so the CSS
    // sheet underneath stays the single source of the page grid.
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,       // the shader antialiases analytically via fwidth
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
    preserveDrawingBuffer: false,
  });
  if (!context) return null;
  // Rebind after the guard. `resize()` and `paint()` below are hoisted function
  // declarations, and TypeScript will not carry the outer null-narrowing into
  // them — this binding is non-nullable by construction instead.
  const gl: WebGL2RenderingContext = context;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragSource);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);          // the program holds its own reference now
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('[loupe] link failed:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  gl.useProgram(program);
  gl.enable(gl.BLEND);
  // Straight (non-premultiplied) alpha, matching the context option above.
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const u = {
    res: gl.getUniformLocation(program, 'uRes'),
    pointer: gl.getUniformLocation(program, 'uPointer'),
    radius: gl.getUniformLocation(program, 'uRadius'),
    active: gl.getUniformLocation(program, 'uActive'),
    scroll: gl.getUniformLocation(program, 'uScroll'),
    vel: gl.getUniformLocation(program, 'uVel'),
    grid: gl.getUniformLocation(program, 'uGrid'),
    gridX0: gl.getUniformLocation(program, 'uGridX0'),
    dpr: gl.getUniformLocation(program, 'uDpr'),
    ink: gl.getUniformLocation(program, 'uInk'),
    paper: gl.getUniformLocation(program, 'uPaper'),
    accent: gl.getUniformLocation(program, 'uAccent'),
  };

  const { coarse } = glassPrefs;
  const root = document.documentElement;

  let dpr = 1;
  let cssW = 0;
  let cssH = 0;
  let scroll = 0;
  let visible = true;
  let onScreen = true;
  let contextLost = false;
  let disposed = false;
  let dprFloorHit = false;
  let slowFrames = 0;
  let lastFrame = 0;

  let gridPitch = 0;
  let gridX0 = 0;
  /* Bounding box of the previous frame's glass, so the scissored clear also
     erases where the lens just was. */
  const lastBox = { x: 0, y: 0, s: 0 };

  let ink: RGB = [0.08, 0.07, 0.05];
  let paper: RGB = [0.95, 0.94, 0.91];
  let accent: RGB = [0.89, 0.26, 0.12];

  /* Read the page's real column rules rather than assuming them, so the
     magnified grid lines up exactly with the CSS hairlines at the rim — where
     magnification falls to 1 and any mismatch would be obvious. */
  function measureGrid() {
    const rect = canvas.getBoundingClientRect();
    const cols = document.querySelectorAll<HTMLElement>('.sheet-grid__col');
    const first = cols[0];
    if (first && cols.length > 1) {
      const a = first.getBoundingClientRect();
      gridX0 = a.left - rect.left;
      gridPitch = a.width;
    }
    if (!gridPitch || !Number.isFinite(gridPitch)) {
      gridPitch = rect.width / 12;
      gridX0 = 0;
    }
  }

  function readTheme() {
    ink = readColor(root, '--ink', ink);
    paper = readColor(root, '--paper', paper);
    accent = readColor(root, '--accent', accent);
  }

  function maxDpr() {
    if (dprFloorHit) return 1;
    // Coarse pointers are almost always mobile GPUs driving a dense screen.
    return coarse.matches ? 1.25 : 1.75;
  }

  function resize() {
    if (disposed) return;
    const rect = canvas.getBoundingClientRect();
    const nextDpr = Math.min(window.devicePixelRatio || 1, maxDpr());
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w === cssW && h === cssH && nextDpr === dpr) return;

    cssW = w;
    cssH = h;
    dpr = nextDpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    // A resized buffer starts blank, so there is nothing stale to erase.
    lastBox.x = lastBox.y = lastBox.s = 0;
    measureGrid();

    const radius = Math.max(84, Math.min(190, Math.min(w, h) * 0.19));
    setGlassRadius(radius);

    if (!glassHasPointer()) {
      // Resting pose: off-centre and on the third. Never dead centre.
      placeGlass(rect.left + w * 0.66, rect.top + h * 0.56);
    }
    requestGlassFrame();
  }

  function paint(s: GlassState) {
    if (disposed || contextLost || !visible) return;

    // Frame-budget watchdog. If we cannot hold roughly 50fps for a sustained
    // stretch, drop to DPR 1 once and stop measuring.
    const now = performance.now();
    if (lastFrame) {
      if (now - lastFrame > 20) slowFrames++;
      else slowFrames = Math.max(0, slowFrames - 1);
      if (slowFrames > 45 && !dprFloorHit) {
        dprFloorHit = true;
        slowFrames = 0;
        resize();
      }
    }
    lastFrame = now;

    const rect = canvas.getBoundingClientRect();
    const px = (s.x - rect.left) * dpr;
    const py = (s.y - rect.top) * dpr;
    const R = s.radius * dpr;

    /* The shader emits nothing outside the glass, so there is no reason to run
       it there. Scissor both the clear and the draw to the lens bounding box:
       at a 140px radius on a 1600px-wide sheet that is roughly a 30x
       reduction in fragments touched per frame. `lastBox` is cleared too, so
       the previous frame's glass is erased as the lens moves on. */
    const pad = 4 * dpr;
    const x0 = Math.floor(px - R - pad);
    const y0 = Math.floor(canvas.height - py - R - pad);   // GL is y-up
    const size = Math.ceil((R + pad) * 2);

    gl.enable(gl.SCISSOR_TEST);
    const bx = Math.min(x0, lastBox.x);
    const by = Math.min(y0, lastBox.y);
    const bw = Math.max(x0 + size, lastBox.x + lastBox.s) - bx;
    const bh = Math.max(y0 + size, lastBox.y + lastBox.s) - by;
    gl.scissor(bx, by, bw, bh);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform2f(u.res, canvas.width, canvas.height);
    gl.uniform2f(u.pointer, px, py);
    gl.uniform1f(u.radius, R);
    gl.uniform1f(u.active, s.active);
    gl.uniform1f(u.scroll, scroll * dpr);
    gl.uniform1f(u.vel, s.vel);
    gl.uniform1f(u.grid, gridPitch * dpr);
    gl.uniform1f(u.gridX0, gridX0 * dpr);
    gl.uniform1f(u.dpr, dpr);
    gl.uniform3fv(u.ink, ink);
    gl.uniform3fv(u.paper, paper);
    gl.uniform3fv(u.accent, accent);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);

    lastBox.x = x0;
    lastBox.y = y0;
    lastBox.s = size;
  }

  // --- events --------------------------------------------------------------
  const onScroll = () => {
    // The sheet drifts under the glass at a fraction of scroll, so the print
    // and the page move at different rates.
    scroll = window.scrollY * 0.35;
    requestGlassFrame();
  };

  const syncVisible = () => {
    visible = document.visibilityState === 'visible' && onScreen;
    if (!visible) return;

    // A canvas in a hidden tab can report a zero or stale box, so re-measure
    // on the way back rather than trusting whatever we sized to while hidden.
    resize();

    /* Wipe the whole buffer once on the way back.
       Draws are scissored to the union of this frame's lens box and the last
       one, which is only correct while frames are contiguous. Across a hidden
       period the glass may have moved a long way, and `resize()` returns early
       when the dimensions are unchanged — so without this the old lens stays
       burned into the buffer beside the new one. */
    gl.disable(gl.SCISSOR_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT);
    lastBox.x = lastBox.y = lastBox.s = 0;

    requestGlassFrame();
  };

  const onLost = (e: Event) => {
    e.preventDefault();
    contextLost = true;
    canvas.dataset.glLost = 'true';
  };
  const onRestored = () => {
    /* Deliberately does NOT clear `contextLost`.
       Restoration gives back a live context but every object created against
       the old one — program, VAO, uniform locations — is gone. Resuming paint
       here would issue draw calls against destroyed objects on a canvas we
       have already hidden. The sheet is CSS, so "no glass" is a complete and
       correct end state; recreating the whole pipeline for an effect the
       visitor can no longer see is not worth the failure surface. */
    canvas.dataset.glLost = 'true';
  };

  const onThemeChange = () => {
    readTheme();
    requestGlassFrame();
  };

  const io = new IntersectionObserver(
    (entries) => {
      onScreen = entries[0]?.isIntersecting ?? true;
      syncVisible();
    },
    { rootMargin: '120px' }
  );
  const ro = new ResizeObserver(() => resize());

  readTheme();
  resize();

  const unsubscribe = subscribeGlass(paint);
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', syncVisible);
  canvas.addEventListener('webglcontextlost', onLost as EventListener);
  canvas.addEventListener('webglcontextrestored', onRestored);
  glassPrefs.reduced.addEventListener('change', onThemeChange);
  io.observe(canvas);
  ro.observe(canvas);
  onScroll();

  return {
    teardown() {
      disposed = true;
      unsubscribe();
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', syncVisible);
      canvas.removeEventListener('webglcontextlost', onLost as EventListener);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      glassPrefs.reduced.removeEventListener('change', onThemeChange);
      io.disconnect();
      ro.disconnect();

      gl.bindVertexArray(null);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
      // Release the drawing buffer now rather than waiting for GC.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
