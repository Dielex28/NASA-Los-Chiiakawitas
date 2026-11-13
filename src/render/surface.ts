import * as THREE from 'three';
import { Rng } from '../core/rng';

/**
 * Procedural surface detail. Every texture here is computed, not painted: a height field is
 * built from noise and stamped features (pebbles, pits, scratches, creases), then turned into
 * one RGBA map — RG tangent-space normal · B roughness (0.5 neutral) · A albedo (1 neutral).
 * The maps tile, carry mipmaps and are projected on three axes in the shader, so they need no
 * UV unwrapping and keep the same texel density on every part, whatever its size.
 */

let surfaceSize = 512;
/** Resolution of the generated detail maps (pixels per side). */
export function setSurfaceQuality(size: number): void {
  surfaceSize = size;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** One octave of tileable value noise with independent periods on each axis. */
function layer(size: number, rng: Rng, px: number, py: number, out: Float32Array, amp: number): void {
  const lat = new Float32Array(px * py);
  for (let i = 0; i < lat.length; i++) lat[i] = rng.next();
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * py;
    const y0 = Math.floor(fy);
    const ty = smooth(fy - y0);
    const ya = (y0 % py) * px;
    const yb = ((y0 + 1) % py) * px;
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * px;
      const x0 = Math.floor(fx);
      const tx = smooth(fx - x0);
      const xa = x0 % px;
      const xb = (x0 + 1) % px;
      const top = lat[ya + xa] + (lat[ya + xb] - lat[ya + xa]) * tx;
      const bot = lat[yb + xa] + (lat[yb + xb] - lat[yb + xa]) * tx;
      out[y * size + x] += amp * (top + (bot - top) * ty);
    }
  }
}

/** Sum of octaves, normalised to 0..1. Each octave: [periodX, periodY, amplitude]. */
function fbm(size: number, rng: Rng, octaves: Array<[number, number, number]>): Float32Array {
  const out = new Float32Array(size * size);
  let total = 0;
  for (const [px, py, amp] of octaves) {
    layer(size, rng, Math.min(px, size), Math.min(py, size), out, amp);
    total += amp;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** Add a radial feature around (cx, cy), wrapping at the tile edges. `f(d)` gets the distance in radii. */
function stamp(size: number, cx: number, cy: number, radius: number, reach: number, f: (d: number, i: number) => void): void {
  const R = Math.ceil(radius * reach);
  for (let j = -R; j <= R; j++) {
    for (let i = -R; i <= R; i++) {
      const d = Math.hypot(i, j) / radius;
      if (d > reach) continue;
      const x = (((Math.round(cx) + i) % size) + size) % size;
      const y = (((Math.round(cy) + j) % size) + size) % size;
      f(d, y * size + x);
    }
  }
}

/**
 * Pack a height field (in tile units) with optional roughness and albedo layers into one map.
 * Slopes are taken with central differences that wrap, so the normal map tiles as the height does.
 */
function pack(size: number, height: Float32Array, rough: Float32Array | null, albedo: Float32Array | null): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    const yu = ((y + 1) % size) * size;
    const yd = ((y - 1 + size) % size) * size;
    for (let x = 0; x < size; x++) {
      const xr = (x + 1) % size;
      const xl = (x - 1 + size) % size;
      const sx = (height[y * size + xr] - height[y * size + xl]) * half;
      const sy = (height[yu + x] - height[yd + x]) * half;
      const inv = 1 / Math.hypot(sx, sy, 1);
      const k = (y * size + x) * 4;
      data[k] = Math.max(0, Math.min(255, (-sx * inv * 0.5 + 0.5) * 255));
      data[k + 1] = Math.max(0, Math.min(255, (-sy * inv * 0.5 + 0.5) * 255));
      data[k + 2] = rough ? Math.max(0, Math.min(255, rough[y * size + x] * 255)) : 128;
      data[k + 3] = albedo ? Math.max(0, Math.min(255, albedo[y * size + x] * 255)) : 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  return tex;
}

export type SurfaceKind = 'ground' | 'paint' | 'metal' | 'foil' | 'rubber' | 'cloth';

/** Regolith at arm's length: grain, pebbles and clods, and the small pits left by micrometeorites and dripping dust. */
function ground(size: number, rng: Rng): THREE.DataTexture {
  const S = size;
  const grain = fbm(S, rng, [
    [8, 8, 0.5],
    [16, 16, 0.5],
    [32, 32, 0.42],
    [64, 64, 0.34],
    [128, 128, 0.26],
    [256, 256, 0.2],
  ]);
  const h = new Float32Array(S * S);
  const alb = new Float32Array(S * S);
  for (let i = 0; i < h.length; i++) {
    h[i] = grain[i] * 0.011;
    alb[i] = 0.84 + 0.16 * grain[i];
  }
  const scale = S / 1024;
  // pits first, so pebbles can sit in them
  for (let k = 0; k < 34; k++) {
    const r = rng.range(9, 42) * scale;
    const depth = (r / S) * rng.range(0.28, 0.5);
    stamp(S, rng.range(0, S), rng.range(0, S), r, 1.6, (d, i) => {
      const bowl = d < 1 ? -depth * (1 - d * d) * (1 - d * d) : 0;
      const rim = depth * 0.3 * Math.exp(-(((d - 1) / 0.28) ** 2));
      h[i] += bowl + rim;
      if (d < 1) alb[i] *= 1 - 0.16 * (1 - d);
    });
  }
  for (let k = 0; k < 230; k++) {
    const r = rng.range(2.5, k < 26 ? 26 : 11) * scale;
    const tall = (r / S) * rng.range(0.5, 0.95);
    const tone = rng.range(0.78, 1.12);
    stamp(S, rng.range(0, S), rng.range(0, S), r, 1, (d, i) => {
      h[i] += tall * Math.sqrt(Math.max(0, 1 - d * d));
      alb[i] = Math.min(1, alb[i] * (1 + (tone - 1) * (1 - d * d)));
    });
  }
  return pack(S, h, null, alb);
}

/** Painted panels: orange-peel texture of sprayed paint, handling scratches, chips and smudges of dust. */
function paint(size: number, rng: Rng): THREE.DataTexture {
  const S = size;
  const peel = fbm(S, rng, [
    [64, 64, 0.5],
    [128, 128, 0.4],
    [256, 256, 0.3],
  ]);
  const smudge = fbm(S, rng, [
    [3, 3, 0.5],
    [6, 6, 0.35],
    [12, 12, 0.25],
    [24, 24, 0.15],
  ]);
  const h = new Float32Array(S * S);
  const rough = new Float32Array(S * S);
  const alb = new Float32Array(S * S);
  for (let i = 0; i < h.length; i++) {
    h[i] = peel[i] * 0.0011;
    rough[i] = 0.5 + 0.5 * (smudge[i] - 0.5);
    alb[i] = 1 - 0.16 * Math.max(0, smudge[i] - 0.42) * 1.7;
  }
  // scratches: thin, straight, mostly along one direction (things get dragged the same way)
  for (let k = 0; k < 70; k++) {
    let x = rng.range(0, S);
    let y = rng.range(0, S);
    const a = (rng.next() < 0.7 ? rng.range(-0.25, 0.25) : rng.range(0, Math.PI)) + 0.6;
    const len = rng.range(0.03, 0.3) * S;
    const deep = rng.range(0.0006, 0.0016);
    for (let t = 0; t < len; t++) {
      const i = ((((Math.round(y) % S) + S) % S) * S + (((Math.round(x) % S) + S) % S)) | 0;
      h[i] -= deep;
      rough[i] = Math.min(1, rough[i] + 0.25);
      x += Math.cos(a);
      y += Math.sin(a);
    }
  }
  // chips and micrometeorite pocks
  for (let k = 0; k < 160; k++) {
    const r = rng.range(1, 2.6) * (S / 512);
    stamp(S, rng.range(0, S), rng.range(0, S), r, 1, (d, i) => {
      h[i] -= 0.0012 * (1 - d);
      alb[i] *= 0.9;
    });
  }
  return pack(S, h, rough, alb);
}

/** Machined or brushed metal: fine parallel tool marks, with fingerprints of dust in the roughness. */
function metal(size: number, rng: Rng): THREE.DataTexture {
  const S = size;
  const brush = fbm(S, rng, [
    [S / 2, 3, 0.5],
    [S / 2, 7, 0.3],
    [S / 4, 2, 0.4],
    [S, 16, 0.25],
  ]);
  const smudge = fbm(S, rng, [
    [4, 4, 0.5],
    [9, 9, 0.3],
    [18, 18, 0.2],
  ]);
  const h = new Float32Array(S * S);
  const rough = new Float32Array(S * S);
  const alb = new Float32Array(S * S);
  for (let i = 0; i < h.length; i++) {
    h[i] = brush[i] * 0.0009;
    rough[i] = 0.5 + 0.35 * (brush[i] - 0.5) + 0.45 * (smudge[i] - 0.5);
    alb[i] = 0.93 + 0.07 * brush[i];
  }
  return pack(S, h, rough, alb);
}

/** Multi-layer insulation: metallised film that is never flat — a field of creases and facets. */
function foil(size: number, rng: Rng): THREE.DataTexture {
  const S = size;
  const h = new Float32Array(S * S);
  const rough = new Float32Array(S * S);
  let weight = 0.5;
  for (const p of [5, 9, 17, 31]) {
    const n = fbm(S, rng, [[p, p, 1]]);
    // a crease is where the film folds: sharp ridge lines between smooth facets
    for (let i = 0; i < h.length; i++) {
      const ridge = 1 - Math.abs(2 * n[i] - 1);
      h[i] += weight * ridge * ridge;
    }
    weight *= 0.6;
  }
  const tone = fbm(S, rng, [
    [6, 6, 0.5],
    [13, 13, 0.4],
  ]);
  for (let i = 0; i < h.length; i++) {
    h[i] *= 0.02;
    rough[i] = 0.42 + 0.3 * tone[i];
  }
  return pack(S, h, rough, null);
}

/** Moulded rubber and cable jacket: a fine pebbled grain. */
function rubber(size: number, rng: Rng): THREE.DataTexture {
  const S = size;
  const grain = fbm(S, rng, [
    [128, 128, 0.5],
    [256, 256, 0.5],
    [48, 48, 0.3],
  ]);
  const h = new Float32Array(S * S);
  const alb = new Float32Array(S * S);
  for (let i = 0; i < h.length; i++) {
    h[i] = grain[i] * 0.0016;
    alb[i] = 0.88 + 0.12 * grain[i];
  }
  return pack(S, h, null, alb);
}

/** Woven fabric that has been worn outside: patchy grey-brown staining, no relief of its own. */
function cloth(size: number, rng: Rng): THREE.DataTexture {
  const S = size;
  const stain = fbm(S, rng, [
    [3, 3, 0.5],
    [7, 7, 0.4],
    [15, 15, 0.3],
    [40, 40, 0.2],
  ]);
  const h = new Float32Array(S * S);
  const alb = new Float32Array(S * S);
  for (let i = 0; i < h.length; i++) alb[i] = 1 - 0.34 * Math.max(0, stain[i] - 0.35);
  return pack(S, h, null, alb);
}

const cache = new Map<string, THREE.DataTexture>();

/** A detail map of the given kind at the current quality; generated once and shared. */
export function surfaceTexture(kind: SurfaceKind, sizeOverride?: number): THREE.DataTexture {
  const size = sizeOverride ?? (kind === 'ground' ? surfaceSize : Math.min(surfaceSize, 512));
  const key = `${kind}-${size}`;
  let t = cache.get(key);
  if (!t) {
    const rng = new Rng(9100 + kind.length * 131 + kind.charCodeAt(0));
    t = kind === 'ground' ? ground(size, rng) : kind === 'paint' ? paint(size, rng) : kind === 'metal' ? metal(size, rng) : kind === 'foil' ? foil(size, rng) : kind === 'rubber' ? rubber(size, rng) : cloth(size, rng);
    cache.set(key, t);
  }
  return t;
}

export interface SurfaceSpec {
  kind: SurfaceKind;
  /** Repeats per metre. */
  scale: number;
  /** Strength of the relief. */
  normal: number;
  /** How much the map varies roughness (0 = not at all). */
  rough: number;
  /** How much the map darkens the colour (0 = not at all). */
  albedo: number;
}

type Shader = THREE.WebGLProgramParametersWithUniforms;

/**
 * Shader hook that lays a detail map over a material by triplanar projection in the part's own
 * space (so nothing swims when the part moves), corrected for the part's scale.
 */
export function surfacePatch(spec: SurfaceSpec): (shader: Shader) => void {
  const tex = surfaceTexture(spec.kind);
  const params = new THREE.Vector4(spec.scale, spec.normal, spec.rough, spec.albedo);
  return function surface(shader: Shader): void {
    shader.uniforms.uSurf = { value: tex };
    shader.uniforms.uSurfP = { value: params };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurfP;\nvarying mat3 vSurfToView;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec3 surfS = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
        vSurfP = transformed * surfS;
        vSurfToView = mat3(viewMatrix) * mat3(modelMatrix[0].xyz / surfS.x, modelMatrix[1].xyz / surfS.y, modelMatrix[2].xyz / surfS.z);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uSurf;\nuniform vec4 uSurfP;\nvarying vec3 vSurfP;\nvarying mat3 vSurfToView;')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 sN = normalize(normal * vSurfToView);
          vec3 sP = vSurfP * uSurfP.x;
          vec3 sW = pow(abs(sN), vec3(6.0));
          sW /= sW.x + sW.y + sW.z;
          vec4 sX = texture2D(uSurf, sP.zy);
          vec4 sY = texture2D(uSurf, sP.xz);
          vec4 sZ = texture2D(uSurf, sP.xy);
          vec4 sT = sX * sW.x + sY * sW.y + sZ * sW.z;
          // "whiteout" blend: each projection tilts the normal in its own plane
          vec3 nX = vec3((sX.rg * 2.0 - 1.0) * uSurfP.y + sN.zy, sN.x);
          vec3 nY = vec3((sY.rg * 2.0 - 1.0) * uSurfP.y + sN.xz, sN.y);
          vec3 nZ = vec3((sZ.rg * 2.0 - 1.0) * uSurfP.y + sN.xy, sN.z);
          normal = normalize(vSurfToView * normalize(nX.zyx * sW.x + nY.xzy * sW.y + nZ.xyz * sW.z));
          roughnessFactor = clamp(roughnessFactor * (1.0 + (sT.b - 0.5) * 2.0 * uSurfP.z), 0.03, 1.0);
          diffuseColor.rgb *= mix(1.0, sT.a, uSurfP.w);
        }`,
      );
  };
}
