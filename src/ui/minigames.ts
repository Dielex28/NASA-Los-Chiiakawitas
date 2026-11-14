import { h, icon } from './dom';
import { has, t } from './strings';

/**
 * Short hands-on jobs in the style of a crew's task list: rewire, bolt a flange in a star,
 * find a leak and patch it, point a dish, swap broken cells, reboot a computer, clean a filter,
 * sow, harvest, level an instrument, fight a fire, drill a core, purge valves, look down a
 * microscope, give first aid, hold a data link. Each one is a real procedure, simplified, with
 * the fact behind it on screen. They draw on a 640 × 400 canvas scaled to the panel, work with
 * a mouse, a finger or the keyboard, and report a quality from 0 to 1.
 */
export type GameId =
  | 'wires'
  | 'bolts'
  | 'patch'
  | 'locate'
  | 'align'
  | 'cells'
  | 'reboot'
  | 'wipe'
  | 'plant'
  | 'harvest'
  | 'level'
  | 'extinguish'
  | 'drill'
  | 'valves'
  | 'microscope'
  | 'firstaid'
  | 'download';

export type Sfx = 'tick' | 'good' | 'warn' | 'click' | 'place';

export interface MinigameSpec {
  id: GameId;
  /** Which fact and labels to show: 'antenna', 'reflector', 'solar', 'filter', 'clean', 'battery', 'core', 'leak', 'scorch', 'weather'… */
  ctx?: string;
  /** What is being done (shown as the panel's title). */
  title: string;
  level: 1 | 2 | 3;
  data?: Record<string, string | number>;
}

const W = 640;
const H = 400;
const TAU = Math.PI * 2;

interface Pal {
  accent: string;
  ok: string;
  bad: string;
  info: string;
  rad: string;
  text: string;
  text2: string;
  line: string;
  raised: string;
  solid: string;
}

/** The interface colours (they follow the colour-blind palette when it is on). */
function palette(): Pal {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, d: string): string => cs.getPropertyValue(n).trim() || d;
  return {
    accent: v('--accent', '#f2a93b'),
    ok: v('--ok', '#7bd88f'),
    bad: v('--bad', '#ff6b5e'),
    info: v('--info', '#5bc8e8'),
    rad: v('--rad', '#c9a6ff'),
    text: v('--text', '#e6eaee'),
    text2: v('--text-2', '#a7b0ba'),
    line: v('--line', '#2b323a'),
    raised: v('--raised', '#151a1f'),
    solid: v('--solid', '#101418'),
  };
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a);
const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by);
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

function rrect(c: CanvasRenderingContext2D, x: number, y: number, w: number, hh: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + hh, r);
  c.arcTo(x + w, y + hh, x, y + hh, r);
  c.arcTo(x, y + hh, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Shapes that tell colours apart without colour: triangle, circle, square, diamond, star. */
function symbol(c: CanvasRenderingContext2D, kind: number, x: number, y: number, r: number): void {
  c.beginPath();
  if (kind === 0) {
    c.moveTo(x, y - r);
    c.lineTo(x + r * 0.95, y + r * 0.75);
    c.lineTo(x - r * 0.95, y + r * 0.75);
  } else if (kind === 1) c.arc(x, y, r * 0.85, 0, TAU);
  else if (kind === 2) c.rect(x - r * 0.75, y - r * 0.75, r * 1.5, r * 1.5);
  else if (kind === 3) {
    c.moveTo(x, y - r);
    c.lineTo(x + r, y);
    c.lineTo(x, y + r);
    c.lineTo(x - r, y);
  } else {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
  }
  c.closePath();
}

function text(c: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, size = 13, align: CanvasTextAlign = 'center', weight = '600'): void {
  c.fillStyle = color;
  c.font = `${weight} ${size}px B612, "Segoe UI", system-ui, sans-serif`;
  c.textAlign = align;
  c.textBaseline = 'middle';
  c.fillText(s, x, y);
}

/** Wrap a line of text to a width (for buttons and messages). */
function wrapText(c: CanvasRenderingContext2D, s: string, x: number, y: number, maxW: number, color: string, size = 12, lineH = 15): void {
  c.font = `600 ${size}px B612, "Segoe UI", system-ui, sans-serif`;
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (c.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  const y0 = y - ((lines.length - 1) * lineH) / 2;
  lines.forEach((l, i) => text(c, l, x, y0 + i * lineH, color, size));
}

function bar(c: CanvasRenderingContext2D, x: number, y: number, w: number, hh: number, f: number, color: string, p: Pal, label?: string): void {
  rrect(c, x, y, w, hh, 4);
  c.fillStyle = 'rgba(255,255,255,0.06)';
  c.fill();
  c.strokeStyle = p.line;
  c.stroke();
  if (w > hh) {
    rrect(c, x + 2, y + 2, Math.max(0, (w - 4) * clamp(f, 0, 1)), hh - 4, 3);
  } else {
    const fh = (hh - 4) * clamp(f, 0, 1);
    rrect(c, x + 2, y + hh - 2 - fh, w - 4, fh, 3);
  }
  c.fillStyle = color;
  c.fill();
  if (label) text(c, label, w > hh ? x + w / 2 : x + w, w > hh ? y - 11 : y - 12, p.text2, 11, w > hh ? 'center' : 'right');
}

function backdrop(c: CanvasRenderingContext2D, p: Pal): void {
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#11161c');
  g.addColorStop(1, '#0a0d11');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(255,255,255,0.025)';
  c.lineWidth = 1;
  for (let x = 0; x <= W; x += 32) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, H);
    c.stroke();
  }
  for (let y = 0; y <= H; y += 32) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(W, y);
    c.stroke();
  }
  void p;
}

/* ------------------------------------------------------------------ base */

abstract class Game {
  t = 0;
  mistakes = 0;
  over = false;
  quality = 1;
  /** A line under the canvas (progress, what to do next). */
  status = '';
  /** Message drawn over the canvas for a moment. */
  msg = '';
  msgT = 0;
  flash = 0;
  px = W / 2;
  py = H / 2;
  pressed = false;
  readonly keys = new Set<string>();

  constructor(
    readonly spec: MinigameSpec,
    readonly p: Pal,
    readonly sfx: (k: Sfx) => void,
  ) {}

  get lvl(): number {
    return this.spec.level;
  }

  abstract draw(c: CanvasRenderingContext2D, dt: number): void;
  onDown(x: number, y: number): void {
    void x;
    void y;
  }
  onMove(x: number, y: number): void {
    void x;
    void y;
  }
  onUp(x: number, y: number): void {
    void x;
    void y;
  }
  onKey(code: string): void {
    void code;
  }

  /** Done: quality falls with time beyond `par` seconds and with each mistake. */
  protected finish(par: number): void {
    if (this.over) return;
    this.over = true;
    const slow = Math.min(1, Math.max(0, this.t - par) / (2 * par));
    this.quality = clamp(1 - 0.5 * slow - 0.12 * this.mistakes, 0.1, 1);
    this.sfx('good');
  }

  protected miss(message?: string): void {
    this.mistakes++;
    this.flash = 0.35;
    this.sfx('warn');
    if (message) this.say(message);
  }

  protected say(message: string, seconds = 2.6): void {
    this.msg = message;
    this.msgT = seconds;
  }
}

/* ----------------------------------------------------------------- wires */

class Wires extends Game {
  private n = [3, 4, 5][this.lvl - 1];
  private left = shuffle(range(this.n));
  private right = shuffle(range(this.n));
  private linked = new Set<number>();
  private drag: number | null = null;
  private cols = [this.p.accent, this.p.info, this.p.ok, this.p.bad, this.p.rad];

  private y(i: number): number {
    return 80 + (i + 0.5) * (260 / this.n);
  }

  draw(c: CanvasRenderingContext2D): void {
    backdrop(c, this.p);
    rrect(c, 40, 52, 560, 300, 10);
    c.fillStyle = '#151b22';
    c.fill();
    c.strokeStyle = this.p.line;
    c.lineWidth = 2;
    c.stroke();
    const scorch = this.spec.ctx === 'scorch';
    if (scorch) {
      const g = c.createRadialGradient(320, 200, 10, 320, 200, 200);
      g.addColorStop(0, 'rgba(20,12,8,0.75)');
      g.addColorStop(1, 'rgba(20,12,8,0)');
      c.fillStyle = g;
      c.fillRect(40, 52, 560, 300);
    }
    const terminal = (x: number, y: number, ci: number, lit: boolean): void => {
      rrect(c, x - 22, y - 16, 44, 32, 6);
      c.fillStyle = '#0d1116';
      c.fill();
      c.strokeStyle = lit ? this.cols[ci] : this.p.line;
      c.lineWidth = 2;
      c.stroke();
      symbol(c, ci, x, y, 9);
      c.fillStyle = this.cols[ci];
      c.fill();
    };
    // linked wires
    c.lineCap = 'round';
    for (let i = 0; i < this.n; i++) {
      const ci = this.left[i];
      if (!this.linked.has(ci)) {
        // a cut stub hanging off the left terminal
        c.strokeStyle = this.cols[ci];
        c.lineWidth = 9;
        c.beginPath();
        c.moveTo(112, this.y(i));
        c.lineTo(150, this.y(i) + 6);
        c.stroke();
        continue;
      }
      const j = this.right.indexOf(ci);
      c.strokeStyle = this.cols[ci];
      c.lineWidth = 9;
      c.beginPath();
      c.moveTo(112, this.y(i));
      c.bezierCurveTo(300, this.y(i), 340, this.y(j), 528, this.y(j));
      c.stroke();
    }
    if (this.drag !== null) {
      const i = this.left.indexOf(this.drag);
      c.strokeStyle = this.cols[this.drag];
      c.lineWidth = 9;
      c.beginPath();
      c.moveTo(112, this.y(i));
      c.bezierCurveTo((112 + this.px) / 2, this.y(i), (112 + this.px) / 2, this.py, this.px, this.py);
      c.stroke();
    }
    for (let i = 0; i < this.n; i++) {
      terminal(90, this.y(i), this.left[i], this.linked.has(this.left[i]) || this.drag === this.left[i]);
      terminal(550, this.y(i), this.right[i], this.linked.has(this.right[i]));
    }
    this.status = t('tasks.progress', { done: this.linked.size, total: this.n });
  }

  onDown(x: number, y: number): void {
    for (let i = 0; i < this.n; i++) {
      if (dist(x, y, 90, this.y(i)) < 30 && !this.linked.has(this.left[i])) {
        this.drag = this.left[i];
        this.sfx('tick');
      }
    }
  }

  onUp(x: number, y: number): void {
    if (this.drag === null) return;
    for (let j = 0; j < this.n; j++) {
      if (dist(x, y, 550, this.y(j)) < 34) {
        if (this.right[j] === this.drag) {
          this.linked.add(this.drag);
          this.sfx('place');
          if (this.linked.size === this.n) this.finish(2.4 * this.n);
        } else this.miss();
      }
    }
    this.drag = null;
  }
}

/* ----------------------------------------------------------------- bolts */

class Bolts extends Game {
  private n = [4, 6, 8][this.lvl - 1];
  private torque = new Array<number>(this.n).fill(0);
  private pass = 1;
  private last: number | null = null;
  private spin = new Array<number>(this.n).fill(0);

  private pos(i: number): [number, number] {
    const a = -Math.PI / 2 + (i * TAU) / this.n;
    return [320 + Math.cos(a) * 135, 205 + Math.sin(a) * 135];
  }

  draw(c: CanvasRenderingContext2D, dt: number): void {
    backdrop(c, this.p);
    // the flange and its seal
    c.beginPath();
    c.arc(320, 205, 170, 0, TAU);
    c.fillStyle = '#2a3038';
    c.fill();
    c.beginPath();
    c.arc(320, 205, 105, 0, TAU);
    c.fillStyle = '#0e1216';
    c.fill();
    c.lineWidth = 6;
    c.strokeStyle = this.mistakes ? '#5a3a2a' : '#3b4048';
    c.beginPath();
    c.arc(320, 205, 112, 0, TAU);
    c.stroke();
    for (let i = 0; i < this.n; i++) {
      const [x, y] = this.pos(i);
      this.spin[i] += (this.torque[i] * 6 - this.spin[i]) * Math.min(1, dt * 8);
      c.save();
      c.translate(x, y);
      c.rotate(this.spin[i]);
      c.beginPath();
      for (let k = 0; k < 6; k++) c.lineTo(Math.cos((k * TAU) / 6) * 20, Math.sin((k * TAU) / 6) * 20);
      c.closePath();
      c.fillStyle = '#9aa3ad';
      c.fill();
      c.strokeStyle = '#5c646d';
      c.lineWidth = 2;
      c.stroke();
      c.restore();
      // torque arc: half, then full
      c.lineWidth = 5;
      c.strokeStyle = this.torque[i] >= 1 ? this.p.ok : this.p.accent;
      if (this.torque[i] > 0) {
        c.beginPath();
        c.arc(x, y, 27, -Math.PI / 2, -Math.PI / 2 + TAU * this.torque[i]);
        c.stroke();
      }
      if (this.last === i) {
        c.strokeStyle = this.p.info;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(x, y, 33, 0, TAU);
        c.stroke();
      }
      // the youngest players see the opposite bolt marked
      if (this.lvl === 1 && this.last !== null && (this.last + this.n / 2) % this.n === i) {
        c.strokeStyle = this.p.info;
        c.setLineDash([4, 4]);
        c.beginPath();
        c.arc(x, y, 33, 0, TAU);
        c.stroke();
        c.setLineDash([]);
      }
    }
    if (this.last !== null) {
      const [ax, ay] = this.pos(this.last);
      const [bx, by] = this.pos((this.last + this.n / 2) % this.n);
      c.strokeStyle = 'rgba(91,200,232,0.25)';
      c.lineWidth = 2;
      c.setLineDash([6, 6]);
      c.beginPath();
      c.moveTo(ax, ay);
      c.lineTo(bx, by);
      c.stroke();
      c.setLineDash([]);
    }
    text(c, `${this.pass}/2`, 320, 205, this.p.text2, 22, 'center', '700');
    this.status = t('tasks.progress', { done: this.torque.filter((q) => q >= this.pass * 0.5).length, total: this.n });
  }

  onDown(x: number, y: number): void {
    for (let i = 0; i < this.n; i++) {
      const [bx, by] = this.pos(i);
      if (dist(x, y, bx, by) > 30) continue;
      if (this.torque[i] >= this.pass * 0.5) return;
      if (this.last !== null && i !== (this.last + this.n / 2) % this.n) {
        this.miss();
        return;
      }
      this.last = this.last === null ? i : null;
      this.torque[i] = this.pass * 0.5;
      this.sfx('tick');
      if (this.torque.every((q) => q >= this.pass * 0.5)) {
        if (this.pass === 1) {
          this.pass = 2;
          this.last = null;
        } else this.finish(this.n * 1.7);
      }
      return;
    }
  }
}

/* ------------------------------------------------- patch (and locate) */

class Patch extends Game {
  private locateOnly = this.spec.id === 'locate';
  private hole = { x: rand(150, 490), y: rand(110, 300) };
  private found = false;
  private marks: Array<{ x: number; y: number; t: number }> = [];
  private patch = { x: 575, y: 330 };
  private dragging = false;
  private cure = 0;
  private sigma = this.lvl === 1 ? 120 : 85;
  private hitR = this.lvl === 1 ? 36 : 26;
  private hiss: Array<{ x: number; y: number; vx: number; vy: number; life: number }> = [];

  private hull(c: CanvasRenderingContext2D): void {
    const g = c.createLinearGradient(0, 40, 0, 360);
    g.addColorStop(0, '#c9ccd0');
    g.addColorStop(1, '#9ea3a9');
    c.fillStyle = g;
    rrect(c, 40, 40, 560, 320, 8);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.25)';
    c.lineWidth = 2;
    for (const x of [180, 320, 460]) {
      c.beginPath();
      c.moveTo(x, 40);
      c.lineTo(x, 360);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(40, 200);
    c.lineTo(600, 200);
    c.stroke();
    c.fillStyle = 'rgba(0,0,0,0.25)';
    for (let x = 52; x < 600; x += 24) {
      for (const y of [50, 190, 210, 350]) {
        c.beginPath();
        c.arc(x, y, 2, 0, TAU);
        c.fill();
      }
    }
  }

  draw(c: CanvasRenderingContext2D, dt: number): void {
    backdrop(c, this.p);
    this.hull(c);
    const d = dist(this.px, this.py, this.hole.x, this.hole.y);
    const sig = Math.exp(-(d * d) / (2 * this.sigma * this.sigma));
    if (!this.found) {
      if (this.locateOnly) {
        // the thermal camera's view around the pointer: warm hull, a cold spot at the leak
        c.save();
        c.beginPath();
        c.arc(this.px, this.py, 80, 0, TAU);
        c.clip();
        for (let y = this.py - 80; y < this.py + 80; y += 8) {
          for (let x = this.px - 80; x < this.px + 80; x += 8) {
            const k = Math.exp(-(dist(x, y, this.hole.x, this.hole.y) ** 2) / (2 * 55 * 55));
            const n = Math.sin(x * 0.07) * Math.cos(y * 0.05) * 0.08;
            const v = clamp(k + n, 0, 1);
            c.fillStyle = `rgb(${Math.round(250 - 230 * v)},${Math.round(120 + 40 * (1 - Math.abs(v - 0.5) * 2))},${Math.round(40 + 200 * v)})`;
            c.fillRect(x, y, 8, 8);
          }
        }
        c.restore();
        c.strokeStyle = this.p.info;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(this.px, this.py, 80, 0, TAU);
        c.stroke();
      } else {
        // the ultrasonic detector: louder near the hole
        c.strokeStyle = `rgba(91,200,232,${0.3 + 0.7 * sig})`;
        c.lineWidth = 2 + 4 * sig;
        c.beginPath();
        c.arc(this.px, this.py, 22 + 10 * Math.sin(this.t * (6 + 20 * sig)), 0, TAU);
        c.stroke();
        bar(c, 612, 60, 16, 280, sig, sig > 0.8 ? this.p.ok : this.p.info, this.p, t('mg.lbl.ultra'));
      }
      for (const m of this.marks) {
        c.strokeStyle = this.p.bad;
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(m.x - 9, m.y - 9);
        c.lineTo(m.x + 9, m.y + 9);
        c.moveTo(m.x + 9, m.y - 9);
        c.lineTo(m.x - 9, m.y + 9);
        c.stroke();
      }
    } else {
      // the hole, with air jetting out
      c.beginPath();
      for (let i = 0; i < 14; i++) {
        const a = (i * TAU) / 14;
        const r = 9 + (i % 2) * 4;
        c.lineTo(this.hole.x + Math.cos(a) * r, this.hole.y + Math.sin(a) * r);
      }
      c.closePath();
      c.fillStyle = '#16191d';
      c.fill();
      if (this.cure < 1 && Math.random() < dt * 40) this.hiss.push({ x: this.hole.x, y: this.hole.y, vx: rand(-40, 40), vy: rand(-90, -30), life: 0.8 });
      for (const s of this.hiss) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= dt;
        c.fillStyle = `rgba(230,240,255,${Math.max(0, s.life) * 0.5})`;
        c.beginPath();
        c.arc(s.x, s.y, 3 + (0.8 - s.life) * 8, 0, TAU);
        c.fill();
      }
      this.hiss = this.hiss.filter((s) => s.life > 0);
      // the patch
      const over = dist(this.patch.x, this.patch.y, this.hole.x, this.hole.y) < 16;
      if (this.dragging && over) {
        this.patch.x = this.hole.x;
        this.patch.y = this.hole.y;
        this.cure += dt / 1.3;
        if (this.cure >= 1) this.finish(this.locateOnly ? 7 : 11);
      } else if (this.cure < 1) this.cure = Math.max(0, this.cure - dt * 0.6);
      c.beginPath();
      c.arc(this.patch.x, this.patch.y, 30, 0, TAU);
      c.fillStyle = '#d8b25a';
      c.fill();
      c.strokeStyle = '#8a6d2a';
      c.lineWidth = 2;
      c.stroke();
      text(c, 'Kapton', this.patch.x, this.patch.y, '#5a4618', 11);
      if (this.cure > 0) {
        c.strokeStyle = this.p.ok;
        c.lineWidth = 5;
        c.beginPath();
        c.arc(this.patch.x, this.patch.y, 38, -Math.PI / 2, -Math.PI / 2 + TAU * this.cure);
        c.stroke();
        text(c, t('mg.lbl.cure'), this.patch.x, this.patch.y - 50, this.p.ok, 12);
      }
    }
    this.status = this.found ? t('mg.lbl.cure') : this.locateOnly ? t('mg.lbl.heat') : `${t('mg.lbl.ultra')} ${Math.round(sig * 100)} %`;
  }

  onDown(x: number, y: number): void {
    if (!this.found) {
      if (dist(x, y, this.hole.x, this.hole.y) < this.hitR) {
        this.found = true;
        this.sfx('good');
        if (this.locateOnly) this.finish(8);
      } else {
        this.marks.push({ x, y, t: this.t });
        this.miss(t('mg.lbl.notHere'));
      }
      return;
    }
    if (dist(x, y, this.patch.x, this.patch.y) < 42) this.dragging = true;
  }

  onMove(x: number, y: number): void {
    if (this.dragging) {
      this.patch.x = x;
      this.patch.y = y;
    }
  }

  onUp(): void {
    this.dragging = false;
  }
}

/* ----------------------------------------------------------------- align */

class Align extends Game {
  private target = { x: rand(150, 490), y: rand(110, 290) };
  private aim = { x: 0, y: 0 };
  private sigma = this.lvl === 1 ? 75 : this.lvl === 2 ? 55 : 42;
  private lock = 0;
  private last: { x: number; y: number } | null = null;
  private stars = range(70).map(() => ({ x: rand(0, W), y: rand(0, H), r: rand(0.4, 1.6) }));

  constructor(spec: MinigameSpec, p: Pal, sfx: (k: Sfx) => void) {
    super(spec, p, sfx);
    const a = rand(0, TAU);
    this.aim = { x: clamp(this.target.x + Math.cos(a) * 230, 60, 580), y: clamp(this.target.y + Math.sin(a) * 160, 60, 340) };
  }

  draw(c: CanvasRenderingContext2D, dt: number): void {
    c.fillStyle = '#05070b';
    c.fillRect(0, 0, W, H);
    for (const s of this.stars) {
      c.fillStyle = 'rgba(255,255,255,0.7)';
      c.fillRect(s.x, s.y, s.r, s.r);
    }
    // arrows on the keyboard
    const sp = 170 * dt;
    if (this.keys.has('ArrowLeft')) this.aim.x -= sp;
    if (this.keys.has('ArrowRight')) this.aim.x += sp;
    if (this.keys.has('ArrowUp')) this.aim.y -= sp;
    if (this.keys.has('ArrowDown')) this.aim.y += sp;
    this.aim.x = clamp(this.aim.x, 30, 610);
    this.aim.y = clamp(this.aim.y, 30, 370);
    const d = dist(this.aim.x, this.aim.y, this.target.x, this.target.y);
    const sig = Math.exp(-(d * d) / (2 * this.sigma * this.sigma));
    if (this.lvl === 1) {
      const g = c.createRadialGradient(this.target.x, this.target.y, 2, this.target.x, this.target.y, 60);
      g.addColorStop(0, 'rgba(91,200,232,0.25)');
      g.addColorStop(1, 'rgba(91,200,232,0)');
      c.fillStyle = g;
      c.fillRect(this.target.x - 60, this.target.y - 60, 120, 120);
    }
    if (sig > 0.9) this.lock += dt;
    else this.lock = Math.max(0, this.lock - dt * 2);
    if (this.lock >= 1.2) {
      this.target = { x: this.aim.x, y: this.aim.y };
      this.finish(7);
    }
    // reticle
    const col = sig > 0.9 ? this.p.ok : sig > 0.5 ? this.p.accent : this.p.info;
    c.strokeStyle = col;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(this.aim.x, this.aim.y, 26, 0, TAU);
    c.moveTo(this.aim.x - 40, this.aim.y);
    c.lineTo(this.aim.x - 12, this.aim.y);
    c.moveTo(this.aim.x + 12, this.aim.y);
    c.lineTo(this.aim.x + 40, this.aim.y);
    c.moveTo(this.aim.x, this.aim.y - 40);
    c.lineTo(this.aim.x, this.aim.y - 12);
    c.moveTo(this.aim.x, this.aim.y + 12);
    c.lineTo(this.aim.x, this.aim.y + 40);
    c.stroke();
    if (this.lock > 0) {
      c.lineWidth = 4;
      c.beginPath();
      c.arc(this.aim.x, this.aim.y, 33, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, this.lock / 1.2));
      c.stroke();
    }
    // the dish at the bottom turning toward the aim
    const ang = Math.atan2(this.aim.y - 390, this.aim.x - 320);
    c.save();
    c.translate(320, 395);
    c.rotate(ang + Math.PI / 2);
    c.fillStyle = '#c9ccd0';
    c.beginPath();
    c.ellipse(0, -22, 34, 12, 0, 0, TAU);
    c.fill();
    c.fillStyle = '#7c838c';
    c.fillRect(-3, -22, 6, 22);
    c.restore();
    const lbl = this.spec.ctx === 'reflector' ? 'mg.lbl.laser' : this.spec.ctx === 'solar' ? 'mg.lbl.sun' : 'mg.lbl.signal';
    // signal bars
    for (let i = 0; i < 8; i++) {
      const on = sig > (i + 0.5) / 8;
      c.fillStyle = on ? col : 'rgba(255,255,255,0.08)';
      c.fillRect(560 + i * 8, 340 - i * 5, 6, 12 + i * 5);
    }
    text(c, t(lbl), 588, 365, this.p.text2, 11);
    this.status = `${t(lbl)} ${Math.round(sig * 100)} %`;
  }

  onDown(x: number, y: number): void {
    this.last = { x, y };
  }

  onMove(x: number, y: number): void {
    if (!this.last || !this.pressed) return;
    this.aim.x += (x - this.last.x) * 0.85;
    this.aim.y += (y - this.last.y) * 0.85;
    this.last = { x, y };
  }

  onUp(): void {
    this.last = null;
  }
}

/* ----------------------------------------------------------------- cells */

class Cells extends Game {
  private rows = [3, 4, 4][this.lvl - 1];
  private cols = [4, 5, 6][this.lvl - 1];
  private state: Array<'ok' | 'broken' | 'new'>;
  private pop: number[];
  private battery = this.spec.ctx === 'battery';
  private cracks: Array<Array<[number, number, number, number]>>;
  private total: number;

  constructor(spec: MinigameSpec, p: Pal, sfx: (k: Sfx) => void) {
    super(spec, p, sfx);
    const n = this.rows * this.cols;
    const broken = new Set(shuffle(range(n)).slice(0, [3, 4, 5][this.lvl - 1]));
    this.state = range(n).map((i) => (broken.has(i) ? 'broken' : 'ok'));
    this.total = broken.size;
    this.pop = new Array<number>(n).fill(0);
    this.cracks = range(n).map(() =>
      range(5).map(() => {
        const a = rand(0, TAU);
        return [0.5, 0.5, 0.5 + Math.cos(a) * rand(0.2, 0.55), 0.5 + Math.sin(a) * rand(0.2, 0.55)] as [number, number, number, number];
      }),
    );
  }

  private rect(i: number): [number, number, number, number] {
    const cw = 480 / this.cols;
    const ch = 270 / this.rows;
    const r = Math.floor(i / this.cols);
    const col = i % this.cols;
    return [80 + col * cw + 4, 66 + r * ch + 4, cw - 8, ch - 8];
  }

  draw(c: CanvasRenderingContext2D, dt: number): void {
    backdrop(c, this.p);
    rrect(c, 70, 56, 500, 290, 8);
    c.fillStyle = this.battery ? '#1f242b' : '#2c3138';
    c.fill();
    for (let i = 0; i < this.state.length; i++) {
      const [x, y, w, hh] = this.rect(i);
      const st = this.state[i];
      this.pop[i] = Math.max(0, this.pop[i] - dt * 2);
      if (this.battery) {
        const cx = x + w / 2;
        const cy = y + hh / 2;
        const r = Math.min(w, hh) * 0.42 * (1 + this.pop[i] * 0.15);
        c.beginPath();
        c.arc(cx, cy, r, 0, TAU);
        c.fillStyle = st === 'broken' ? '#2a1510' : st === 'new' ? '#3f7fbf' : '#35608c';
        c.fill();
        c.strokeStyle = st === 'broken' ? this.p.bad : '#a8b4c0';
        c.lineWidth = 2;
        c.stroke();
        if (st === 'broken') {
          c.fillStyle = 'rgba(255,120,60,0.35)';
          c.beginPath();
          c.arc(cx, cy, r * 0.5, 0, TAU);
          c.fill();
        } else {
          c.beginPath();
          c.arc(cx, cy, r * 0.35, 0, TAU);
          c.fillStyle = '#c8d0d8';
          c.fill();
        }
      } else {
        const g = c.createLinearGradient(x, y, x + w, y + hh);
        if (st === 'broken') {
          g.addColorStop(0, '#0d1420');
          g.addColorStop(1, '#141a24');
        } else {
          g.addColorStop(0, st === 'new' ? '#2c5fa8' : '#1d3f73');
          g.addColorStop(1, st === 'new' ? '#1c3f7a' : '#14305a');
        }
        c.fillStyle = g;
        c.fillRect(x, y, w, hh);
        c.strokeStyle = 'rgba(200,220,255,0.25)';
        c.lineWidth = 1;
        for (let k = 1; k < 4; k++) {
          c.beginPath();
          c.moveTo(x + (w * k) / 4, y);
          c.lineTo(x + (w * k) / 4, y + hh);
          c.stroke();
        }
        if (st === 'broken') {
          c.strokeStyle = 'rgba(220,230,240,0.85)';
          c.lineWidth = 1.5;
          for (const [a, b, cc, d] of this.cracks[i]) {
            c.beginPath();
            c.moveTo(x + w * a, y + hh * b);
            c.lineTo(x + w * cc, y + hh * d);
            c.stroke();
          }
        }
        if (this.pop[i] > 0) {
          c.fillStyle = `rgba(255,255,255,${this.pop[i] * 0.4})`;
          c.fillRect(x, y, w, hh);
        }
      }
    }
    this.status = t('tasks.progress', { done: this.state.filter((s) => s === 'new').length, total: this.total });
  }

  onDown(x: number, y: number): void {
    for (let i = 0; i < this.state.length; i++) {
      const [rx, ry, w, hh] = this.rect(i);
      if (x < rx || y < ry || x > rx + w || y > ry + hh) continue;
      if (this.state[i] === 'broken') {
        this.state[i] = 'new';
        this.pop[i] = 1;
        this.sfx('place');
        if (!this.state.includes('broken')) this.finish(2.5 + 1.6 * this.state.filter((s) => s === 'new').length);
      } else if (this.state[i] === 'ok') this.miss();
      return;
    }
  }
}

/* ---------------------------------------------------------------- reboot */

class Reboot extends Game {
  private lens = [[3, 4], [3, 4, 5], [4, 5, 6]][this.lvl - 1];
  private round = 0;
  private seq: number[] = [];
  private showing = true;
  private showT = -0.4;
  private input: number[] = [];
  private lit = new Array<number>(9).fill(0);
  private cols = [this.p.accent, this.p.info, this.p.ok, this.p.bad, this.p.rad];

  constructor(spec: MinigameSpec, p: Pal, sfx: (k: Sfx) => void) {
    super(spec, p, sfx);
    this.newSeq();
  }

  private newSeq(): void {
    this.seq = range(this.lens[this.round]).map(() => Math.floor(Math.random() * 9));
    this.showing = true;
    this.showT = -0.5;
    this.input = [];
  }

  private pad(i: number): [number, number] {
    return [215 + (i % 3) * 84, 70 + Math.floor(i / 3) * 84];
  }

  draw(c: CanvasRenderingContext2D, dt: number): void {
    backdrop(c, this.p);
    rrect(c, 190, 50, 260, 268, 12);
    c.fillStyle = '#121820';
    c.fill();
    if (this.showing) {
      this.showT += dt;
      const k = Math.floor(this.showT / 0.6);
      if (this.showT >= 0 && k < this.seq.length && this.showT - k * 0.6 < 0.42) this.lit[this.seq[k]] = 1;
      if (this.showT > this.seq.length * 0.6 + 0.2) this.showing = false;
    }
    for (let i = 0; i < 9; i++) {
      const [x, y] = this.pad(i);
      this.lit[i] = Math.max(0, this.lit[i] - dt * 3);
      rrect(c, x, y, 70, 70, 10);
      c.fillStyle = this.lit[i] > 0.05 ? this.cols[i % 5] : '#1e2630';
      c.globalAlpha = this.lit[i] > 0.05 ? 0.35 + 0.65 * this.lit[i] : 1;
      c.fill();
      c.globalAlpha = 1;
      c.strokeStyle = this.p.line;
      c.lineWidth = 2;
      c.stroke();
      symbol(c, i % 5, x + 35, y + 35, 11);
      c.fillStyle = this.lit[i] > 0.05 ? '#0b0e12' : 'rgba(255,255,255,0.18)';
      c.fill();
      text(c, String(i + 1), x + 10, y + 12, 'rgba(255,255,255,0.35)', 10);
    }
    text(c, this.showing ? t('mg.lbl.watch') : t('mg.lbl.repeat'), 320, 345, this.showing ? this.p.info : this.p.accent, 15, 'center', '700');
    for (let r = 0; r < this.lens.length; r++) {
      c.beginPath();
      c.arc(290 + r * 30, 372, 7, 0, TAU);
      c.fillStyle = r < this.round ? this.p.ok : r === this.round ? this.p.accent : 'rgba(255,255,255,0.12)';
      c.fill();
    }
    this.status = `${this.input.length} / ${this.seq.length}`;
  }

  private press(i: number): void {
    if (this.showing || this.over) return;
    this.lit[i] = 1;
    this.input.push(i);
    if (this.seq[this.input.length - 1] !== i) {
      this.miss();
      this.showing = true;
      this.showT = -0.5;
      this.input = [];
      return;
    }
    this.sfx('tick');
    if (this.input.length === this.seq.length) {
      this.round++;
      if (this.round >= this.lens.length) this.finish(this.lens.reduce((a, b) => a + b, 0) * 1.3 + 2);
      else this.newSeq();
    }
  }

  onDown(x: number, y: number): void {
    for (let i = 0; i < 9; i++) {
      const [px, py] = this.pad(i);
      if (x >= px && x <= px + 70 && y >= py && y <= py + 70) this.press(i);
    }
  }

  onKey(code: string): void {
    const m = /^(Digit|Numpad)([1-9])$/.exec(code);
    if (m) this.press(Number(m[2]) - 1);
  }
}

/* ------------------------------------------------------------------ wipe */

class Wipe extends Game {
  private dust = document.createElement('canvas');
  private dc: CanvasRenderingContext2D;
  private grid: boolean[] = [];
  private gx = 28;
  private gy = 15;
  private last: { x: number; y: number } | null = null;
  private filter = this.spec.ctx === 'filter';

  constructor(spec: MinigameSpec, p: Pal, sfx: (k: Sfx) => void) {
    super(spec, p, sfx);
    this.dust.width = W;
    this.dust.height = H;
    this.dc = this.dust.getContext('2d')!;
    const dc = this.dc;
    for (let i = 0; i < 900; i++) {
      const x = rand(60, 580);
      const y = rand(60, 340);
      const r = rand(6, 22);
      const g = dc.createRadialGradient(x, y, 1, x, y, r);
      const col = this.filter ? '150,150,150' : '176,112,62';
      g.addColorStop(0, `rgba(${col},0.55)`);
      g.addColorStop(1, `rgba(${col},0)`);
      dc.fillStyle = g;
      dc.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    if (this.filter) {
      dc.strokeStyle = 'rgba(205,205,205,0.45)';
      dc.lineWidth = 1.2;
      for (let i = 0; i < 160; i++) {
        const x = rand(60, 580);
        const y = rand(60, 340);
        dc.beginPath();
        dc.moveTo(x, y);
        dc.bezierCurveTo(x + rand(-30, 30), y + rand(-30, 30), x + rand(-30, 30), y + rand(-30, 30), x + rand(-40, 40), y + rand(-40, 40));
        dc.stroke();
      }
    }
    this.grid = new Array<boolean>(this.gx * this.gy).fill(false);
  }

  private wipeAt(x: number, y: number): void {
    const r = this.lvl === 1 ? 36 : 28;
    this.dc.globalCompositeOperation = 'destination-out';
    const g = this.dc.createRadialGradient(x, y, r * 0.3, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    this.dc.fillStyle = g;
    this.dc.fillRect(x - r, y - r, 2 * r, 2 * r);
    this.dc.globalCompositeOperation = 'source-over';
    for (let j = 0; j < this.gy; j++) {
      for (let i = 0; i < this.gx; i++) {
        const cx = 60 + ((i + 0.5) * 520) / this.gx;
        const cy = 60 + ((j + 0.5) * 280) / this.gy;
        if (dist(cx, cy, x, y) < r * 0.75) this.grid[j * this.gx + i] = true;
      }
    }
  }

  draw(c: CanvasRenderingContext2D): void {
    backdrop(c, this.p);
    if (this.filter) {
      rrect(c, 50, 50, 540, 300, 8);
      c.fillStyle = '#d9dde2';
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.12)';
      c.lineWidth = 1;
      for (let x = 56; x < 590; x += 7) {
        c.beginPath();
        c.moveTo(x, 50);
        c.lineTo(x, 350);
        c.stroke();
      }
      for (let y = 56; y < 350; y += 7) {
        c.beginPath();
        c.moveTo(50, y);
        c.lineTo(590, y);
        c.stroke();
      }
    } else {
      c.fillStyle = '#1b3a6b';
      c.fillRect(50, 50, 540, 300);
      c.strokeStyle = 'rgba(200,220,255,0.25)';
      for (let x = 50; x <= 590; x += 45) {
        c.beginPath();
        c.moveTo(x, 50);
        c.lineTo(x, 350);
        c.stroke();
      }
      for (let y = 50; y <= 350; y += 50) {
        c.beginPath();
        c.moveTo(50, y);
        c.lineTo(590, y);
        c.stroke();
      }
    }
    c.drawImage(this.dust, 0, 0);
    if (this.pressed) {
      c.strokeStyle = this.p.info;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(this.px, this.py, this.lvl === 1 ? 36 : 28, 0, TAU);
      c.stroke();
    }
    const done = this.grid.filter(Boolean).length / this.grid.length;
    this.status = `${Math.round(done * 100)} %`;
    if (done >= 0.9) this.finish(7);
  }

  onDown(x: number, y: number): void {
    this.last = { x, y };
    this.wipeAt(x, y);
    this.sfx('tick');
  }

  onMove(x: number, y: number): void {
    if (!this.pressed || !this.last) return;
    const d = dist(x, y, this.last.x, this.last.y);
    const steps = Math.max(1, Math.ceil(d / 10));
    for (let i = 1; i <= steps; i++) this.wipeAt(this.last.x + ((x - this.last.x) * i) / steps, this.last.y + ((y - this.last.y) * i) / steps);
    this.last = { x, y };
  }

  onUp(): void {
    this.last = null;
  }
}

/* ----------------------------------------------------------------- plant */

class Plant extends Game {
  private n = [6, 8, 10][this.lvl - 1];
  private filled: boolean[] = new Array<boolean>(this.n).fill(false);
  private dragging = false;
  private phase: 'plant' | 'light' = 'plant';
  private lights = shuffle(['rb', 'green', 'yellow']);
  private glow: string | null = null;

  private slot(i: number): [number, number] {
    const per = Math.ceil(this.n / 2);
    const r = Math.floor(i / per);
    const col = i % per;
    return [250 + ((col + 0.5) * 330) / per, 150 + r * 90];
  }

  private sprout(c: CanvasRenderingContext2D, x: number, y: number, s = 1): void {
    c.strokeStyle = '#4c8a3a';
    c.lineWidth = 3 * s;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x, y - 18 * s);
    c.stroke();
    c.fillStyle = '#6fbf4a';
    c.beginPath();
    c.ellipse(x - 8 * s, y - 20 * s, 9 * s, 4.5 * s, -0.5, 0, TAU);
    c.ellipse(x + 8 * s, y - 20 * s, 9 * s, 4.5 * s, 0.5, 0, TAU);
    c.fill();
  }

  draw(c: CanvasRenderingContext2D): void {
    backdrop(c, this.p);
    if (this.glow) {
      const col = this.glow === 'rb' ? 'rgba(220,60,200,0.18)' : this.glow === 'green' ? 'rgba(80,220,80,0.15)' : 'rgba(240,220,80,0.15)';
      c.fillStyle = col;
      c.fillRect(0, 0, W, H);
    }
    // the seedling pot
    c.fillStyle = '#6b4a2e';
    c.beginPath();
    c.moveTo(60, 200);
    c.lineTo(160, 200);
    c.lineTo(148, 280);
    c.lineTo(72, 280);
    c.closePath();
    c.fill();
    for (let i = 0; i < 5; i++) this.sprout(c, 78 + i * 16, 205, 0.8);
    // the tray
    rrect(c, 230, 105, 370, 180, 10);
    c.fillStyle = '#3a2d22';
    c.fill();
    for (let i = 0; i < this.n; i++) {
      const [x, y] = this.slot(i);
      c.beginPath();
      c.ellipse(x, y + 18, 22, 9, 0, 0, TAU);
      c.fillStyle = '#1d1712';
      c.fill();
      if (this.filled[i]) this.sprout(c, x, y + 18, 1.1);
    }
    if (this.dragging) this.sprout(c, this.px, this.py + 10, 1.1);
    if (this.phase === 'light') {
      text(c, t('mg.lbl.light'), 320, 320, this.p.text, 14, 'center', '700');
      this.lights.forEach((l, i) => {
        const x = 130 + i * 190;
        rrect(c, x, 340, 170, 40, 8);
        c.fillStyle = '#1b222b';
        c.fill();
        c.strokeStyle = l === 'rb' ? '#d64fd0' : l === 'green' ? '#5ccf5c' : '#e8d24a';
        c.lineWidth = 2;
        c.stroke();
        text(c, t(`mg.light.${l}`), x + 85, 360, this.p.text, 13);
      });
    }
    this.status = t('tasks.progress', { done: this.filled.filter(Boolean).length, total: this.n });
  }

  onDown(x: number, y: number): void {
    if (this.phase === 'plant') {
      if (x > 50 && x < 170 && y > 170 && y < 290) {
        this.dragging = true;
        this.sfx('tick');
      }
      return;
    }
    this.lights.forEach((l, i) => {
      const bx = 130 + i * 190;
      if (x >= bx && x <= bx + 170 && y >= 340 && y <= 380) {
        this.glow = l;
        if (l === 'rb') this.finish(this.n * 1.6 + 3);
        else this.miss(t('mg.light.no'));
      }
    });
  }

  onUp(x: number, y: number): void {
    if (!this.dragging) return;
    this.dragging = false;
    let best = -1;
    let bd = 40;
    for (let i = 0; i < this.n; i++) {
      const [sx, sy] = this.slot(i);
      const d = dist(x, y, sx, sy + 10);
      if (!this.filled[i] && d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best >= 0) {
      this.filled[best] = true;
      this.sfx('place');
      if (this.filled.every(Boolean)) this.phase = 'light';
    }
  }
}

/* --------------------------------------------------------------- harvest */

class Harvest extends Game {
  private n = [8, 12, 15][this.lvl - 1];
  private cols = this.lvl === 3 ? 5 : 4;
  private ripe: boolean[];
  private picked: boolean[];
  private ruined: boolean[];
  private crop = String(this.spec.data?.crop ?? 'lettuce');
  private basket = 0;

  constructor(spec: MinigameSpec, p: Pal, sfx: (k: Sfx) => void) {
    super(spec, p, sfx);
    const k = Math.max(3, Math.round(this.n * 0.6));
    const ripe = new Set(shuffle(range(this.n)).slice(0, k));
    this.ripe = range(this.n).map((i) => ripe.has(i));
    this.picked = new Array<boolean>(this.n).fill(false);
    this.ruined = new Array<boolean>(this.n).fill(false);
  }

  private pos(i: number): [number, number] {
    const rows = Math.ceil(this.n / this.cols);
    return [110 + ((i % this.cols) + 0.5) * (430 / this.cols), 70 + (Math.floor(i / this.cols) + 0.5) * (270 / rows)];
  }

  private plantAt(c: CanvasRenderingContext2D, x: number, y: number, ripe: boolean, wilted: boolean): void {
    const s = ripe ? 1.15 : 0.7;
    const leaf = wilted ? '#6b5a3a' : ripe ? '#3f8f3a' : '#9fd27a';
    c.fillStyle = leaf;
    for (let k = 0; k < 6; k++) {
      const a = (k * TAU) / 6 + 0.3;
      c.beginPath();
      c.ellipse(x + Math.cos(a) * 14 * s, y + Math.sin(a) * 9 * s, 13 * s, 6 * s, a, 0, TAU);
      c.fill();
    }
    if (!ripe || wilted) return;
    // the part you pick
    const fruit: Record<string, string> = { tomato: '#d8402e', radish: '#c8335a', potato: '#b58a52', wheat: '#e2c35a', lettuce: '#7fd65a' };
    c.fillStyle = fruit[this.crop] ?? '#7fd65a';
    if (this.crop === 'lettuce') {
      c.beginPath();
      c.arc(x, y, 16, 0, TAU);
      c.fill();
      c.strokeStyle = '#4f9a3a';
      c.lineWidth = 2;
      c.stroke();
    } else if (this.crop === 'wheat') {
      for (let k = -1; k <= 1; k++) {
        c.beginPath();
        c.ellipse(x + k * 9, y - 6, 4, 13, k * 0.2, 0, TAU);
        c.fill();
      }
    } else {
      for (const [dx, dy] of [
        [-9, -4],
        [8, -6],
        [0, 8],
      ]) {
        c.beginPath();
        c.arc(x + dx, y + dy, 8, 0, TAU);
        c.fill();
      }
    }
    // a small star so ripeness does not depend on colour alone
    symbol(c, 4, x + 20, y - 18, 6);
    c.fillStyle = '#fff3c4';
    c.fill();
  }

  draw(c: CanvasRenderingContext2D): void {
    backdrop(c, this.p);
    c.fillStyle = 'rgba(214,79,208,0.08)';
    c.fillRect(0, 0, W, H);
    rrect(c, 90, 50, 470, 300, 10);
    c.fillStyle = '#2e2419';
    c.fill();
    for (let i = 0; i < this.n; i++) {
      if (this.picked[i]) continue;
      const [x, y] = this.pos(i);
      this.plantAt(c, x, y, this.ripe[i], this.ruined[i]);
    }
    // the basket
    rrect(c, 572, 300, 56, 46, 8);
    c.fillStyle = '#8a6a3a';
    c.fill();
    text(c, String(this.basket), 600, 323, '#fff', 15, 'center', '700');
    const total = this.ripe.filter(Boolean).length;
    this.status = t('tasks.progress', { done: this.basket, total });
  }

  onDown(x: number, y: number): void {
    for (let i = 0; i < this.n; i++) {
      const [px, py] = this.pos(i);
      if (this.picked[i] || dist(x, y, px, py) > 28) continue;
      if (this.ripe[i]) {
        this.picked[i] = true;
        this.basket++;
        this.sfx('place');
        if (this.basket === this.ripe.filter(Boolean).length) this.finish(this.basket * 1.1 + 2);
      } else if (!this.ruined[i]) {
        this.ruined[i] = true;
        this.miss();
      }
      return;
    }
  }
}

/* ----------------------------------------------------------------- level */

class Level extends Game {
  private a = rand(-1, 1);
  private b = rand(-1, 1);
  private hold = 0;
  private dragging: 'a' | 'b' | null = null;

  constructor(spec: MinigameSpec, p: Pal, sfx: (k: Sfx) => void) {
    super(spec, p, sfx);
    if (Math.abs(this.a) < 0.4) this.a += Math.sign(this.a || 1) * 0.5;
    if (Math.abs(this.b) < 0.4) this.b += Math.sign(this.b || 1) * 0.5;
  }

  /** Each leg screw tilts the base along its own direction: they interact, as on a real tripod. */
  private bubble(): [number, number] {
    return [(this.a * 0.9 - this.b * 0.35) * 110, (this.a * 0.3 + this.b * 0.85) * 110];
  }

  draw(c: CanvasRenderingContext2D, dt: number): void {
    backdrop(c, this.p);
    const sp = 0.9 * dt;
    if (this.keys.has('ArrowLeft')) this.a -= sp;
    if (this.keys.has('ArrowRight')) this.a += sp;
    if (this.keys.has('ArrowUp')) this.b -= sp;
    if (this.keys.has('ArrowDown')) this.b += sp;
    this.a = clamp(this.a, -1.3, 1.3);
    this.b = clamp(this.b, -1.3, 1.3);
    let [bx, by] = this.bubble();
    const r = Math.hypot(bx, by);
    if (r > 120) {
      bx *= 120 / r;
      by *= 120 / r;
    }
    // the vial
    const cx = 320;
    const cy = 170;
    const g = c.createRadialGradient(cx, cy, 10, cx, cy, 145);
    g.addColorStop(0, '#d9f0c8');
    g.addColorStop(1, '#8fb07a');
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, 145, 0, TAU);
    c.fill();
    c.strokeStyle = '#3d5a2e';
    c.lineWidth = 2;
    for (const rr of [22, 60, 100]) {
      c.beginPath();
      c.arc(cx, cy, rr, 0, TAU);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(cx - 145, cy);
    c.lineTo(cx + 145, cy);
    c.moveTo(cx, cy - 145);
    c.lineTo(cx, cy + 145);
    c.stroke();
    c.beginPath();
    c.arc(cx + bx, cy + by, 20, 0, TAU);
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.25)';
    c.stroke();
    const tol = this.lvl === 1 ? 24 : this.lvl === 2 ? 17 : 12;
    if (Math.hypot(bx, by) < tol) this.hold += dt;
    else this.hold = 0;
    if (this.hold > 0) {
      c.strokeStyle = this.p.ok;
      c.lineWidth = 5;
      c.beginPath();
      c.arc(cx, cy, 152, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, this.hold / 1.1));
      c.stroke();
    }
    if (this.hold >= 1.1) this.finish(9);
    // the two screws as sliders
    for (const [k, x, v] of [
      ['a', 120, this.a],
      ['b', 520, this.b],
    ] as const) {
      c.fillStyle = 'rgba(255,255,255,0.06)';
      rrect(c, x - 70, 340, 140, 26, 13);
      c.fill();
      const kx = x + (v / 1.3) * 60;
      c.beginPath();
      c.arc(kx, 353, 15, 0, TAU);
      c.fillStyle = this.dragging === k ? this.p.accent : '#9aa3ad';
      c.fill();
      text(c, t(k === 'a' ? 'mg.lbl.screwA' : 'mg.lbl.screwB'), x, 322, this.p.text2, 12);
    }
    this.status = `${Math.round(Math.hypot(bx, by))} px`;
  }

  onDown(x: number, y: number): void {
    if (y > 320) this.dragging = x < W / 2 ? 'a' : 'b';
    this.onMove(x);
  }

  onMove(x: number): void {
    if (!this.dragging || !this.pressed) return;
    const base = this.dragging === 'a' ? 120 : 520;
    const v = clamp(((x - base) / 60) * 1.3, -1.3, 1.3);
    if (this.dragging === 'a') this.a = v;
    else this.b = v;
  }

  onUp(): void {
    this.dragging = null;
  }
}

/* ------------------------------------------------------------ extinguish */

class Extinguish extends Game {
  private flames = range([3, 4, 5][this.lvl - 1]).map((i, _, all) => ({ x: 110 + ((i + 0.5) * 420) / all.length + rand(-30, 30), y: rand(240, 320), s: rand(0.7, 1) }));
  private spray: Array<{ x: number; y: number; vx: number; vy: number; life: number }> = [];

  draw(c: CanvasRenderingContext2D, dt: number): void {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2a2622');
    g.addColorStop(1, '#16120f');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    // smoke under the ceiling
    const sm = this.flames.reduce((a, f) => a + f.s, 0) / this.flames.length || 0;
    c.fillStyle = `rgba(60,58,55,${0.25 + 0.4 * sm})`;
    c.fillRect(0, 0, W, 110);
    c.fillStyle = '#3a3530';
    c.fillRect(0, 330, W, 70);
    const firing = this.pressed || this.keys.has('Space');
    for (const f of this.flames) {
      if (f.s <= 0) continue;
      f.s = Math.min(1.4, f.s + 0.05 * dt);
      if (firing && dist(this.px, this.py, f.x, f.y + 6) < 52) {
        f.s -= 1.05 * dt;
        if (f.s <= 0) this.sfx('tick');
      }
      const s = Math.max(0, f.s);
      // glow on the walls, then the flame from its dark outer layer to its bright core
      const glow = c.createRadialGradient(f.x, f.y - 20, 4, f.x, f.y - 20, 90 + 50 * s);
      glow.addColorStop(0, `rgba(255,150,60,${0.25 * s})`);
      glow.addColorStop(1, 'rgba(255,150,60,0)');
      c.fillStyle = glow;
      c.fillRect(f.x - 150, f.y - 170, 300, 260);
      for (let k = 0; k < 4; k++) {
        const flick = 0.88 + 0.12 * Math.sin(this.t * (11 + k * 3) + f.x * 0.1 + k);
        const hgt = (42 + 55 * s) * (1 - k * 0.2) * flick;
        const wid = (17 + 15 * s) * (1 - k * 0.2);
        const sway = Math.sin(this.t * 4 + f.x) * 6 * (1 - k * 0.2);
        c.fillStyle = ['#b8321a', '#ef5f24', '#ffa53a', '#ffe08a'][k];
        c.beginPath();
        c.moveTo(f.x - wid, f.y);
        c.bezierCurveTo(f.x - wid * 1.15, f.y - hgt * 0.45, f.x - wid * 0.3, f.y - hgt * 0.72, f.x + sway, f.y - hgt);
        c.bezierCurveTo(f.x + wid * 0.3, f.y - hgt * 0.72, f.x + wid * 1.15, f.y - hgt * 0.45, f.x + wid, f.y);
        c.quadraticCurveTo(f.x, f.y + wid * 0.45, f.x - wid, f.y);
        c.closePath();
        c.fill();
      }
    }
    if (firing) {
      for (let i = 0; i < 6; i++) {
        const a = Math.atan2(this.py - 390, this.px - 320) + rand(-0.12, 0.12);
        const v = rand(380, 520);
        this.spray.push({ x: 320, y: 390, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: dist(320, 390, this.px, this.py) / v });
      }
    }
    for (const s of this.spray) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      c.fillStyle = 'rgba(235,240,245,0.55)';
      c.beginPath();
      c.arc(s.x, s.y, 4, 0, TAU);
      c.fill();
    }
    this.spray = this.spray.filter((s) => s.life > 0);
    // the extinguisher's nozzle
    c.fillStyle = '#c0392b';
    rrect(c, 300, 370, 40, 40, 6);
    c.fill();
    const left = this.flames.filter((f) => f.s > 0).length;
    this.status = t('tasks.progress', { done: this.flames.length - left, total: this.flames.length });
    if (left === 0) this.finish(4 + this.flames.length * 1.6);
  }
}

/* ----------------------------------------------------------------- drill */

class Drill extends Game {
  private needle = 0.1;
  private progress = 0;
  private heat = 0;
  private phase = rand(0, TAU);
  private width = [0.26, 0.19, 0.14][this.lvl - 1];
  private dur = [5, 6, 7][this.lvl - 1];

  draw(c: CanvasRenderingContext2D, dt: number): void {
    backdrop(c, this.p);
    const centre = 0.5 + 0.25 * Math.sin(this.t * (0.6 + 0.2 * this.lvl) + this.phase);
    const pressing = this.pressed || this.keys.has('Space');
    this.needle = clamp(this.needle + (pressing ? 0.6 : -0.5) * dt, 0, 1);
    const inBand = Math.abs(this.needle - centre) < this.width / 2;
    const above = this.needle > centre + this.width / 2;
    if (inBand) this.progress += dt / this.dur;
    this.heat = clamp(this.heat + (above ? 0.5 : -0.25) * dt, 0, 1);
    if (this.heat >= 1) {
      this.miss();
      this.heat = 0.4;
      this.progress = Math.max(0, this.progress - 0.15);
    }
    // gauge
    const gx = 90;
    const gy = 50;
    const gh = 300;
    rrect(c, gx, gy, 40, gh, 6);
    c.fillStyle = '#121820';
    c.fill();
    c.fillStyle = 'rgba(123,216,143,0.35)';
    c.fillRect(gx + 2, gy + gh * (1 - centre - this.width / 2), 36, gh * this.width);
    c.fillStyle = inBand ? this.p.ok : above ? this.p.bad : this.p.info;
    c.fillRect(gx - 8, gy + gh * (1 - this.needle) - 3, 56, 6);
    text(c, t('mg.lbl.pressure'), gx + 20, gy - 14, this.p.text2, 11);
    bar(c, 170, 50, 22, 300, this.heat, this.heat > 0.7 ? this.p.bad : this.p.accent, this.p, t('mg.lbl.heat'));
    // the ground in section, and the drill going down
    const lx = 260;
    const lw = 330;
    const layers = ['#6b6660', '#5a554f', '#4a4540', '#3c3833'];
    layers.forEach((col, i) => {
      c.fillStyle = col;
      c.fillRect(lx, 120 + i * 60, lw, 60);
    });
    c.fillStyle = '#20252b';
    c.fillRect(lx, 50, lw, 70);
    const depth = 120 + 230 * clamp(this.progress, 0, 1);
    c.fillStyle = '#9aa3ad';
    c.fillRect(lx + lw / 2 - 6, 40, 12, depth - 40);
    c.beginPath();
    c.moveTo(lx + lw / 2 - 10, depth);
    c.lineTo(lx + lw / 2 + 10, depth);
    c.lineTo(lx + lw / 2, depth + 18);
    c.closePath();
    c.fillStyle = this.heat > 0.7 ? '#ff7a4a' : '#c8cdd2';
    c.fill();
    if (inBand && pressing) {
      for (let i = 0; i < 3; i++) {
        c.fillStyle = 'rgba(180,170,160,0.6)';
        c.beginPath();
        c.arc(lx + lw / 2 + rand(-30, 30), 118 + rand(-6, 0), rand(2, 4), 0, TAU);
        c.fill();
      }
    }
    text(c, `${t('mg.lbl.depth')} ${Math.round(clamp(this.progress, 0, 1) * 100)} %`, lx + lw / 2, 375, this.p.text2, 12);
    this.status = `${t('mg.lbl.depth')} ${Math.round(clamp(this.progress, 0, 1) * 100)} %`;
    if (this.progress >= 1) this.finish(this.dur * 1.5);
  }
}

/* ---------------------------------------------------------------- valves */

class Valves extends Game {
  private n = [5, 7, 9][this.lvl - 1];
  private pts: Array<{ x: number; y: number; open: number }> = [];
  private next = 1;
  private battery = this.spec.ctx === 'battery';

  constructor(spec: MinigameSpec, p: Pal, sfx: (k: Sfx) => void) {
    super(spec, p, sfx);
    for (let tries = 0; this.pts.length < this.n && tries < 2000; tries++) {
      const q = { x: rand(80, 560), y: rand(80, 330), open: 0 };
      if (this.pts.every((o) => dist(o.x, o.y, q.x, q.y) > 82)) this.pts.push(q);
    }
    while (this.pts.length < this.n) this.pts.push({ x: 80 + this.pts.length * 50, y: 200, open: 0 });
  }

  draw(c: CanvasRenderingContext2D, dt: number): void {
    backdrop(c, this.p);
    // pipes between them
    c.strokeStyle = '#3a424c';
    c.lineWidth = 8;
    c.beginPath();
    this.pts.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
    c.stroke();
    this.pts.forEach((q, i) => {
      const done = i + 1 < this.next;
      q.open += ((done ? 1 : 0) - q.open) * Math.min(1, dt * 8);
      if (this.battery) {
        rrect(c, q.x - 22, q.y - 30, 44, 60, 6);
        c.fillStyle = done ? '#2f6b46' : '#2a313a';
        c.fill();
        c.strokeStyle = done ? this.p.ok : '#9aa3ad';
        c.lineWidth = 2;
        c.stroke();
        c.fillStyle = '#9aa3ad';
        c.fillRect(q.x - 8, q.y - 36, 16, 6);
      } else {
        c.save();
        c.translate(q.x, q.y);
        c.rotate(q.open * Math.PI);
        c.strokeStyle = done ? this.p.ok : '#c0392b';
        c.lineWidth = 6;
        c.beginPath();
        c.arc(0, 0, 24, 0, TAU);
        c.moveTo(-24, 0);
        c.lineTo(24, 0);
        c.moveTo(0, -24);
        c.lineTo(0, 24);
        c.stroke();
        c.restore();
      }
      text(c, String(i + 1), q.x, q.y, done ? this.p.ok : this.p.text, 16, 'center', '700');
    });
    this.status = t('tasks.progress', { done: this.next - 1, total: this.n });
  }

  onDown(x: number, y: number): void {
    const i = this.pts.findIndex((q) => dist(x, y, q.x, q.y) < 32);
    if (i < 0) return;
    if (i + 1 === this.next) {
      this.next++;
      this.sfx('tick');
      if (this.next > this.n) this.finish(this.n * 1.2 + 1);
    } else if (i + 1 > this.next) {
      this.miss();
      // the procedure starts again from the top, as in a real purge (not for the youngest)
      if (this.lvl >= 2) this.next = 1;
    }
  }
}

/* ------------------------------------------------------------ microscope */

/** How each mineral looks under the microscope: grain colour, shape and background. */
const MINERAL_LOOK: Record<string, { bg: string; grains: string[]; shape: 'lath' | 'round' | 'angular' | 'bead' | 'layer' | 'vein' | 'crystal' | 'sphere' }> = {
  anorthosite: { bg: '#bfc3c8', grains: ['#f2f2ee', '#e2e4e6', '#d8dadd'], shape: 'lath' },
  breccia: { bg: '#2c2b2a', grains: ['#9a9590', '#d8d6d2', '#5a5652', '#b8b2aa'], shape: 'angular' },
  glass: { bg: '#2a1c12', grains: ['#f08a2a', '#e6762a', '#ffae4a'], shape: 'bead' },
  basalt: { bg: '#3d3f42', grains: ['#9aa0a6', '#1e2022', '#6a6e72'], shape: 'lath' },
  iceReg: { bg: '#55585c', grains: ['#ffffff', '#dff4ff', '#8a8d90'], shape: 'crystal' },
  impactMelt: { bg: '#2a2624', grains: ['#0d0c0b', '#4a4440'], shape: 'round' },
  agglutinate: { bg: '#4a3a2a', grains: ['#7a5a3a', '#2a1e14', '#a08060'], shape: 'round' },
  boulder: { bg: '#6a6864', grains: ['#8c8a86', '#55534f', '#a8a6a2'], shape: 'angular' },
  hematite: { bg: '#8a5a3a', grains: ['#4a5560', '#5a6570', '#3a444e'], shape: 'sphere' },
  carbonate: { bg: '#c8b89a', grains: ['#f0e6d0', '#e2d4b4'], shape: 'crystal' },
  sulfate: { bg: '#a8563a', grains: ['#ffffff', '#f4efe6'], shape: 'vein' },
  mudstone: { bg: '#9a5a3e', grains: ['#b06a4a', '#8a4a32', '#c47e5a'], shape: 'layer' },
  olivine: { bg: '#2e2a20', grains: ['#8aa040', '#a8b84a', '#6a7a30'], shape: 'round' },
  clay: { bg: '#8a4a32', grains: ['#9a5a40', '#7a3e28'], shape: 'layer' },
  meteorite: { bg: '#6e7277', grains: ['#c8ccd0', '#9aa0a6'], shape: 'vein' },
  freshEjecta: { bg: '#8a8884', grains: ['#d8d6d2', '#b8b6b2', '#6a6864'], shape: 'angular' },
  deltaRock: { bg: '#a87a52', grains: ['#c89a6a', '#8a603e', '#d8b080'], shape: 'layer' },
  perchlorate: { bg: '#b0603e', grains: ['#ffffff', '#e8f0f8'], shape: 'crystal' },
};
export const MINERALS_OF: Record<'moon' | 'mars', string[]> = {
  moon: ['anorthosite', 'breccia', 'glass', 'basalt', 'iceReg', 'impactMelt', 'agglutinate'],
  mars: ['hematite', 'carbonate', 'sulfate', 'mudstone', 'olivine', 'clay', 'deltaRock', 'perchlorate'],
};

class Microscope extends Game {
  private mineral: string;
  private options: string[];
  private img = document.createElement('canvas');
  private focus = Math.random() < 0.5 ? rand(0, 0.2) : rand(0.8, 1);
  private target = rand(0.35, 0.65);
  private sharpT = 0;
  private choosing = false;
  private dragX: number | null = null;

  constructor(spec: MinigameSpec, p: Pal, sfx: (k: Sfx) => void) {
    super(spec, p, sfx);
    const world = spec.data?.world === 'mars' ? 'mars' : 'moon';
    const list = MINERALS_OF[world];
    const want = String(spec.data?.mineral ?? '');
    this.mineral = MINERAL_LOOK[want] ? want : list[Math.floor(Math.random() * list.length)];
    const others = shuffle(list.filter((m) => m !== this.mineral)).slice(0, 2);
    this.options = shuffle([this.mineral, ...others]);
    this.img.width = 300;
    this.img.height = 300;
    const c = this.img.getContext('2d')!;
    const look = MINERAL_LOOK[this.mineral];
    c.fillStyle = look.bg;
    c.fillRect(0, 0, 300, 300);
    if (look.shape === 'layer') {
      for (let y = 0; y < 300; y += rand(6, 16)) {
        c.fillStyle = look.grains[Math.floor(Math.random() * look.grains.length)];
        c.fillRect(0, y, 300, rand(3, 10));
      }
    }
    for (let i = 0; i < (look.shape === 'layer' ? 60 : 140); i++) {
      const x = rand(0, 300);
      const y = rand(0, 300);
      c.fillStyle = look.grains[Math.floor(Math.random() * look.grains.length)];
      c.strokeStyle = 'rgba(0,0,0,0.3)';
      c.beginPath();
      switch (look.shape) {
        case 'lath':
          c.save();
          c.translate(x, y);
          c.rotate(rand(0, Math.PI));
          c.rect(-rand(8, 16), -3, rand(16, 32), 6);
          c.restore();
          break;
        case 'angular':
          for (let k = 0; k < 5; k++) c.lineTo(x + rand(-14, 14), y + rand(-14, 14));
          break;
        case 'bead':
          c.arc(x, y, rand(5, 11), 0, TAU);
          break;
        case 'sphere':
          c.arc(x, y, rand(6, 10), 0, TAU);
          break;
        case 'crystal':
          c.moveTo(x, y - 7);
          c.lineTo(x + 5, y);
          c.lineTo(x, y + 7);
          c.lineTo(x - 5, y);
          break;
        case 'vein':
          c.moveTo(x - 30, y);
          c.lineTo(x + 30, y + rand(-20, 20));
          c.lineWidth = rand(2, 5);
          c.strokeStyle = look.grains[0];
          c.stroke();
          continue;
        default:
          c.arc(x, y, rand(3, 9), 0, TAU);
      }
      c.closePath();
      c.fill();
      c.stroke();
    }
  }

  draw(c: CanvasRenderingContext2D, dt: number): void {
    backdrop(c, this.p);
    const sp = 0.35 * dt;
    if (this.keys.has('ArrowLeft')) this.focus -= sp;
    if (this.keys.has('ArrowRight')) this.focus += sp;
    this.focus = clamp(this.focus, 0, 1);
    const off = Math.abs(this.focus - this.target);
    const blur = Math.min(14, off * 40);
    // the eyepiece
    c.save();
    c.beginPath();
    c.arc(200, 190, 140, 0, TAU);
    c.clip();
    c.filter = `blur(${blur.toFixed(1)}px)`;
    c.drawImage(this.img, 60, 50, 280, 280);
    c.filter = 'none';
    c.restore();
    c.strokeStyle = '#1a1e24';
    c.lineWidth = 14;
    c.beginPath();
    c.arc(200, 190, 146, 0, TAU);
    c.stroke();
    // focus wheel
    rrect(c, 60, 352, 280, 26, 13);
    c.fillStyle = 'rgba(255,255,255,0.06)';
    c.fill();
    c.beginPath();
    c.arc(60 + this.focus * 280, 365, 15, 0, TAU);
    c.fillStyle = off < 0.05 ? this.p.ok : '#9aa3ad';
    c.fill();
    text(c, t('mg.lbl.focus'), 200, 340, this.p.text2, 12);
    if (off < 0.05) this.sharpT += dt;
    else this.sharpT = 0;
    if (this.sharpT > 0.5) this.choosing = true;
    if (this.choosing) {
      text(c, t('mg.lbl.which'), 490, 80, this.p.text, 14, 'center', '700');
      this.options.forEach((m, i) => {
        rrect(c, 380, 105 + i * 70, 220, 56, 8);
        c.fillStyle = '#1b222b';
        c.fill();
        c.strokeStyle = this.p.line;
        c.lineWidth = 2;
        c.stroke();
        wrapText(c, t(`min.${m}`), 490, 133 + i * 70, 200, this.p.text, 13, 15);
      });
    }
    this.status = this.choosing ? t('mg.lbl.which') : `${t('mg.lbl.focus')} ${Math.round((1 - Math.min(1, off * 3)) * 100)} %`;
  }

  onDown(x: number, y: number): void {
    if (y > 340 && x < 360) this.dragX = x;
    this.onMove(x);
    if (!this.choosing) return;
    this.options.forEach((m, i) => {
      if (x >= 380 && x <= 600 && y >= 105 + i * 70 && y <= 161 + i * 70) {
        if (m === this.mineral) this.finish(9);
        else this.miss(t('mg.lbl.wrong'));
      }
    });
  }

  onMove(x: number): void {
    if (this.dragX === null || !this.pressed) return;
    this.focus = clamp((x - 60) / 280, 0, 1);
  }

  onUp(): void {
    this.dragX = null;
  }
}

/* -------------------------------------------------------------- first aid */

class FirstAid extends Game {
  private kind = String(this.spec.data?.injury ?? 'bruise');
  private cards = shuffle(['1', '2', '3', 'x1', 'x2']);
  private step = 1;
  private done = new Set<string>();
  private shake: Record<string, number> = {};

  private rect(i: number): [number, number, number, number] {
    const row = i < 3 ? 0 : 1;
    const col = row === 0 ? i : i - 3;
    const n = row === 0 ? 3 : 2;
    const w = 180;
    const x = 320 - (n * w + (n - 1) * 16) / 2 + col * (w + 16);
    return [x, 120 + row * 110, w, 92];
  }

  draw(c: CanvasRenderingContext2D, dt: number): void {
    backdrop(c, this.p);
    text(c, t('mg.fa.who', { name: String(this.spec.data?.name ?? ''), what: t(`injury.${this.kind}`) }), 320, 70, this.p.text, 15, 'center', '700');
    this.cards.forEach((k, i) => {
      const [x0, y, w, hh] = this.rect(i);
      this.shake[k] = Math.max(0, (this.shake[k] ?? 0) - dt);
      const x = x0 + Math.sin(this.t * 60) * 6 * (this.shake[k] ?? 0);
      rrect(c, x, y, w, hh, 10);
      const ok = this.done.has(k);
      c.fillStyle = ok ? 'rgba(123,216,143,0.15)' : '#1b222b';
      c.fill();
      c.strokeStyle = ok ? this.p.ok : this.p.line;
      c.lineWidth = 2;
      c.stroke();
      if (ok) text(c, k, x + 16, y + 16, this.p.ok, 13, 'center', '700');
      wrapText(c, t(`mg.fa.${this.kind}.${k}`), x + w / 2, y + hh / 2, w - 24, this.p.text, 12, 15);
    });
    this.status = t('tasks.progress', { done: this.step - 1, total: 3 });
  }

  onDown(x: number, y: number): void {
    this.cards.forEach((k, i) => {
      const [rx, ry, w, hh] = this.rect(i);
      if (x < rx || x > rx + w || y < ry || y > ry + hh || this.done.has(k)) return;
      if (k === String(this.step)) {
        this.done.add(k);
        this.step++;
        this.sfx('place');
        if (this.step > 3) this.finish(12);
      } else {
        this.shake[k] = 0.4;
        this.miss(t('mg.fa.wrong'));
      }
    });
  }
}

/* -------------------------------------------------------------- download */

class Download extends Game {
  private sig = { x: 320, y: 200, vx: 60, vy: -40 };
  private progress = 0;
  private dur = [5, 6, 7][this.lvl - 1];
  private ret = { x: 320, y: 200 };

  draw(c: CanvasRenderingContext2D, dt: number): void {
    c.fillStyle = '#04110c';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(80,220,140,0.12)';
    c.lineWidth = 1;
    for (let r = 50; r < 400; r += 50) {
      c.beginPath();
      c.arc(320, 200, r, 0, TAU);
      c.stroke();
    }
    // the signal wanders
    const k = 70 + 25 * this.lvl;
    this.sig.vx += rand(-1, 1) * k * dt * 4;
    this.sig.vy += rand(-1, 1) * k * dt * 4;
    const sp = Math.hypot(this.sig.vx, this.sig.vy);
    if (sp > k) {
      this.sig.vx *= k / sp;
      this.sig.vy *= k / sp;
    }
    this.sig.x += this.sig.vx * dt;
    this.sig.y += this.sig.vy * dt;
    if (this.sig.x < 60 || this.sig.x > 580) this.sig.vx *= -1;
    if (this.sig.y < 60 || this.sig.y > 340) this.sig.vy *= -1;
    this.sig.x = clamp(this.sig.x, 60, 580);
    this.sig.y = clamp(this.sig.y, 60, 340);
    const ks = 220 * dt;
    if (this.keys.has('ArrowLeft')) this.ret.x -= ks;
    if (this.keys.has('ArrowRight')) this.ret.x += ks;
    if (this.keys.has('ArrowUp')) this.ret.y -= ks;
    if (this.keys.has('ArrowDown')) this.ret.y += ks;
    this.ret.x = clamp(this.ret.x, 20, 620);
    this.ret.y = clamp(this.ret.y, 20, 380);
    const g = c.createRadialGradient(this.sig.x, this.sig.y, 1, this.sig.x, this.sig.y, 26);
    g.addColorStop(0, 'rgba(140,255,190,1)');
    g.addColorStop(1, 'rgba(140,255,190,0)');
    c.fillStyle = g;
    c.fillRect(this.sig.x - 26, this.sig.y - 26, 52, 52);
    const on = dist(this.ret.x, this.ret.y, this.sig.x, this.sig.y) < (this.lvl === 1 ? 40 : 32);
    if (on) this.progress += dt / this.dur;
    c.strokeStyle = on ? this.p.ok : this.p.info;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(this.ret.x, this.ret.y, 32, 0, TAU);
    c.stroke();
    bar(c, 170, 366, 300, 14, this.progress, this.p.ok, this.p, t('mg.lbl.data'));
    this.status = `${t('mg.lbl.data')} ${Math.round(clamp(this.progress, 0, 1) * 100)} %`;
    if (this.progress >= 1) this.finish(this.dur * 1.5);
  }

  onDown(x: number, y: number): void {
    this.ret = { x, y };
  }

  onMove(x: number, y: number): void {
    if (this.pressed || matchMedia('(hover: hover)').matches) this.ret = { x, y };
  }
}

/* ----------------------------------------------------------------- panel */

function makeGame(spec: MinigameSpec, p: Pal, sfx: (k: Sfx) => void): Game {
  switch (spec.id) {
    case 'wires':
      return new Wires(spec, p, sfx);
    case 'bolts':
      return new Bolts(spec, p, sfx);
    case 'patch':
    case 'locate':
      return new Patch(spec, p, sfx);
    case 'align':
      return new Align(spec, p, sfx);
    case 'cells':
      return new Cells(spec, p, sfx);
    case 'reboot':
      return new Reboot(spec, p, sfx);
    case 'wipe':
      return new Wipe(spec, p, sfx);
    case 'plant':
      return new Plant(spec, p, sfx);
    case 'harvest':
      return new Harvest(spec, p, sfx);
    case 'level':
      return new Level(spec, p, sfx);
    case 'extinguish':
      return new Extinguish(spec, p, sfx);
    case 'drill':
      return new Drill(spec, p, sfx);
    case 'valves':
      return new Valves(spec, p, sfx);
    case 'microscope':
      return new Microscope(spec, p, sfx);
    case 'firstaid':
      return new FirstAid(spec, p, sfx);
    default:
      return new Download(spec, p, sfx);
  }
}

/** The fact shown under a minigame: by context when there is one, else by game. */
function factKey(spec: MinigameSpec): string {
  const byCtx = spec.ctx ? `mg.fact.${spec.ctx}` : '';
  return byCtx && has(byCtx) ? byCtx : `mg.fact.${spec.id}`;
}

/**
 * Build the minigame panel. `onEnd` gets the quality (0..1), or null if the player gave up.
 * The panel runs its own animation loop until it ends.
 */
export function minigamePanel(spec: MinigameSpec, sfx: (k: Sfx) => void, onEnd: (quality: number | null) => void): HTMLElement {
  const p = palette();
  const game = makeGame(spec, p, sfx);
  const canvas = h('canvas.mg-canvas', { width: W, height: H }) as HTMLCanvasElement;
  const c = canvas.getContext('2d')!;
  const status = h('span.mg-status', '');
  const result = h('div.mg-result.hidden');
  let ended = false;
  let raf = 0;
  let last = performance.now();
  let resultT = -1;

  const end = (q: number | null): void => {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    onEnd(q);
  };

  const toLocal = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (game.over) return;
    canvas.setPointerCapture(e.pointerId);
    const [x, y] = toLocal(e);
    game.px = x;
    game.py = y;
    game.pressed = true;
    game.onDown(x, y);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = toLocal(e);
    game.px = x;
    game.py = y;
    if (!game.over) game.onMove(x, y);
  });
  const release = (e: PointerEvent): void => {
    const [x, y] = toLocal(e);
    game.pressed = false;
    if (!game.over) game.onUp(x, y);
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('wheel', (e) => {
    // the microscope's focus wheel
    if (spec.id === 'microscope') {
      game.keys.add(e.deltaY > 0 ? 'ArrowRight' : 'ArrowLeft');
      window.setTimeout(() => game.keys.clear(), 120);
      e.preventDefault();
    }
  });

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      end(null);
      return;
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    e.stopPropagation();
    if (!game.keys.has(e.code)) game.onKey(e.code);
    game.keys.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    game.keys.delete(e.code);
    e.stopPropagation();
  };
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);

  const frame = (): void => {
    if (ended) return;
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // keep the backing store sharp at the panel's size
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.round(canvas.clientWidth * dpr);
    if (cw > 0 && canvas.width !== cw) {
      canvas.width = cw;
      canvas.height = Math.round((cw * H) / W);
    }
    const k = canvas.width / W;
    c.setTransform(k, 0, 0, k, 0, 0);
    if (!game.over) game.t += dt;
    game.flash = Math.max(0, game.flash - dt);
    game.msgT = Math.max(0, game.msgT - dt);
    game.draw(c, game.over ? 0 : dt);
    if (game.flash > 0) {
      c.fillStyle = `rgba(255,80,60,${game.flash * 0.5})`;
      c.fillRect(0, 0, W, H);
    }
    if (game.msgT > 0 && game.msg) {
      c.fillStyle = 'rgba(8,10,14,0.85)';
      rrect(c, 70, 14, 500, 44, 8);
      c.fill();
      wrapText(c, game.msg, 320, 36, 470, '#fff', 12, 15);
    }
    if (status.textContent !== game.status) status.textContent = game.status;
    if (game.over && resultT < 0) {
      resultT = 0;
      const good = game.quality >= 0.75;
      result.className = `mg-result ${good ? 'good' : 'ok'}`;
      result.replaceChildren(icon(good ? 'check' : 'info', 30), h('b', t(good ? 'mg.good' : 'mg.ok')), h('span', t('mg.quality', { pct: Math.round(game.quality * 100) })));
    }
    if (resultT >= 0) {
      resultT += dt;
      if (resultT > 1.4) end(game.quality);
    }
  };
  raf = requestAnimationFrame(frame);

  return h(
    'div.screen.modal.mgmodal',
    h(
      'div.sheet.panel.mg',
      h(
        'div.sheet-head',
        h('div.grow', h('h2', spec.title), h('p', t(`mg.${spec.id}.i`))),
        h('button.iconbtn', { onclick: () => end(null), title: t('mg.cancel') }, icon('close', 20)),
      ),
      h('div.mg-stage', canvas, result),
      h('div.mg-foot', h('div.mg-fact', h('b', t('mg.real')), ' ', t(factKey(spec))), h('div.mg-side', status, h('span.mg-keys', t('mg.keys')))),
    ),
  );
}
