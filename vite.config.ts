import { defineConfig } from 'vite';

// `base: './'` keeps every asset path relative, so the build works on GitHub Pages
// (served from /<repo>/), on itch.io, or opened from any static host without changes.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
  },
  server: { host: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
} as any);
