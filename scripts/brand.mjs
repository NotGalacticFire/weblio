/**
 * Generates the Weblio mark at avatar resolution, for profile pictures.
 *
 * The favicon is drawn for a 32px box: hairline strokes that read as crisp at
 * tab size but nearly vanish once a platform crops them into a small circle.
 * These variants are retuned for that job — heavier strokes, a mark sized to
 * sit safely inside a circular crop, and a full-bleed ground so no platform
 * adds its own white corners.
 *
 * Run: node scripts/brand.mjs
 * Output: brand/
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../brand', import.meta.url));

const PAPER = '#f2efe9';
const INK = '#14110e';
const VERMILION = '#e4431f';

/**
 * @param bg        ground colour
 * @param ring      lens ring colour
 * @param cross     registration crosshair colour
 * @param overshoot whether the crosshair extends past the ring, as a real
 *                  registration mark does
 */
const mark = ({ bg, ring, cross, overshoot }) => {
  const r = 30;
  const reach = overshoot ? 42 : r;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${bg}"/>
  <circle cx="50" cy="50" r="${r}" fill="none" stroke="${ring}" stroke-width="5"/>
  <path d="M50 ${50 - reach}V${50 + reach}M${50 - reach} 50H${50 + reach}"
        stroke="${cross}" stroke-width="3.2" stroke-linecap="butt"/>
</svg>`;
};

const VARIANTS = [
  {
    name: 'weblio-mark-paper',
    label: 'ink on paper — matches the site',
    svg: mark({ bg: PAPER, ring: INK, cross: VERMILION, overshoot: false }),
  },
  {
    name: 'weblio-mark-ink',
    label: 'paper on ink — highest contrast in a feed',
    svg: mark({ bg: INK, ring: PAPER, cross: VERMILION, overshoot: false }),
  },
  {
    name: 'weblio-mark-register',
    label: 'crosshair overshooting, as a real registration mark',
    svg: mark({ bg: PAPER, ring: INK, cross: VERMILION, overshoot: true }),
  },
];

async function main() {
  await mkdir(OUT, { recursive: true });

  for (const v of VARIANTS) {
    const buf = Buffer.from(v.svg);
    // 1080 is Instagram's upload ceiling for a profile picture; everything
    // smaller is derived from it rather than re-rendered.
    await sharp(buf, { density: 1200 }).resize(1080, 1080).png().toFile(`${OUT}/${v.name}-1080.png`);
    await sharp(buf, { density: 600 }).resize(512, 512).png().toFile(`${OUT}/${v.name}-512.png`);
    await Bun_writeSvg(`${OUT}/${v.name}.svg`, v.svg);
    console.log(`  ${v.name.padEnd(24)} ${v.label}`);
  }

  // Contact sheet: every variant, circular-cropped the way a platform will
  // crop it, at both display sizes that matter.
  const circle = Buffer.from('<svg><circle cx="150" cy="150" r="150"/></svg>');
  const tiles = [];
  for (const [i, v] of VARIANTS.entries()) {
    const big = await sharp(Buffer.from(v.svg), { density: 900 })
      .resize(300, 300)
      .composite([{ input: circle, blend: 'dest-in' }])
      .png()
      .toBuffer();
    const small = await sharp(Buffer.from(v.svg), { density: 300 })
      .resize(56, 56)
      .composite([
        { input: Buffer.from('<svg><circle cx="28" cy="28" r="28"/></svg>'), blend: 'dest-in' },
      ])
      .png()
      .toBuffer();
    tiles.push({ input: big, left: 40 + i * 340, top: 40 });
    tiles.push({ input: small, left: 40 + i * 340 + 122, top: 372 });
  }

  await sharp({
    create: { width: 1060, height: 460, channels: 4, background: '#8a8a88' },
  })
    .composite(tiles)
    .png()
    .toFile(`${OUT}/_preview.png`);

  console.log(`\n  wrote ${OUT}`);
}

// sharp has no text writer; write the SVG masters with fs directly.
async function Bun_writeSvg(path, contents) {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path, contents, 'utf8');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
