/**
 * Minimal static server for dist/. Used by scripts/verify.mjs and for local
 * preview of the real production output (astro preview is close, but this
 * serves exactly the files that get uploaded).
 */
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../dist', import.meta.url));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

async function resolve(pathname) {
  // Strip query/hash and prevent traversal outside dist/.
  const clean = normalize(decodeURIComponent(pathname.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const candidates = [
    join(ROOT, clean),
    join(ROOT, clean, 'index.html'),
    join(ROOT, `${clean}.html`),
  ];
  for (const c of candidates) {
    if (!c.startsWith(ROOT)) continue;
    try {
      const s = await stat(c);
      if (s.isFile()) return c;
    } catch {
      /* next */
    }
  }
  return null;
}

export function serve(port = 4322) {
  const server = createServer(async (req, res) => {
    const file = await resolve(req.url || '/');
    if (!file) {
      const notFound = await resolve('/404.html').catch(() => null);
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      res.end(notFound ? await readFile(notFound) : 'Not found');
      return;
    }
    let body = await readFile(file);
    const type = TYPES[extname(file)] || 'application/octet-stream';
    const headers = { 'content-type': type };

    // Every real host compresses text. Without this, local Lighthouse runs
    // report a text-compression failure that would not exist in production.
    const compressible = /text\/|javascript|json|xml|svg/.test(type);
    if (compressible && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      body = gzipSync(body);
      headers['content-encoding'] = 'gzip';
      headers['vary'] = 'Accept-Encoding';
    }
    headers['content-length'] = body.length;
    // Match what a CDN would send, so measurements are realistic.
    if (/\.(woff2|png|jpg|webp|avif|svg)$/.test(file) || file.includes('_assets')) {
      headers['cache-control'] = 'public, max-age=31536000, immutable';
    } else {
      headers['cache-control'] = 'public, max-age=0, must-revalidate';
    }
    res.writeHead(200, headers);
    res.end(body);
  });
  return new Promise((resolvePromise) => {
    server.listen(port, () => resolvePromise({ server, port }));
  });
}

// Run directly: `node scripts/serve-dist.mjs [port]`
// pathToFileURL, not string concatenation: this project's path contains spaces
// and a curly apostrophe, which a raw `file://${argv[1]}` never matches.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.argv[2]) || 4322;
  serve(port).then(() => console.log(`dist/ served at http://localhost:${port}`));
}
