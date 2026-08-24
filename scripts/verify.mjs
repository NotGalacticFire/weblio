/**
 * Headless verification pass over the built site.
 *
 * Runs against dist/ (the real production output) in a Chrome instance we
 * control, so results do not depend on whether the developer's browser window
 * happens to be focused — a backgrounded tab freezes requestAnimationFrame,
 * which silently suppresses every scroll reveal and makes screenshots lie.
 *
 * Checks per page/viewport:
 *   · console errors and page exceptions
 *   · failed network requests
 *   · horizontal overflow
 *   · CLS and LCP
 *   · that no [data-reveal] element is stuck invisible
 *   · heading order, image alt text, form labels, focusable-element count
 * Writes screenshots to .verify/
 *
 * Usage: node scripts/verify.mjs [--shots]
 */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { serve } from './serve-dist.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = fileURLToPath(new URL('../.verify', import.meta.url));
const SHOTS = process.argv.includes('--shots');
const SKIP_BUILD = process.argv.includes('--no-build');

// Google's "good" threshold. Without a bound here the audit reported a 2.9s
// cold mobile LCP and still returned "0 failures", which is worse than not
// measuring at all.
const LCP_BUDGET_MS = 2500;

const VIEWPORTS = [
  { name: 'iphone-se', width: 375, height: 667, dpr: 2, mobile: true },
  { name: 'iphone-pro', width: 393, height: 852, dpr: 3, mobile: true },
  { name: 'tablet', width: 768, height: 1024, dpr: 2, mobile: true },
  { name: 'laptop', width: 1280, height: 800, dpr: 2, mobile: false },
  { name: 'desktop', width: 1728, height: 1080, dpr: 2, mobile: false },
];

const PAGES = ['/', '/contact', '/privacy', '/does-not-exist'];

// Evaluated inside the page. Declared once so the pre-scroll and post-scroll
// samples measure identically.
const readVitals = () =>
  new Promise((resolve) => {
    let cls = 0;
    let lcp = 0;
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((l) => {
        const es = l.getEntries();
        if (es.length) lcp = es[es.length - 1].startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {
      /* unsupported */
    }
    setTimeout(() => resolve({ cls: Number(cls.toFixed(4)), lcp: Math.round(lcp) }), 500);
  });

const results = [];
let failures = 0;

function record(page, viewport, level, message) {
  results.push({ page, viewport, level, message });
  if (level === 'FAIL') failures++;
}

async function auditPage(browser, base, path, vp) {
  const page = await browser.newPage();
  await page.setViewport({
    width: vp.width,
    height: vp.height,
    deviceScaleFactor: vp.dpr,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
  });

  // The 404 route is *supposed* to answer 404, so the browser's own
  // "failed to load resource" notice for that navigation is expected.
  const expects404 = path === '/does-not-exist';

  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (expects404 && /404 \(Not Found\)/.test(text)) return;
    consoleErrors.push(text);
  });
  page.on('pageerror', (e) => consoleErrors.push(`UNCAUGHT: ${e.message}`));
  page.on('requestfailed', (r) => {
    failedRequests.push(`${r.url()} — ${r.failure()?.errorText}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !(expects404 && r.url().includes('does-not-exist'))) {
      failedRequests.push(`${r.status()} ${r.url()}`);
    }
  });

  await page.goto(base + path, { waitUntil: 'networkidle0', timeout: 30000 });

  // Let the intro and the font swap settle.
  await new Promise((r) => setTimeout(r, 1200));

  // The loupe is built on first pointer interaction, so exercise it — this is
  // the only way console errors from the WebGL path surface in this audit.
  await page.mouse.move(vp.width * 0.5, vp.height * 0.45);
  await page.mouse.move(vp.width * 0.62, vp.height * 0.55, { steps: 8 });
  await new Promise((r) => setTimeout(r, 500));

  // Sample LCP BEFORE scrolling. LCP does not finalise on programmatic scroll,
  // so revealing a huge heading further down the page registers a new, later
  // candidate and silently inflates the number. Measure the real above-the-fold
  // experience first, then scroll for the structural checks.
  const vitals = await page.evaluate(readVitals);

  // Now walk the whole page so every reveal fires.
  await page.evaluate(async () => {
    // documentElement, not body: `body` carries `overflow-x: clip`, so its
    // scrollHeight under-reports the real page height and the walk can stop
    // before the last sections — which showed up as a flaky "stuck reveal".
    const height = () =>
      Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
        document.documentElement.offsetHeight
      );
    const step = Math.round(window.innerHeight * 0.6);
    for (let y = 0; y <= height(); y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 110));
    }
    // Land squarely at the bottom, then settle, before coming back up.
    window.scrollTo(0, height());
    await new Promise((r) => setTimeout(r, 350));
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 400));
  });

  const audit = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;

    const stuck = [...document.querySelectorAll('[data-reveal]')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return false;
        return parseFloat(getComputedStyle(el).opacity) < 0.05;
      })
      .map((el) => el.className || el.tagName);

    // Heading order: no level may jump by more than one.
    const levels = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) =>
      Number(h.tagName[1])
    );
    const jumps = [];
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] - levels[i - 1] > 1) jumps.push(`${levels[i - 1]}→${levels[i]}`);
    }

    const imgsNoAlt = [...document.querySelectorAll('img')].filter(
      (i) => !i.hasAttribute('alt')
    ).length;

    const unlabelled = [...document.querySelectorAll('input,textarea,select')].filter((f) => {
      if (f.type === 'hidden') return false;
      // Honeypots are aria-hidden and tabindex=-1 by design: not in the
      // accessibility tree, not keyboard reachable, so a label is meaningless.
      if (f.getAttribute('aria-hidden') === 'true') return false;
      const id = f.getAttribute('id');
      const labelled =
        (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
        f.closest('label') ||
        f.getAttribute('aria-label') ||
        f.getAttribute('aria-labelledby');
      return !labelled;
    }).length;

    const focusable = document.querySelectorAll(
      'a[href],button:not([disabled]),input:not([disabled]),textarea,select,[tabindex]:not([tabindex="-1"])'
    ).length;

    // Touch targets below 44px on coarse pointers.
    const small = [...document.querySelectorAll('a[href],button')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.height < 40 || r.width < 24);
      })
      .map((el) => (el.textContent || '').trim().slice(0, 22) || el.tagName);

    return {
      overflow,
      stuck,
      jumps,
      imgsNoAlt,
      unlabelled,
      focusable,
      small: small.slice(0, 6),
      h1s: document.querySelectorAll('h1').length,
      title: document.title,
      canonical: document.querySelector('link[rel=canonical]')?.getAttribute('href') || null,
      desc: document.querySelector('meta[name=description]')?.getAttribute('content') || null,
    };
  });

  // CLS is cumulative, so re-read it after the scroll pass to catch any
  // shift caused by content revealing.
  const after = await page.evaluate(readVitals);
  vitals.cls = Math.max(vitals.cls, after.cls);

  const label = `${path} @ ${vp.name}`;
  if (consoleErrors.length) record(path, vp.name, 'FAIL', `console: ${consoleErrors.slice(0, 3).join(' | ')}`);
  if (failedRequests.length) record(path, vp.name, 'FAIL', `requests: ${failedRequests.slice(0, 3).join(' | ')}`);
  if (audit.overflow > 1) record(path, vp.name, 'FAIL', `horizontal overflow: ${audit.overflow}px`);
  if (audit.stuck.length) record(path, vp.name, 'FAIL', `invisible reveals: ${audit.stuck.slice(0, 3).join(', ')}`);
  if (audit.jumps.length) record(path, vp.name, 'FAIL', `heading order jumps: ${audit.jumps.join(', ')}`);
  if (audit.imgsNoAlt) record(path, vp.name, 'FAIL', `${audit.imgsNoAlt} img without alt`);
  if (audit.unlabelled) record(path, vp.name, 'FAIL', `${audit.unlabelled} unlabelled form field`);
  if (audit.h1s !== 1) record(path, vp.name, 'FAIL', `${audit.h1s} h1 elements (want exactly 1)`);
  if (vitals.cls > 0.1) record(path, vp.name, 'FAIL', `CLS ${vitals.cls}`);
  if (vitals.lcp > LCP_BUDGET_MS) {
    record(path, vp.name, 'FAIL', `LCP ${vitals.lcp}ms exceeds ${LCP_BUDGET_MS}ms budget`);
  }
  if (vp.mobile && audit.small.length) record(path, vp.name, 'WARN', `small targets: ${audit.small.join(', ')}`);

  record(path, vp.name, 'INFO', `CLS ${vitals.cls} · LCP ${vitals.lcp}ms · focusable ${audit.focusable}`);

  if (SHOTS) {
    await mkdir(OUT, { recursive: true });
    const slug = path === '/' ? 'home' : path.replace(/\W+/g, '-').replace(/^-|-$/g, '');
    await page.screenshot({
      path: `${OUT}/${slug}-${vp.name}.png`,
      fullPage: vp.name === 'laptop' || vp.name === 'iphone-pro',
    });
  }

  await page.close();
  return { label, audit, vitals };
}

async function main() {
  // Actually build. This previously printed "building…" and then served
  // whatever was already in dist/, so a source change could pass an audit
  // against stale output.
  if (SKIP_BUILD) {
    console.log('skipping build (--no-build): auditing existing dist/');
  } else {
    console.log('building…');
    execFileSync('npx', ['astro', 'build'], { stdio: 'ignore' });
  }

  const { server, port } = await serve(4322);
  const base = `http://localhost:${port}`;

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'shell',
    args: [
      '--headless=new',
      '--hide-scrollbars',
      '--enable-unsafe-swiftshader', // software GL so WebGL works headless
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--no-sandbox',
    ],
  });

  // Warm the browser and the font cache first. The very first navigation in a
  // fresh Chrome pays profile creation, font decode and shader warmup, which
  // showed up as a ~2.9s LCP on whichever page happened to be audited first.
  try {
    const warm = await browser.newPage();
    await warm.goto(`${base}/`, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 600));
    await warm.close();
  } catch {
    /* warmup is best-effort */
  }

  const meta = [];
  for (const path of PAGES) {
    for (const vp of VIEWPORTS) {
      try {
        const r = await auditPage(browser, base, path, vp);
        meta.push(r);
      } catch (e) {
        record(path, vp.name, 'FAIL', `threw: ${e.message}`);
      }
    }
  }

  await browser.close();
  server.close();

  // --- report -------------------------------------------------------------
  const fails = results.filter((r) => r.level === 'FAIL');
  const warns = results.filter((r) => r.level === 'WARN');

  console.log('\n' + '='.repeat(76));
  if (fails.length) {
    console.log(`FAILURES (${fails.length})`);
    for (const f of fails) console.log(`  ✗ ${f.page} @ ${f.viewport}\n      ${f.message}`);
  } else {
    console.log('no failures');
  }
  if (warns.length) {
    console.log(`\nWARNINGS (${warns.length})`);
    for (const w of warns) console.log(`  ! ${w.page} @ ${w.viewport}: ${w.message}`);
  }
  console.log('\nVITALS');
  for (const r of results.filter((x) => x.level === 'INFO')) {
    console.log(`  ${r.page.padEnd(16)} ${r.viewport.padEnd(11)} ${r.message}`);
  }
  console.log('='.repeat(76));

  await mkdir(OUT, { recursive: true });
  await writeFile(`${OUT}/report.json`, JSON.stringify({ results, meta }, null, 2));

  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
