/**
 * Generates the Open Graph image and the apple-touch-icon.
 *
 * Rendered in headless Chrome against the real, subset webfonts rather than
 * approximated in an SVG rasteriser — librsvg has no access to Fraunces, so
 * anything drawn that way would silently fall back to a system serif and the
 * shared card would not look like the site.
 *
 * Run: node scripts/og.mjs   (after a build, so dist/fonts exists)
 */
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { serve } from './serve-dist.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PUBLIC = fileURLToPath(new URL('../public', import.meta.url));

const html = (origin) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @font-face {
    font-family: 'Fraunces';
    src: url('${origin}/fonts/fraunces-var.woff2') format('woff2-variations');
    font-weight: 300 700;
  }
  @font-face {
    font-family: 'JetBrains Mono';
    src: url('${origin}/fonts/jetbrains-var.woff2') format('woff2-variations');
    font-weight: 400 600;
  }
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px;
    background-color: #f2efe9;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='0.055'/%3E%3C/svg%3E");
    color: #14110e;
    position: relative;
    overflow: hidden;
    font-family: 'JetBrains Mono', monospace;
  }
  /* The same 12-column hairline sheet the site is printed on. */
  .grid { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(12, 1fr); padding: 0 72px; }
  .grid i { border-left: 1px solid #14110e14; }
  .grid i:last-child { border-right: 1px solid #14110e14; }

  .inner { position: relative; height: 100%; padding: 64px 72px; display: flex; flex-direction: column; }
  .top { display: flex; justify-content: space-between; align-items: baseline; }
  .mark { font-family: 'Fraunces'; font-size: 30px; font-variation-settings: 'opsz' 40, 'wght' 500, 'SOFT' 0, 'WONK' 0; letter-spacing: -0.02em; }
  .mark s { text-decoration: none; color: #e4431f; font-size: 13px; vertical-align: super; }
  .eyebrow { font-size: 15px; letter-spacing: 0.16em; text-transform: uppercase; color: #14110e99; }

  h1 {
    margin-top: auto;
    font-family: 'Fraunces';
    font-weight: 400;
    font-size: 104px;
    line-height: 0.92;
    letter-spacing: -0.03em;
    font-variation-settings: 'opsz' 144, 'wght' 400, 'SOFT' 0, 'WONK' 0;
    max-width: 15ch;
  }
  h1 b { font-weight: 400; color: #e4431f; }

  .rule { margin-top: 40px; height: 1px; background: #14110e33; }
  .bottom { margin-top: 26px; display: flex; justify-content: space-between; align-items: center; }
  .bottom span { font-size: 16px; letter-spacing: 0.16em; text-transform: uppercase; color: #14110e99; }

  /* The loupe, drawn flat: a hairline ring and a registration cross. */
  .loupe { position: absolute; right: 96px; top: 232px; width: 232px; height: 232px; border: 1px solid #14110e59; border-radius: 50%; }
  .loupe::before, .loupe::after { content: ''; position: absolute; background: #e4431f; }
  .loupe::before { left: 50%; top: 50%; width: 1px; height: 26px; transform: translate(-50%, -50%); }
  .loupe::after { left: 50%; top: 50%; width: 26px; height: 1px; transform: translate(-50%, -50%); }
</style></head>
<body>
  <div class="grid">${'<i></i>'.repeat(12)}</div>
  <div class="inner">
    <div class="top">
      <div class="mark">Weblio<s>&#9673;</s></div>
      <div class="eyebrow">weblio.design</div>
    </div>
    <div class="loupe"></div>
    <h1>Websites that survive a second look<b>.</b></h1>
    <div class="rule"></div>
    <div class="bottom">
      <span>Web design &amp; development</span>
      <span>Built by Ravi</span>
    </div>
  </div>
</body></html>`;

async function main() {
  const { server, port } = await serve(4324);
  const origin = `http://localhost:${port}`;

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'shell',
    args: ['--headless=new', '--hide-scrollbars', '--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.setContent(html(origin), { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);

  const buf = await page.screenshot({ type: 'png' });
  // Rendered at 2x for crisp type, then resized to the canonical 1200x630.
  await sharp(buf).resize(1200, 630).png({ quality: 90, compressionLevel: 9 }).toFile(`${PUBLIC}/og.png`);

  await browser.close();
  server.close();

  // Apple touch icon from the same mark as the favicon.
  const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 32 32">
    <rect width="32" height="32" fill="#f2efe9"/>
    <circle cx="16" cy="16" r="9.5" fill="none" stroke="#14110e" stroke-width="2"/>
    <path d="M16 6.5v19M6.5 16h19" stroke="#e4431f" stroke-width="1.25"/>
  </svg>`;
  await sharp(Buffer.from(icon)).resize(180, 180).png().toFile(`${PUBLIC}/apple-touch-icon.png`);

  console.log('wrote public/og.png and public/apple-touch-icon.png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
