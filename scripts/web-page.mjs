// Turns the single-file build (dist/index.html) into the body of a page for hosts that wrap
// pages in their own <html>/<head> (such as a published claude.ai page): the title, the styles,
// the markup and the scripts, in that order, with no document skeleton of its own.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('dist/index.html', 'utf8');
const between = (from, open, close) => {
  const a = src.indexOf(open, from);
  if (a < 0) throw new Error(`missing ${open}`);
  const b = src.indexOf(close, a + open.length);
  return { start: a, end: b + close.length, inner: src.slice(a + open.length, b) };
};
// the boot styles come first in the head; the app's module script, then its stylesheet, follow
const boot = between(0, '<style>', '</style>');
const moduleOpen = '<script type="module" crossorigin>';
const cssOpen = '<style rel="stylesheet" crossorigin>';
const cssAt = src.indexOf(cssOpen);
const jsAt = src.indexOf(moduleOpen);
const jsEnd = src.lastIndexOf('</script>', cssAt);
const js = src.slice(jsAt + moduleOpen.length, jsEnd);
const css = between(cssAt, cssOpen, '</style>');
const body = between(css.end, '<body>', '</body>');
// the "open the prebuilt copy" redirect only makes sense next to the source page
const markup = body.inner.replace("setTimeout(function () { location.replace(STANDALONE); }, 350);", '');
const page = [
  '<title>Helios Outpost</title>',
  '<style>:root { color-scheme: dark; } body { background: #05070c; }</style>',
  `<style>${boot.inner}</style>`,
  `<style>${css.inner}</style>`,
  markup.trim(),
  `<script type="module">${js}</script>`,
].join('\n');
mkdirSync('dist-web', { recursive: true });
writeFileSync('dist-web/helios-outpost.html', page);
console.log(`dist-web/helios-outpost.html written (${Math.round(page.length / 1024)} kB)`);
