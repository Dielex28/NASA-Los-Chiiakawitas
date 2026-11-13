import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The production build is ONE self-contained file (script, styles and fonts inlined).
// That matters for a classroom: `dist/index.html` runs from a double-click, a USB stick,
// GitHub Pages or itch.io alike — browsers refuse to load separate module files from disk.
//
// HELIOS_ANY_HOST=1 lets the dev/preview server answer on any hostname (needed behind a
// preview proxy); leave it unset on your own machine.
const anyHost = process.env.HELIOS_ANY_HOST === '1' ? { allowedHosts: true as const } : {};

export default defineConfig({
  base: './',
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    // es2020 keeps older tablets and school computers in the game (WebGL 2 is the real floor)
    target: 'es2020',
    chunkSizeWarningLimit: 4000,
  },
  server: { host: true, ...anyHost },
  preview: { host: true, ...anyHost },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
} as any);
