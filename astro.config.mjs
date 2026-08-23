// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://weblio.design',
  output: 'static',
  trailingSlash: 'never',

  integrations: [sitemap()],

  build: {
    // Inline it. The whole site's CSS is ~7 KB gzipped across three pages, so
    // the cross-page cache win is smaller than the cost of a render-blocking
    // request in front of the largest contentful paint.
    inlineStylesheets: 'always',
    assets: '_assets',
  },

  vite: {
    build: {
      cssMinify: 'lightningcss',
      // Fail loudly in CI rather than silently shipping a heavy bundle.
      chunkSizeWarningLimit: 180,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Lenis is the only third-party runtime dependency, and it is
            // dynamically imported for pointer-capable, motion-allowing
            // visitors only — keeping it in its own chunk means everyone else
            // never downloads it.
            if (id.includes('node_modules/lenis')) return 'lenis';
            return undefined;
          },
        },
      },
    },
  },

  devToolbar: { enabled: false },
});
