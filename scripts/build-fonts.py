#!/usr/bin/env python3
"""
Subset the three variable fonts to what this site actually uses.

Fraunces ships a 118 KB latin file because it carries opsz/wght/SOFT/WONK.
The WONK and SOFT axes are load-bearing for the brand, so we keep them and
attack size three other ways instead:

  1. per-face glyph sets (the mono is only ever used for small labels)
  2. partial instancing of `opsz` down to the display range we actually render
  3. dropping subsetter flags that *inflate* CFF2 (--desubroutinize, --glyph-names)

Run: python3 scripts/build-fonts.py
Output: public/fonts/*.woff2  +  a size report
"""

import io
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "fonts"
NM = ROOT / "node_modules" / "@fontsource-variable"

ASCII = "".join(chr(c) for c in range(0x20, 0x7F))

# Prose faces: latin plus the typographic marks the design language uses.
# Generous on purpose so a copy edit can never produce tofu.
PROSE = (
    ASCII
    + " "                      # nbsp
    + "–—"                # en dash, em dash
    + "‘’“”"    # curly quotes
    + "…"                      # ellipsis
    + "•·"                # bullet, middot
    + "×÷±−"    # math
    + "°©®™"    # degree, legal
    + "→←↑↓↗↘↖↙"  # arrows
    + "éèêëàâçôûîï"
    + "ñüöäßáíóú"
    + "ÉÀÇÖÜÄ"
    + "§¶†‡"    # section, pilcrow, daggers
    + "£€¥"          # currency
)

# Fraunces is *display only* — headlines, section titles, pull quotes. It never
# sets prose, so it needs no accents, currency, arrows or legal marks.
DISPLAY = (
    ASCII
    + " "
    + "–—"                # en dash, em dash
    + "‘’“”"    # curly quotes
    + "…"                      # ellipsis
    + "·"                      # middot
)

# The mono is only ever set at 10-13px for folio numbers, eyebrow labels and
# form hints. It never sets prose, so it gets a deliberately tiny glyph set.
MONO = (
    "0123456789"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "abcdefghijklmnopqrstuvwxyz"
    " .,:;/()[]—–-—_+*#%&@!?'\"<>=→↗·•°"
)

FACES = [
    {
        "src": NM / "fraunces" / "files" / "fraunces-latin-full-normal.woff2",
        "out": "fraunces-var.woff2",
        "label": "Fraunces  opsz/wght/SOFT/WONK",
        "family": "Fraunces",
        "fallback": "Times New Roman",
        "weights": (300, 700),
        "display": "swap",
        "text": DISPLAY,
        # Display only, so large swathes of every axis are dead weight:
        #   opsz — never rendered below ~24px
        #   wght — headlines live between light and bold, never 100 or 900
        #   SOFT — we animate it subtly; the top half of the range is unused
        # WONK stays whole: it is binary (0/1) and it is the brand.
        "limit": {"opsz": (24, 144), "wght": (300, 700), "SOFT": (0, 50)},
    },
    {
        # wght-only cut: the width axis is unused, and it costs 27 KB.
        "src": NM / "instrument-sans" / "files" / "instrument-sans-latin-wght-normal.woff2",
        "out": "instrument-var.woff2",
        "label": "Instrument Sans  wght",
        "family": "Instrument Sans",
        "fallback": "Arial",
        "weights": (400, 700),
        "display": "swap",
        "text": PROSE,
        "limit": {"wght": (300, 700)},
    },
    {
        "src": NM / "jetbrains-mono" / "files" / "jetbrains-mono-latin-wght-normal.woff2",
        "out": "jetbrains-var.woff2",
        "label": "JetBrains Mono  wght",
        "family": "JetBrains Mono",
        "fallback": "Courier New",
        "weights": (400, 600),
        # Labels are decorative chrome; never block paint on them.
        "display": "optional",
        "text": MONO,
        # Labels only ever render at 400-500.
        "limit": {"wght": (400, 600)},
    },
]

# Keep shaping + the figure sets the design uses. Everything else goes.
FEATURES = "kern,liga,clig,calt,ccmp,mark,mkmk,locl,rlig,onum,tnum,lnum,pnum,frac,sups,case,ss01,ss02,ss03,ss04,aalt"


def process(face) -> tuple[int, int]:
    src: Path = face["src"]
    if not src.exists():
        raise SystemExit(f"  MISSING: {src}")

    before = src.stat().st_size
    font = TTFont(str(src))

    if face["limit"]:
        font = instancer.instantiateVariableFont(font, face["limit"], updateFontNames=False)

    # Round-trip through an in-memory buffer so the subsetter sees the instanced font.
    buf = io.BytesIO()
    font.flavor = None
    font.save(buf)
    buf.seek(0)

    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = FEATURES.split(",")
    options.glyph_names = False
    options.hinting = False
    options.desubroutinize = False       # inflates CFF2
    options.notdef_outline = False
    options.recommended_glyphs = False
    options.name_IDs = [1, 2, 3, 4, 6]   # family/style/unique/full/postscript
    options.name_legacy = False
    options.name_languages = ["0x0409"]  # en-US only
    options.drop_tables += ["DSIG"]

    subsetter = subset.Subsetter(options=options)
    target = TTFont(buf)
    subsetter.populate(text=face["text"])
    subsetter.subset(target)

    dst = OUT / face["out"]
    target.flavor = "woff2"
    target.save(str(dst))
    after = dst.stat().st_size
    return before, after


# Relative frequency of letters in English prose, plus a realistic space rate.
# Used to weight average advance width so two families are compared the way
# actual running text compares them.
LETTER_FREQ = {
    "a": 8.17, "b": 1.49, "c": 2.78, "d": 4.25, "e": 12.70, "f": 2.23, "g": 2.02,
    "h": 6.09, "i": 6.97, "j": 0.15, "k": 0.77, "l": 4.03, "m": 2.41, "n": 6.75,
    "o": 7.51, "p": 1.93, "q": 0.10, "r": 5.99, "s": 6.33, "t": 9.06, "u": 2.76,
    "v": 0.98, "w": 2.36, "x": 0.15, "y": 1.97, "z": 0.07, " ": 17.0,
}

# Where the local fallback faces live on macOS, and the values measured from
# those exact files (so the build is reproducible on a machine without them).
FALLBACK_FILES = {
    "Times New Roman": "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
    "Arial": "/System/Library/Fonts/Supplemental/Arial.ttf",
    "Courier New": "/System/Library/Fonts/Supplemental/Courier New.ttf",
}
FALLBACK_MEASURED = {
    "Times New Roman": 0.4064,
    "Arial": 0.4484,
    "Courier New": 0.6001,
}


def avg_width_em(font: TTFont) -> float:
    """Frequency-weighted mean advance width, in em."""
    upm = font["head"].unitsPerEm
    hmtx, cmap = font["hmtx"], font.getBestCmap()
    total = weighted = 0.0
    for ch, freq in LETTER_FREQ.items():
        glyph = cmap.get(ord(ch))
        if glyph:
            weighted += hmtx[glyph][0] * freq
            total += freq
    return (weighted / total) / upm if total else 0.0


def metrics(path: Path) -> dict:
    t = TTFont(str(path))
    upm = t["head"].unitsPerEm
    os2, hhea = t["OS/2"], t["hhea"]
    # Prefer the typo metrics when the font sets USE_TYPO_METRICS, else hhea —
    # this is the same rule browsers apply when building the line box.
    use_typo = bool(os2.fsSelection & (1 << 7))
    return {
        "upm": upm,
        "ascent": os2.sTypoAscender if use_typo else hhea.ascent,
        "descent": os2.sTypoDescender if use_typo else hhea.descent,
        "lineGap": os2.sTypoLineGap if use_typo else hhea.lineGap,
        "avg": avg_width_em(t),
    }


def fallback_avg(local: str) -> float:
    """Measure the real system file when present, else use the measured constant."""
    path = Path(FALLBACK_FILES[local])
    if path.exists():
        try:
            return avg_width_em(TTFont(str(path)))
        except Exception:
            pass
    return FALLBACK_MEASURED[local]


def fallback_css(family: str, target: dict, local: str) -> str:
    """
    Emit an @font-face whose metrics are scaled to match the real webfont, so the
    swap from fallback to webfont produces no reflow.

    Both sides of the size-adjust ratio are measured the same way — a
    frequency-weighted mean advance width. Comparing OS/2.xAvgCharWidth across
    families does NOT work: different foundries compute it over different glyph
    sets, which yields ratios that are wrong by 20%+.
    """
    size_adjust = target["avg"] / fallback_avg(local)
    asc = target["ascent"] / target["upm"] / size_adjust
    desc = abs(target["descent"]) / target["upm"] / size_adjust
    gap = target["lineGap"] / target["upm"] / size_adjust
    return (
        f"@font-face {{\n"
        f"  font-family: '{family} Fallback';\n"
        f"  src: local('{local}');\n"
        f"  size-adjust: {size_adjust * 100:.3f}%;\n"
        f"  ascent-override: {asc * 100:.3f}%;\n"
        f"  descent-override: {desc * 100:.3f}%;\n"
        f"  line-gap-override: {gap * 100:.3f}%;\n"
        f"}}\n"
    )


def build() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    rows, tb, ta = [], 0, 0

    for face in FACES:
        before, after = process(face)
        tb += before
        ta += after
        rows.append((face["label"], before, after))

    # --- emit fonts.css -----------------------------------------------------
    css = [
        "/* GENERATED by scripts/build-fonts.py — do not edit by hand. */\n",
        "/* Subset from @fontsource-variable with all variation axes preserved. */\n\n",
    ]
    for face in FACES:
        m = metrics(OUT / face["out"])
        lo, hi = face["weights"]
        css.append(
            f"@font-face {{\n"
            f"  font-family: '{face['family']}';\n"
            f"  font-style: normal;\n"
            f"  font-weight: {lo} {hi};\n"
            f"  font-display: {face['display']};\n"
            f"  src: url('/fonts/{face['out']}') format('woff2-variations');\n"
            f"}}\n\n"
        )
        css.append(fallback_css(face["family"], m, face["fallback"]) + "\n")

    (ROOT / "src" / "styles" / "fonts.css").write_text("".join(css), encoding="utf-8")

    print("\n  font subsetting\n  " + "-" * 66)
    for label, before, after in rows:
        print(f"  {label:<32} {before/1024:6.1f} -> {after/1024:6.1f} KB  (-{(1-after/before)*100:4.1f}%)")
    print("  " + "-" * 66)
    print(f"  {'TOTAL':<32} {tb/1024:6.1f} -> {ta/1024:6.1f} KB  (-{(1-ta/tb)*100:4.1f}%)")
    print("  wrote src/styles/fonts.css (metric-matched fallbacks included)\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(build())
