import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// Served from GitHub Pages at https://hmcts.github.io/cnp-api-docs/, so every
// internal link must carry the /cnp-api-docs base.
export default defineConfig({
  site: 'https://hmcts.github.io',
  base: '/cnp-api-docs',
  outDir: '../build/site',
  output: 'static',
  integrations: [react()],
  devToolbar: { enabled: false },
  build: {
    // Publishers own docs/specs/, and the deploy copies those bytes in verbatim.
    // Keeping generated assets under _astro/ means they can never collide.
    assets: '_astro',
  },
});
