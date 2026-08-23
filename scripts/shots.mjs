/**
 * Section-by-section screenshots for visual review.
 *
 * Full-page captures stitch badly on a page with fixed layers, and they are
 * useless for judging a single section anyway. This scrolls each section into
 * view, lets its reveal finish, and captures just that section.
 *
 * Usage: node scripts/shots.mjs [selector ...]
 */
import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { serve } from './serve-dist.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = fileURLToPath(new URL('../.verify/sections', import.meta.url));

const only = process.argv.slice(2);

const VIEWS = [
  { name: 'desktop', width: 1512, height: 950, dpr: 2, mobile: false },
  { name: 'mobile', width: 390, height: 844, dpr: 3, mobile: true },
];

async function run() {
  await mkdir(OUT, { recursive: true });
  const { server, port } = await serve(4323);
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'shell',
    args: [
      '--headless=new',
      '--hide-scrollbars',
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--no-sandbox',
    ],
  });

  for (const vp of VIEWS) {
    const page = await browser.newPage();
    await page.setViewport({
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: vp.dpr,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
    });
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 1200));
    // The loupe only builds on first pointer interaction, so it would be
    // absent from every screenshot without this.
    await page.mouse.move(vp.width * 0.5, vp.height * 0.4);
    await page.mouse.move(vp.width * 0.62, vp.height * 0.52, { steps: 6 });
    await new Promise((r) => setTimeout(r, 700));

    const ids = await page.evaluate(() =>
      [...document.querySelectorAll('main section')].map((s, i) => s.id || `section-${i}`)
    );

    for (const [i, id] of ids.entries()) {
      if (only.length && !only.includes(id)) continue;
      const handle = await page.evaluateHandle((idx) => {
        const el = document.querySelectorAll('main section')[idx];
        el.scrollIntoView({ block: 'start', behavior: 'instant' });
        return el;
      }, i);
      // Let the reveal for this section finish.
      await new Promise((r) => setTimeout(r, 1500));
      const el = handle.asElement();
      if (el) {
        try {
          await el.screenshot({ path: `${OUT}/${id}-${vp.name}.png` });
        } catch {
          // Section taller than the capture limit; fall back to the viewport.
          await page.screenshot({ path: `${OUT}/${id}-${vp.name}.png` });
        }
      }
      await handle.dispose();
    }
    await page.close();
  }

  await browser.close();
  server.close();
  console.log(`wrote section shots to ${OUT}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
