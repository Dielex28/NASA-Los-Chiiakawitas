import * as THREE from 'three';
import { Rng } from '../core/rng';
import { patchWorldMaterial, type WorldUniforms } from '../render/shading';
import { surfacePatch, type SurfaceSpec } from '../render/surface';
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
  t.anisotropy = 16;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Painted panel skin: seams, fasteners, faint streaking. Returns colour + bump textures. */
function hullTextures(seed: number): { map: THREE.Texture; normal: THREE.Texture } {
  const S = 512;
  const K = 2; // drawn at twice the layout size
  const [c, g] = canvas(S * K);
  const [cb, gb] = canvas(S * K);
  g.scale(K, K);
  gb.scale(K, K);
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
  return { map: tex(c, true), normal: normalFromHeight(cb, 1.1) };
}

function solarTexture(): THREE.Texture {
  const S = 256;
  const [c, g] = canvas(S * 4);
  g.scale(4, 4);
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

/** Convert a greyscale height canvas into a tangent-space normal map (Sobel filter, wraps at the edges). */
function normalFromHeight(src: HTMLCanvasElement, strength: number, repeat = 1): THREE.CanvasTexture {
  const S = src.width;
  const g = src.getContext('2d')!;
  const h = g.getImageData(0, 0, S, S).data;
  const [c, o] = canvas(S);
  const img = o.createImageData(S, S);
  const at = (x: number, y: number): number => h[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) * strength;
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const k = (y * S + x) * 4;
      img.data[k] = (-dx * inv * 0.5 + 0.5) * 255;
      img.data[k + 1] = (dy * inv * 0.5 + 0.5) * 255;
      img.data[k + 2] = (inv * 0.5 + 0.5) * 255;
      img.data[k + 3] = 255;
    }
  }
  o.putImageData(img, 0, 0);
  return tex(c, false, repeat);
}

/** Height field of a plain-weave fabric (the outer layer of a pressure suit is woven cloth). */
function weaveHeight(): HTMLCanvasElement {
  const S = 256;
  const [c, g] = canvas(S);
  const img = g.createImageData(S, S);
  const n = 16; // threads across the tile
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x / S) * n;
      const v = (y / S) * n;
      const over = (Math.floor(u) + Math.floor(v)) % 2 === 0;
      const warp = Math.abs(Math.sin(u * Math.PI));
      const weft = Math.abs(Math.sin(v * Math.PI));
      const hgt = over ? 0.35 + 0.65 * warp * (0.6 + 0.4 * weft) : 0.25 + 0.5 * weft * (0.6 + 0.4 * warp);
      const q = Math.floor(hgt * 255);
      const k = (y * S + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = q;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** A small printed placard or display: lines of text on a flat colour. */
export function labelTexture(lines: Array<{ text: string; size: number; color?: string; weight?: number }>, bg: string, w = 256, h = 128, border?: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  if (border) {
    g.strokeStyle = border;
    g.lineWidth = 4;
    g.strokeRect(4, 4, w - 8, h - 8);
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const total = lines.reduce((a, l) => a + l.size * 1.25, 0);
  let y = (h - total) / 2;
  for (const l of lines) {
    g.fillStyle = l.color ?? '#111';
    g.font = `${l.weight ?? 700} ${l.size}px "B612", "Segoe UI", sans-serif`;
    y += l.size * 0.625;
    g.fillText(l.text, w / 2, y);
    y += l.size * 0.625;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
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
  /** Suit fabric stained with the local dust, for boots and lower legs. */
  readonly suitDust: THREE.MeshStandardMaterial;
  /** Painted composite hard-shell: upper torso, helmet housing, backpack. */
  readonly shell: THREE.MeshPhysicalMaterial;
  readonly visor: THREE.MeshPhysicalMaterial;
  readonly glove: THREE.MeshStandardMaterial;
  /** Anodised bearing rings at wrists, neck and waist. */
  readonly ring: THREE.MeshStandardMaterial;
  private solarMap: THREE.Texture;
  /** Materials that reflect the environment, with their relative strength. */
  private reflective: Array<[THREE.MeshStandardMaterial, number]> = [];
  private envTexture: THREE.Texture | null = null;

  constructor(
    readonly world: WorldId,
    readonly uniforms: WorldUniforms,
  ) {
    const u = uniforms;
    const ht = hullTextures(11);
    // `env` is how strongly the material mirrors its surroundings (image-based lighting)
    const std = (p: THREE.MeshStandardMaterialParameters, env = 0.4, surf?: SurfaceSpec): THREE.MeshStandardMaterial => {
      const m = patchWorldMaterial(new THREE.MeshStandardMaterial(p), u, surf ? surfacePatch(surf) : undefined);
      this.reflective.push([m, env]);
      return m;
    };
    const phys = (p: THREE.MeshPhysicalMaterialParameters, env: number, surf?: SurfaceSpec): THREE.MeshPhysicalMaterial => {
      const m = patchWorldMaterial(new THREE.MeshPhysicalMaterial(p), u, surf ? surfacePatch(surf) : undefined);
      this.reflective.push([m, env]);
      return m;
    };
    // detail layers: what each kind of surface looks like from a hand's breadth away
    const PAINT: SurfaceSpec = { kind: 'paint', scale: 1.7, normal: 0.55, rough: 0.55, albedo: 0.9 };
    const METAL: SurfaceSpec = { kind: 'metal', scale: 2.6, normal: 0.5, rough: 0.7, albedo: 0.6 };
    const FOIL: SurfaceSpec = { kind: 'foil', scale: 2.3, normal: 1.0, rough: 0.6, albedo: 0 };
    const RUBBER: SurfaceSpec = { kind: 'rubber', scale: 6.5, normal: 0.7, rough: 0, albedo: 0.8 };
    const CLOTH: SurfaceSpec = { kind: 'cloth', scale: 1.4, normal: 0, rough: 0, albedo: 1 };
    const SOIL: SurfaceSpec = { kind: 'ground', scale: 0.8, normal: 1.0, rough: 0, albedo: 0.9 };
    this.hull = std({ color: 0xe6e5e1, map: ht.map, normalMap: ht.normal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.5, metalness: 0.08 }, 0.5, PAINT);
    this.hullDark = std({ color: 0x3d4148, map: ht.map, normalMap: ht.normal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.6, metalness: 0.3 }, 0.6, PAINT);
    this.hullDouble = std({ color: 0xdddbd6, roughness: 0.45, metalness: 0.2, side: THREE.DoubleSide }, 0.6, PAINT);
    this.metal = std({ color: 0xc9ccd2, roughness: 0.3, metalness: 1.0 }, 1.0, METAL);
    this.darkMetal = std({ color: 0x2a2c31, roughness: 0.42, metalness: 0.9 }, 0.9, METAL);
    this.foil = std({ color: 0xe0a53c, roughness: 0.24, metalness: 1.0 }, 1.25, FOIL);
    this.solarMap = solarTexture();
    this.solar = std({ color: 0xffffff, map: this.solarMap, roughness: 0.16, metalness: 0.6 }, 1.0);
    this.glass = std({ color: 0xbfe6ff, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }, 1.5);
    this.accent = std({ color: 0xe8552b, roughness: 0.5, metalness: 0.1 }, 0.4, PAINT);
    this.hazard = std({ color: 0xffffff, map: stripeTexture('#e9b21a', '#1d1d1f'), roughness: 0.6, metalness: 0.1 }, 0.3);
    this.rubber = std({ color: 0x15161a, roughness: 0.9, metalness: 0.0 }, 0.15, RUBBER);
    this.blue = std({ color: 0x2f7fd6, roughness: 0.45, metalness: 0.2 }, 0.5, PAINT);
    this.green = std({ color: 0x3fae6a, roughness: 0.45, metalness: 0.2 }, 0.5, PAINT);
    this.regolith = std({ color: world === 'moon' ? 0x8f8c87 : 0xa8603a, roughness: 1, metalness: 0 }, 0, SOIL);
    this.window = std({ color: 0x1a1d22, roughness: 0.12, metalness: 0.5, emissive: 0xffc98a, emissiveIntensity: 0.6 }, 0.9);
    this.lamp = std({ color: 0x222222, roughness: 0.4, emissive: 0xdfeaff, emissiveIntensity: 0 }, 0.3);
    this.ledOn = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 2.6, 1.1) });
    this.ledOff = std({ color: 0x1b2220, roughness: 0.5 }, 0.3);
    this.holo = new THREE.MeshBasicMaterial({ color: 0x48d8ff, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.holoBad = new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.cable = std({ color: 0x1a1b1f, roughness: 0.8, metalness: 0.2 }, 0.2, RUBBER);

    // ---- pressure suit
    const weave = weaveHeight();
    const fabricN = normalFromHeight(weave, 2.2, 5);
    const dust = world === 'moon' ? new THREE.Color(0x8d8b87) : new THREE.Color(0xb9764a);
    this.suit = std({ color: 0xd9d7d1, roughness: 0.86, metalness: 0, normalMap: fabricN, normalScale: new THREE.Vector2(0.55, 0.55) }, 0.2, CLOTH);
    this.suitDust = std(
      { color: new THREE.Color(0xd9d7d1).lerp(dust, 0.6), roughness: 0.95, metalness: 0, normalMap: fabricN, normalScale: new THREE.Vector2(0.5, 0.5) },
      0.1,
      CLOTH,
    );
    this.shell = phys({ color: 0xdfdeda, roughness: 0.32, metalness: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.25 }, 0.7, PAINT);
    // gold-coated sun visor: a thin layer of gold reflects infrared and glare, and mirrors the landscape
    this.visor = phys({ color: 0xd9a441, roughness: 0.05, metalness: 1.0, clearcoat: 1, clearcoatRoughness: 0.03 }, 1.9);
    this.glove = std({ color: 0x4a4e55, roughness: 0.72, metalness: 0.05, normalMap: fabricN, normalScale: new THREE.Vector2(0.3, 0.3) }, 0.2, RUBBER);
    this.ring = std({ color: 0x9aa3ad, roughness: 0.3, metalness: 1.0 }, 1.0, METAL);
  }

  /** Hand the pre-filtered sky/ground map to every reflective material. */
  setEnvironment(texture: THREE.Texture | null): void {
    if (texture === this.envTexture) return;
    const first = this.envTexture === null;
    this.envTexture = texture;
    for (const [m, k] of this.reflective) {
      m.envMap = k > 0 ? texture : null;
      m.envMapIntensity = k;
      if (first) m.needsUpdate = true;
    }
  }

  /** A solar-cell material instance whose colour can be dulled by dust independently of other arrays. */
  solarInstance(): THREE.MeshStandardMaterial {
    const m = patchWorldMaterial(
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: this.solarMap, roughness: 0.16, metalness: 0.6 }),
      this.uniforms,
    );
    m.envMap = this.envTexture;
    m.envMapIntensity = 1;
    this.reflective.push([m, 1]);
    return m;
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
