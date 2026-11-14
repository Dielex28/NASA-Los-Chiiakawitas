type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown>;

/** Tiny hyperscript helper: `h('div.card', { onclick }, 'text', child)`. */
export function h<K extends keyof HTMLElementTagNameMap>(spec: K | string, props?: Props | Child, ...children: Child[]): HTMLElement {
  const [tag, ...classes] = String(spec).split('.');
  const el = document.createElement(tag || 'div');
  if (classes.length) el.className = classes.join(' ');
  let kids = children;
  if (props !== undefined && props !== null && typeof props === 'object' && !(props instanceof Node)) {
    for (const [k, v] of Object.entries(props as Props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'class') el.className += (el.className ? ' ' : '') + String(v);
      else if (k === 'html') el.innerHTML = String(v);
      else if (k === 'text') el.textContent = String(v);
      else if (k in el && k !== 'list') (el as any)[k] = v;
      else el.setAttribute(k, String(v));
    }
  } else kids = [props as Child, ...children];
  for (const c of kids) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Set text only when it changed (keeps the per-frame HUD refresh cheap). */
export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

const P: Record<string, string> = {
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  moon: '<path d="M19.5 14.2A8 8 0 1 1 9.8 4.5a6.3 6.3 0 0 0 9.7 9.7z"/>',
  rad: '<circle cx="12" cy="12" r="1.9"/><path d="M12 7.2a4.8 4.8 0 0 0-2.4.64L6.9 3.2a10.2 10.2 0 0 1 10.2 0l-2.7 4.64A4.8 4.8 0 0 0 12 7.2zM7.2 12a4.8 4.8 0 0 0 2.4 4.16l-2.7 4.64A10.2 10.2 0 0 1 1.8 12zM16.8 12h5.4a10.2 10.2 0 0 1-5.1 8.8l-2.7-4.64A4.8 4.8 0 0 0 16.8 12z" fill="currentColor" stroke="none"/>',
  shield: '<path d="M12 2.8l7.5 2.8v5.6c0 4.6-3.1 8.3-7.5 10-4.4-1.7-7.5-5.4-7.5-10V5.6z"/><path d="M8.8 12l2.3 2.3 4.2-4.6"/>',
  water: '<path d="M12 3s6.2 6.6 6.2 11.2A6.2 6.2 0 0 1 5.8 14.2C5.8 9.6 12 3 12 3z"/>',
  air: '<path d="M3 8.5h10.5a2.7 2.7 0 1 0-2.7-2.7M3 12.5h15.2a2.9 2.9 0 1 1-2.9 2.9M3 16.5h7.5a2.3 2.3 0 1 1-2.3 2.3"/>',
  food: '<path d="M12 21c-4.6 0-7.6-3.4-7.6-7.6 0-3.6 2.4-6 5.1-6 1.1 0 1.8.4 2.5.4s1.4-.4 2.5-.4c2.7 0 5.1 2.4 5.1 6 0 4.2-3 7.6-7.6 7.6z"/><path d="M12 7.6c0-2.3 1.2-3.9 3.3-4.6"/>',
  leaf: '<path d="M5 19c0-8.5 5.2-13.6 14.5-14.2C19 14 14 19.4 5 19z"/><path d="M5 19c2.6-4.6 6-8 10-10.2"/>',
  drill: '<path d="M12 2.5v6M8.5 8.5h7l-1.4 4.2H9.9zM10.4 12.7l-.9 3.4h5l-.9-3.4M10.8 16.1l1.2 5.4 1.2-5.4"/>',
  cargo: '<path d="M3.5 7.8L12 3.5l8.5 4.3v8.4L12 20.5l-8.5-4.3z"/><path d="M3.5 7.8L12 12l8.5-4.2M12 12v8.5"/>',
  power: '<path d="M13.2 2.5L5.4 13.4h5.4l-1 8.1 8.8-11.4h-5.9z"/>',
  battery: '<rect x="3" y="7.5" width="16" height="9" rx="1.8"/><path d="M21 10.5v3"/><path d="M6 10.2v3.6M9 10.2v3.6M12 10.2v3.6" stroke-width="2"/>',
  atom: '<circle cx="12" cy="12" r="1.6" fill="currentColor"/><ellipse cx="12" cy="12" rx="9.3" ry="3.7"/><ellipse cx="12" cy="12" rx="9.3" ry="3.7" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9.3" ry="3.7" transform="rotate(120 12 12)"/>',
  wind: '<path d="M2.5 9h11a3 3 0 1 0-3-3M2.5 14h16a3 3 0 1 1-3 3M2.5 11.5h6"/>',
  ice: '<path d="M12 2.5v19M4 7l16 10M20 7L4 17M9.5 4.2L12 6.4l2.5-2.2M9.5 19.8L12 17.6l2.5 2.2"/>',
  jump: '<circle cx="12" cy="5" r="2.2"/><path d="M12 7.6v6.2l-3.4 5.7M12 13.8l3.4 5.7M6.8 10.5L12 9l5.2 1.5M4 21.5h16"/>',
  dust: '<circle cx="6" cy="16" r="1.4"/><circle cx="11" cy="11" r="1.1"/><circle cx="16.5" cy="14.5" r="1.7"/><circle cx="15" cy="7" r="0.9"/><circle cx="8" cy="7.5" r="0.8"/><path d="M3 20.5h18"/>',
  sky: '<path d="M3 17.5h18M5.5 13.5a6.5 6.5 0 0 1 13 0"/><path d="M12 3.5v1.8M4.6 6.6l1.3 1.3M19.4 6.6l-1.3 1.3"/>',
  earth: '<circle cx="12" cy="12" r="9"/><path d="M3.4 9.5c3 .4 4.2 2 3.8 4.2-.3 1.8 1.6 2.4 2 4.4.2 1.2 0 2.2-.5 2.6M13 3.2c-.8 1.6-.2 3 1.8 3.6 2 .6 2 2.4.8 3.6-1.3 1.3-.4 3.2 1.6 3.2 1.6 0 2.4 1.2 2.2 2.8"/>',
  antenna: '<path d="M4.5 13.5a7.5 7.5 0 0 0 7.5 7.5M4.5 13.5L13 5M12 21l8.5-8.5M10.5 13.5L16 8M16 8a2 2 0 1 0 0-.01zM7.5 21h9"/>',
  crew: '<circle cx="8.5" cy="8" r="3"/><path d="M2.8 19.5c.4-3.4 2.7-5.5 5.7-5.5s5.3 2.1 5.7 5.5"/><circle cx="16.8" cy="9" r="2.3"/><path d="M15.6 14.2c3-.5 5.3 1.5 5.7 4.8"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.4v.4" stroke-width="2"/>',
  science: '<path d="M9.5 3h5M10.5 3v6.2L5 18.4A1.8 1.8 0 0 0 6.6 21h10.8a1.8 1.8 0 0 0 1.6-2.6L13.5 9.2V3M7.6 15h8.8"/>',
  play: '<path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor"/>',
  pause: '<path d="M7.5 5v14M16.5 5v14" stroke-width="3"/>',
  ff: '<path d="M3.5 5.5l8 6.5-8 6.5zM12.5 5.5l8 6.5-8 6.5z" fill="currentColor"/>',
  fff: '<path d="M2 6l6 6-6 6zM9 6l6 6-6 6zM16 6l6 6-6 6z" fill="currentColor"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16" stroke-width="2"/>',
  eva: '<circle cx="12" cy="7.5" r="4"/><path d="M9.3 7.5h5.4"/><path d="M7 21v-5.5a5 5 0 0 1 10 0V21M4.5 13.5l2.8 1.2M19.5 13.5l-2.8 1.2"/>',
  close: '<path d="M6 6l12 12M18 6L6 18" stroke-width="2"/>',
  check: '<path d="M4.5 12.5l5 5 10-11" stroke-width="2.2"/>',
  warn: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17v.4" stroke-width="2"/>',
  plus: '<path d="M12 5v14M5 12h14" stroke-width="2.2"/>',
  minus: '<path d="M5 12h14" stroke-width="2.2"/>',
  target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
  home: '<path d="M3.5 11.5L12 4l8.5 7.5M6 10v9.5h12V10M10 19.5v-5h4v5"/>',
  map: '<path d="M3.5 6.5l5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2zM9 4.5v13M15 6.5v13"/>',
  log: '<path d="M5 4.5h14v15H5zM8.5 9h7M8.5 12.5h7M8.5 16h4"/>',
  hab: '<path d="M3 18.5v-5a9 9 0 0 1 18 0v5zM3 18.5h18M10 18.5v-4.5h4v4.5"/>',
  rocket: '<path d="M12 2.5c3.2 2.5 4.8 6 4.8 10l-1.8 3.5H9l-1.8-3.5c0-4 1.6-7.500 4.800-10zM9.300 16l-2.300 4 3.500-1.500M14.700 16l2.300 4-3.500-1.500"/><circle cx="12" cy="9.500" r="1.700"/>',
  temp: '<path d="M10 4.500a2 2 0 0 1 4 0v9.200a4.200 4.200 0 1 1-4 0zM12 9v7.500"/>',
  o2: '<circle cx="9" cy="12" r="5.500"/><path d="M16.500 15.500c0-1.300 3-1.700 3-3.500a1.600 1.600 0 0 0-3-.6M16.500 18h3.200"/>',
  heart: '<path d="M12 20.500S3.500 15.300 3.500 9.300A4.500 4.500 0 0 1 12 7.200a4.500 4.500 0 0 1 8.500 2.100c0 6-8.500 11.200-8.500 11.200z"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14.200c1 1.600 2.400 2.400 4 2.400s3-.8 4-2.400M9 9.600v.4M15 9.600v.4" stroke-width="2"/>',
  gear: '<circle cx="12" cy="12" r="3.200"/><path d="M12 2.800v2.600M12 18.600v2.600M2.800 12h2.600M18.600 12h2.600M5.500 5.500l1.800 1.800M16.700 16.700l1.800 1.800M5.500 18.500l1.800-1.800M16.700 7.300l1.800-1.800"/>',
  book: '<path d="M4 5.500C6.500 4.300 9.500 4.300 12 6c2.500-1.700 5.500-1.700 8-.5v13c-2.500-1.200-5.500-1.200-8 .5-2.500-1.700-5.500-1.700-8-.5zM12 6v13"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.300 9.300a2.800 2.800 0 1 1 3.900 2.600c-.8.4-1.200 1-1.200 1.900M12 17v.4" stroke-width="2"/>',
  back: '<path d="M10 5.500L3.500 12l6.500 6.500M3.500 12h17" stroke-width="2"/>',
  lock: '<rect x="5" y="10.500" width="14" height="10" rx="2"/><path d="M8 10.500V8a4 4 0 0 1 8 0v2.500"/>',
  bolt: '<path d="M13.200 2.500L5.400 13.400h5.400l-1 8.100 8.800-11.400h-5.900z" fill="currentColor"/>',
  scan: '<path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4M3 12h18"/>',
  download: '<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 19h14"/>',
  eye: '<path d="M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12z"/><circle cx="12" cy="12" r="2.800"/>',
  trash: '<path d="M4.500 7h15M9.500 7V4.500h5V7M6.500 7l1 13h9l1-13"/>',
  star: '<path d="M12 3l2.700 5.700 6.300.800-4.600 4.300 1.200 6.200L12 17l-5.600 3 1.200-6.200L3 9.500l6.300-.800z"/>',
};

/** Inline SVG icon (24×24, stroke = currentColor). */
export function icon(name: string, size = 18): HTMLElement {
  const span = document.createElement('span');
  span.className = 'ico';
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? P.info}</svg>`;
  return span;
}

export function fmt(v: number, digits = 0): string {
  if (!isFinite(v)) return '—';
  return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
