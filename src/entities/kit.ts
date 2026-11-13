import * as THREE from 'three';
import { Rng } from '../core/rng';
import { patchWorldMaterial, type WorldUniforms } from '../render/shading';
import type { WorldId } from '../sim/types';

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, srgb: boolean, repeat = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Painted panel skin: seams, fasteners, faint streaking. Returns colour + bump textures. */
function hullTextures(seed: number): { map: THREE.Texture; bump: THREE.Texture } {
  const S = 512;
  const [c, g] = canvas(S);
  const [cb, gb] = canvas(S);
  const rng = new Rng(seed);
  g.fillStyle = '#e8e5de';
  g.fillRect(0, 0, S, S);
  gb.fillStyle = '#808080';
  gb.fillRect(0, 0, S, S);
  const cell = S / 4;
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      const tone = 228 + Math.floor(rng.range(-10, 12));
      g.fillStyle = `rgb(${tone},${tone - 2},${tone - 8})`;
      g.fillRect(i * cell + 2, j * cell + 2, cell - 4, cell - 4);
      // fasteners in the corners
      for (const [fx, fy] of [
        [10, 10],
        [cell - 10, 10],
        [10, cell - 10],
        [cell - 10, cell - 10],
      ]) {
        g.fillStyle = 'rgba(120,118,112,0.9)';
        g.beginPath();
        g.arc(i * cell + fx, j * cell + fy, 2.2, 0, Math.PI * 2);
        g.fill();
        gb.fillStyle = '#b0b0b0';
        gb.beginPath();
        gb.arc(i * cell + fx, j * cell + fy, 2.6, 0, Math.PI * 2);
        gb.fill();
      }
    }
  }
  g.strokeStyle = 'rgba(105,102,96,0.9)';
  g.lineWidth = 2;
  gb.strokeStyle = '#303030';
  gb.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    for (const ctx of [g, gb]) {
      ctx.beginPath();
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, S);
      ctx.moveTo(0, i * cell);
      ctx.lineTo(S, i * cell);
      ctx.stroke();
    }
  }
  // vertical streaks of dust and handling marks
  for (let k = 0; k < 90; k++) {
    const x = rng.range(0, S);
    const y = rng.range(0, S);
    const len = rng.range(20, 120);
    const grad = g.createLinearGradient(x, y, x, y + len);
    grad.addColorStop(0, 'rgba(90,84,74,0.10)');
    grad.addColorStop(1, 'rgba(90,84,74,0)');
    g.fillStyle = grad;
    g.fillRect(x, y, rng.range(1, 5), len);
  }
  return { map: tex(c, true), bump: tex(cb, false) };
}

function solarTexture(): THREE.Texture {
  const S = 256;
  const [c, g] = canvas(S);
  g.fillStyle = '#b8bcc4';
  g.fillRect(0, 0, S, S);
  const n = 8;
  const cell = S / n;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const b = 70 + ((i * 7 + j * 13) % 5) * 6;
      const grad = g.createLinearGradient(i * cell, j * cell, (i + 1) * cell, (j + 1) * cell);
      grad.addColorStop(0, `rgb(14,24,${b})`);
      grad.addColorStop(1, `rgb(8,14,${b - 28})`);
      g.fillStyle = grad;
      g.fillRect(i * cell + 1.5, j * cell + 1.5, cell - 3, cell - 3);
      g.strokeStyle = 'rgba(150,170,210,0.22)';
      g.lineWidth = 0.6;
      for (let k = 1; k < 4; k++) {
        g.beginPath();
        g.moveTo(i * cell + (k * cell) / 4, j * cell + 2);
        g.lineTo(i * cell + (k * cell) / 4, (j + 1) * cell - 2);
        g.stroke();
      }
    }
  }
  return tex(c, true);
}

function foilBump(seed: number): THREE.Texture {
  const S = 128;
  const [c, g] = canvas(S);
  const rng = new Rng(seed);
  const img = g.createImageData(S, S);
  // crinkled multilayer insulation: coarse random facets
  const grid = 12;
  const lat: number[] = [];
  for (let i = 0; i < grid * grid; i++) lat.push(rng.next());
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const fx = (x / S) * grid;
      const fy = (y / S) * grid;
      const x0 = Math.floor(fx) % grid;
      const y0 = Math.floor(fy) % grid;
      const x1 = (x0 + 1) % grid;
      const y1 = (y0 + 1) % grid;
      const u = fx - Math.floor(fx);
      const v = fy - Math.floor(fy);
      const val = (lat[y0 * grid + x0] * (1 - u) + lat[y0 * grid + x1] * u) * (1 - v) + (lat[y1 * grid + x0] * (1 - u) + lat[y1 * grid + x1] * u) * v;
      const q = Math.floor(val * 255);
      const k = (y * S + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = q;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c, false, 2);
}

function stripeTexture(a: string, b: string): THREE.Texture {
  const S = 64;
  const [c, g] = canvas(S);
  g.fillStyle = a;
  g.fillRect(0, 0, S, S);
  g.fillStyle = b;
  for (let i = -S; i < S * 2; i += 32) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 16, 0);
    g.lineTo(i + 16 - S, S);
    g.lineTo(i - S, S);
    g.fill();
  }
  return tex(c, true, 4);
}

/**
 * Shared materials and geometry helpers for every built object. All lit
 * materials are patched to receive terrain shadows, and a handful of emissive
 * ones (windows, lamps) are driven globally by how dark it is outside.
 */
export class Kit {
  readonly hull: THREE.MeshStandardMaterial;
  readonly hullDark: THREE.MeshStandardMaterial;
  readonly hullDouble: THREE.MeshStandardMaterial;
  readonly metal: THREE.MeshStandardMaterial;
  readonly darkMetal: THREE.MeshStandardMaterial;
  readonly foil: THREE.MeshStandardMaterial;
  readonly solar: THREE.MeshStandardMaterial;
  readonly glass: THREE.MeshStandardMaterial;
  readonly accent: THREE.MeshStandardMaterial;
  readonly hazard: THREE.MeshStandardMaterial;
  readonly rubber: THREE.MeshStandardMaterial;
  readonly blue: THREE.MeshStandardMaterial;
  readonly green: THREE.MeshStandardMaterial;
  readonly regolith: THREE.MeshStandardMaterial;
  readonly window: THREE.MeshStandardMaterial;
  readonly lamp: THREE.MeshStandardMaterial;
  readonly ledOn: THREE.MeshBasicMaterial;
  readonly ledOff: THREE.MeshStandardMaterial;
  readonly holo: THREE.MeshBasicMaterial;
  readonly holoBad: THREE.MeshBasicMaterial;
  readonly cable: THREE.MeshStandardMaterial;
  readonly suit: THREE.MeshStandardMaterial;
  readonly visor: THREE.MeshStandardMaterial;
  private solarMap: THREE.Texture;

  constructor(
    readonly world: WorldId,
    readonly uniforms: WorldUniforms,
  ) {
    const u = uniforms;
    const ht = hullTextures(11);
    const std = (p: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial => patchWorldMaterial(new THREE.MeshStandardMaterial(p), u);
    this.hull = std({ color: 0xffffff, map: ht.map, bumpMap: ht.bump, bumpScale: 0.6, roughness: 0.58, metalness: 0.08 });
    this.hullDark = std({ color: 0x3d4148, map: ht.map, bumpMap: ht.bump, bumpScale: 0.6, roughness: 0.66, metalness: 0.25 });
    this.hullDouble = std({ color: 0xf4f2ee, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide });
    this.metal = std({ color: 0xc9ccd2, roughness: 0.34, metalness: 0.92 });
    this.darkMetal = std({ color: 0x2a2c31, roughness: 0.48, metalness: 0.85 });
    this.foil = std({ color: 0xd9a03a, roughness: 0.34, metalness: 1.0, bumpMap: foilBump(5), bumpScale: 2.2 });
    this.solarMap = solarTexture();
    this.solar = std({ color: 0xffffff, map: this.solarMap, roughness: 0.22, metalness: 0.55 });
    this.glass = std({ color: 0xbfe6ff, roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide });
    this.accent = std({ color: 0xe8552b, roughness: 0.55, metalness: 0.1 });
    this.hazard = std({ color: 0xffffff, map: stripeTexture('#e9b21a', '#1d1d1f'), roughness: 0.6, metalness: 0.1 });
    this.rubber = std({ color: 0x15161a, roughness: 0.9, metalness: 0.0 });
    this.blue = std({ color: 0x2f7fd6, roughness: 0.5, metalness: 0.15 });
    this.green = std({ color: 0x3fae6a, roughness: 0.5, metalness: 0.15 });
    this.regolith = std({
      color: world === 'moon' ? 0x55534f : 0x8a4a28,
      roughness: 1,
      metalness: 0,
    });
    this.window = std({ color: 0x1a1d22, roughness: 0.2, metalness: 0.4, emissive: 0xffc98a, emissiveIntensity: 0.6 });
    this.lamp = std({ color: 0x222222, roughness: 0.4, emissive: 0xdfeaff, emissiveIntensity: 0 });
    this.ledOn = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 2.6, 1.1) });
    this.ledOff = std({ color: 0x1b2220, roughness: 0.5 });
    this.holo = new THREE.MeshBasicMaterial({ color: 0x48d8ff, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.holoBad = new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.cable = std({ color: 0x1a1b1f, roughness: 0.8, metalness: 0.2 });
    this.suit = std({ color: 0xf2f0ea, roughness: 0.75, metalness: 0.02 });
    this.visor = std({ color: 0xc8922a, roughness: 0.12, metalness: 1.0 });
  }

  /** A solar-cell material instance whose colour can be dulled by dust independently of other arrays. */
  solarInstance(): THREE.MeshStandardMaterial {
    return patchWorldMaterial(
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: this.solarMap, roughness: 0.22, metalness: 0.55 }),
      this.uniforms,
    );
  }

  /** Windows and lamps glow more as it gets darker outside. */
  setDarkness(d: number): void {
    this.window.emissiveIntensity = 0.5 + 2.4 * d;
    this.lamp.emissiveIntensity = 6 * Math.max(0, d - 0.25) / 0.75;
  }

  /* ---------------------------------------------------------- geometry */

  box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return m;
  }

  /** Cylinder along Y. */
  cyl(rTop: number, rBot: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 20, open = false): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open), mat);
    m.position.set(x, y, z);
    return m;
  }

  sphere(r: number, mat: THREE.Material, x = 0, y = 0, z = 0, ws = 20, hs = 14): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat);
    m.position.set(x, y, z);
    return m;
  }

  /** Capsule along Y (total length = len + 2r). */
  capsule(r: number, len: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 16), mat);
    m.position.set(x, y, z);
    return m;
  }

  torus(R: number, r: number, mat: THREE.Material, x = 0, y = 0, z = 0, arc = Math.PI * 2, seg = 28): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.TorusGeometry(R, r, 8, seg, arc), mat);
    m.position.set(x, y, z);
    return m;
  }

  /** Thin strut between two points. */
  strut(a: THREE.Vector3Like, b: THREE.Vector3Like, r: number, mat: THREE.Material, seg = 8): THREE.Mesh {
    const va = new THREE.Vector3(a.x, a.y, a.z);
    const vb = new THREE.Vector3(b.x, b.y, b.z);
    const len = va.distanceTo(vb);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
    m.position.copy(va).add(vb).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.sub(va).normalize());
    return m;
  }

  /** Parabolic dish opening toward +Y. */
  dish(radius: number, depth: number, mat: THREE.Material): THREE.Mesh {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 10; i++) {
      const r = (i / 10) * radius;
      pts.push(new THREE.Vector2(r, depth * (r / radius) ** 2));
    }
    const geo = new THREE.LatheGeometry(pts, 28);
    return new THREE.Mesh(geo, mat);
  }
}
