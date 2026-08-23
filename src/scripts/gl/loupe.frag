#version 300 es
precision highp float;

/* ============================================================================
   THE LOUPE
   ----------------------------------------------------------------------------
   The page is printed on a sheet ruled with a faint 12-column grid — the
   structure every website is built on, drawn instead of implied. Those rules
   are real CSS hairlines on the page itself.

   This shader draws only what is under the glass. Everywhere else it outputs
   nothing at all, so the CSS sheet shows through untouched and there is
   exactly one grid on the page.

   Under the glass the sheet magnifies: the column rules open up, a finer
   sub-grid appears between them, and the halftone rosette that prints the
   paper tone resolves. The rim refracts — lines bend outward and split into
   their colour channels precisely where a real lens fails to converge them.

   Procedural throughout. No textures, no geometry, one triangle, and the draw
   is scissored to the lens bounds so the cost is the glass, not the screen.
   ========================================================================= */

uniform vec2  uRes;       /* drawing-buffer size, px                         */
uniform vec2  uPointer;   /* loupe centre, px (y-down, matching CSS)         */
uniform float uRadius;    /* loupe radius, px                                */
uniform float uActive;    /* 0..1 — presence, fades in on first pointer move */
uniform float uScroll;    /* sheet offset, px                                */
uniform float uVel;       /* 0..1 — normalised pointer speed                 */
uniform float uGrid;      /* column pitch, px — measured from the real grid  */
uniform float uGridX0;    /* x of the first column rule, px                  */
uniform float uDpr;       /* device pixel ratio — keeps the print detail the
                             same physical size on every screen              */
uniform vec3  uInk;
uniform vec3  uPaper;
uniform vec3  uAccent;

out vec4 fragColor;

const float MAG        = 1.95;  /* magnification across the field            */
const float BEND       = 0.022; /* how hard the rim throws rays outward      */
const float ABERRATION = 0.016; /* channel separation at the rim             */

/* Field profile: 1 across most of the glass, falling to 0 only near the rim.
   A real loupe is close to flat-field — using a hemisphere here (the obvious
   choice) bulges the centre and the whole thing reads as a glass marble
   rather than a magnifier lying on a sheet of paper. */
float profile(float nd) {
  /* Flat almost all the way out. This is an AREA judgement, not a radius one:
     a flat zone of 0.58 leaves two thirds of the visible disc inside the
     transition, which bows the column rules into meridians and turns the
     glass into a globe. Anything short of ~0.95 leaves a bright bevelled
     annulus that reads as a glass bead rather than a lens edge. */
  return smoothstep(1.0, 0.965, nd);
}

/* Antialiased coverage of a hairline lattice, in the space of `p`.
   fwidth means the lines stay one pixel crisp however far the lens magnifies
   them — the antialiasing follows the distortion for free. */
float lattice(vec2 p, float spacing, float weight) {
  /* +0.5 puts the lines ON multiples of `spacing` rather than halfway between
     them, so they land exactly where the CSS rules are. */
  vec2 q  = abs(fract(p / spacing + 0.5) - 0.5) * spacing;
  vec2 fw = fwidth(p) + 1e-5;
  vec2 a  = smoothstep(weight + fw, weight - fw, q);
  return max(a.x, a.y);
}

/* Vertical rules only — matches what the CSS sheet actually draws. */
float rules(vec2 p, float spacing, float weight) {
  float q  = abs(fract(p.x / spacing + 0.5) - 0.5) * spacing;
  float fw = fwidth(p.x) + 1e-5;
  return smoothstep(weight + fw, weight - fw, q);
}

/* One halftone screen: dots on a lattice rotated by `angle`, at `freq` pitch. */
float halftone(vec2 p, float angle, float freq, float size) {
  float c = cos(angle), s = sin(angle);
  vec2 r = mat2(c, -s, s, c) * p;
  vec2 cell = fract(r / freq) - 0.5;
  float d = length(cell) * freq;
  float fw = fwidth(d) + 1e-5;
  return smoothstep(size + fw, size - fw, d);
}

/* Map a point through the lens.
   The field is flat across the centre and only collapses close to the rim,
   where refraction throws the ray outward — which is where a real loupe
   smears and bends everything. Confining the bend to the last sliver of the
   radius is what keeps this reading as flat glass on paper. */
vec2 lens(vec2 p, vec2 c, float R, float mag) {
  vec2  d  = p - c;
  float r  = length(d);
  float nd = clamp(r / R, 0.0, 1.0);
  float h  = profile(nd);

  vec2 dir = d / max(r, 1e-5);
  vec2 mapped = c + d * mix(1.0, 1.0 / mag, h);
  mapped += dir * BEND * R * pow(nd, 8.0);
  return mapped;
}

void main() {
  /* gl_FragCoord is y-up; pointer and scroll are y-down. Flip once here so
     everything downstream shares CSS's sense of the page. */
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);

  float r  = length(px - uPointer);
  float nd = r / uRadius;

  /* Everything outside the glass belongs to the CSS sheet. Emit nothing. */
  if (uActive < 0.002 || nd > 1.06) {
    fragColor = vec4(0.0);
    return;
  }

  /* Sample the sheet three times at slightly different magnification, so the
     channels stop converging toward the rim. */
  float aber = ABERRATION * smoothstep(0.55, 1.0, nd);
  vec2 off = vec2(uGridX0, uScroll);
  vec2 pr = lens(px, uPointer, uRadius, MAG * (1.0 - aber)) - off;
  vec2 pg = lens(px, uPointer, uRadius, MAG)                - off;
  vec2 pb = lens(px, uPointer, uRadius, MAG * (1.0 + aber)) - off;

  /* Every spatial constant below is in CSS pixels and scaled by DPR here, so
     the printed detail is the same physical size on a 1x laptop and a 3x
     phone. Getting this wrong is what makes the rosette dissolve into grey
     mud on retina screens. */
  float w = max(uDpr, 1.0);

  /* The magnified column rules, and a finer sub-grid that only resolves under
     glass — the structure beneath the structure. */
  vec3 major = vec3(
    rules(pr, uGrid, 0.6 * w),
    rules(pg, uGrid, 0.6 * w),
    rules(pb, uGrid, 0.6 * w)
  );
  vec3 sub = vec3(
    lattice(pr, uGrid / 4.0, 0.4 * w),
    lattice(pg, uGrid / 4.0, 0.4 * w),
    lattice(pb, uGrid / 4.0, 0.4 * w)
  );

  /* The halftone screen printing the paper tone.
     One screen at 45 degrees, not three at rosette angles: three overlapping
     screens at this pitch interfere into random-looking speckle, which reads
     as noise rather than as print. A single regular lattice is unmistakably a
     halftone, and it is the detail that rewards looking closely. */
  float rose = halftone(pg, 0.7854, 13.0 * w, 2.2 * w);

  vec3 col = uPaper;
  col = mix(col, uInk, rose * 0.055);
  col = mix(col, uInk, sub * 0.13);
  col = mix(col, uInk, major * 0.42);

  /* Rim: the housing. A hairline of ink and a thin bright arc riding just
     inside it, lit from the upper left. Anything broader than this stops
     looking like an edge-on ring and starts looking like a sphere. */
  float rim = smoothstep(0.030, 0.0, abs(nd - 1.0));
  col = mix(col, uInk, rim * 0.44);

  vec2 n = (px - uPointer) / uRadius;
  float facing = clamp(dot(normalize(n + 1e-5), normalize(vec2(-0.7, -0.72))), 0.0, 1.0);
  float spec = pow(facing, 3.0) * smoothstep(0.022, 0.0, abs(nd - 0.984));
  col += spec * 0.20;

  /* Vermilion only while the glass is genuinely moving — a registration mark
     catching the light, not a coloured ring. */
  col = mix(col, uAccent, rim * uVel * 0.45);

  /* Registration crosshair at the exact centre of the glass. */
  float cw = 0.6 * w;
  float cross = max(
    smoothstep(cw, 0.0, abs(px.x - uPointer.x)) * smoothstep(uRadius * 0.11, 0.0, abs(px.y - uPointer.y)),
    smoothstep(cw, 0.0, abs(px.y - uPointer.y)) * smoothstep(uRadius * 0.11, 0.0, abs(px.x - uPointer.x))
  );
  col = mix(col, uAccent, cross * 0.75);

  /* Feather the very edge so the glass sits on the paper instead of being
     stamped onto it. */
  float alpha = smoothstep(1.008, 0.994, nd) * uActive;
  fragColor = vec4(col, alpha);
}
