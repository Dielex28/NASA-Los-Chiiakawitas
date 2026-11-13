// After `vite build`: copy the single-file build next to the sources as
// helios-outpost.html, the ready-to-play copy that works from a double-click.
import { copyFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const built = `${root}dist/index.html`;
copyFileSync(built, `${root}helios-outpost.html`);
const extra = readdirSync(`${root}dist`).filter((f) => f !== 'index.html');
const kb = (statSync(built).size / 1024).toFixed(0);
console.log(`helios-outpost.html written (${kb} kB, self-contained${extra.length ? `; dist also has: ${extra.join(', ')}` : ''})`);
