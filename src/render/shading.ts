import * as THREE from 'three';
import { Rng } from '../core/rng';
import { HF_EXTENT, HF_SIZE, SURVEY_EXTENT, SURVEY_SIZE, type Heightfield } from '../world/heightfield';
import type { WorldId } from '../sim/types';

/**
 * Uniforms shared by every lit material in the scene. One object, referenced by
 * all patched shaders, so updating the Sun or the scanner updates everything.
 */
export interface WorldUniforms {
  uSunDir: { value: THREE.Vector3 };
  uHeightMap: { value: THREE.Texture | null };
  /** x: 1/extent · y: height offset · z: penumbra sharpness · w: enabled */
  uHf: { value: THREE.Vector4 };
  uNoise: { value: THREE.Texture | null };
  uTime: { value: number };
  /** x, z, radius, intensity */
  uScan: { value: THREE.Vector4 };
  uScanColor: { value: THREE.Color };
  /** x, z, radius, active */
  uRing: { value: THREE.Vector4 };
  uRingColor: { value: THREE.Color };
  /** x, z, radius, active — network link range */
  uRange: { value: THREE.Vector4 };
  uOverlay: { value: THREE.Texture | null };
  /** x: mix · y: contour lines · z: 1/extent */
  uOverlayMix: { value: THREE.Vector3 };
  uColA: { value: THREE.Color };
  uColB: { value: THREE.Color };
  uColSteep: { value: THREE.Color };
  /** x: strata strength · y: speck strength · z: bump strength · w: dust tint */
  uSurface: { value: THREE.Vector4 };
  /** x: lean of the shading normal toward the Sun · y: regolith response shaping · z: micro-relief gain */
  uWrap: { value: THREE.Vector3 };
}

export function createWorldUniforms(): WorldUniforms {
  return {
    uSunDir: { value: new THREE.Vector3(0.5, 0.2, 0.5).normalize() },
    uHeightMap: { value: null },
    uHf: { value: new THREE.Vector4(1 / HF_EXTENT, 0, 90, 1) },
    uNoise: { value: null },
    uTime: { value: 0 },
    uScan: { value: new THREE.Vector4(0, 0, 0, 0) },
    uScanColor: { value: new THREE.Color(0.25, 0.9, 1.0) },
    uRing: { value: new THREE.Vector4(0, 0, 1, 0) },
    uRingColor: { value: new THREE.Color(0.3, 1, 0.6) },
    uRange: { value: new THREE.Vector4(0, 0, 1, 0) },
    uOverlay: { value: null },
    uOverlayMix: { value: new THREE.Vector3(0, 0, 1 / SURVEY_EXTENT) },
    uColA: { value: new THREE.Color(0.3, 0.3, 0.3) },
    uColB: { value: new THREE.Color(0.2, 0.2, 0.2) },
    uColSteep: { value: new THREE.Color(0.4, 0.4, 0.4) },
    uSurface: { value: new THREE.Vector4(0, 0.3, 1, 0) },
    uWrap: { value: new THREE.Vector3(0.1, 1, 3) },
  };
}

/** Tileable RGBA noise used by the terrain shader for albedo and bump detail. */
export function makeNoiseTexture(seed: number, size = 256): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const rng = new Rng(seed);
  const lattices: Float32Array[][] = [];
  const periods = [4, 8, 16, 32, 64, 128];
  for (let c = 0; c < 4; c++) {
    lattices.push(
      periods.map((p) => {
        const a = new Float32Array(p * p);
        for (let i = 0; i < a.length; i++) a[i] = rng.next();
        return a;
      }),
    );
  }
  const sample = (lat: Float32Array, p: number, u: number, v: number): number => {
    const x = u * p;
    const y = v * p;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    let fx = x - x0;
    let fy = y - y0;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const xa = ((x0 % p) + p) % p;
    const ya = ((y0 % p) + p) % p;
    const xb = (xa + 1) % p;
    const yb = (ya + 1) % p;
    return (lat[ya * p + xa] * (1 - fx) + lat[ya * p + xb] * fx) * (1 - fy) + (lat[yb * p + xa] * (1 - fx) + lat[yb * p + xb] * fx) * fy;
  };
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const u = i / size;
      const v = j / size;
      const k = (j * size + i) * 4;
      // R: smooth fbm · G: fbm, other seed · B: billowy · A: fine grain
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let amp = 0.5;
      for (let o = 0; o < 5; o++) {
        r += amp * sample(lattices[0][o], periods[o], u, v);
        g += amp * sample(lattices[1][o], periods[o], u, v);
        b += amp * Math.abs(2 * sample(lattices[2][o], periods[o], u, v) - 1);
        amp *= 0.5;
      }
      a = 0.5 * sample(lattices[3][4], periods[4], u, v) + 0.5 * sample(lattices[3][5], periods[5], u, v);
      data[k] = Math.min(255, r * 263);
      data[k + 1] = Math.min(255, g * 263);
      data[k + 2] = Math.min(255, b * 300);
      data[k + 3] = Math.min(255, a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** Upload the baked heightfield as a half-float texture (linearly filterable everywhere). */
export function makeHeightTexture(hf: Heightfield, u: WorldUniforms): THREE.DataTexture {
  const base = hf.terrain.height(0, 0, 8);
  const half = new Uint16Array(HF_SIZE * HF_SIZE);
  for (let i = 0; i < half.length; i++) half[i] = THREE.DataUtils.toHalfFloat(hf.data[i] - base);
  const tex = new THREE.DataTexture(half, HF_SIZE, HF_SIZE, THREE.RedFormat, THREE.HalfFloatType);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  u.uHeightMap.value = tex;
  u.uHf.value.y = base;
  return tex;
}

export type OverlayKind = 'none' | 'illum' | 'ice';

/** Colour-ramped survey map draped over the terrain (illumination or ice potential). */
export function makeOverlayTexture(
  hf: Heightfield,
  kind: OverlayKind,
  world: WorldId,
  prev?: THREE.DataTexture | null,
  /** Areas the player has surveyed; ice is only drawn inside them. */
  scans?: Array<{ x: number; z: number; r: number }>,
): THREE.DataTexture {
  const data = prev ? (prev.image.data as Uint8Array) : new Uint8Array(SURVEY_SIZE * SURVEY_SIZE * 4);
  for (let i = 0; i < SURVEY_SIZE * SURVEY_SIZE; i++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    if (kind === 'illum') {
      const f = hf.illum[i];
      // deep blue (never lit) → magenta → amber → white-gold (always lit)
      const lo = world === 'moon' ? 0 : 0.6;
      const t = Math.max(0, Math.min(1, (f - lo) / (1 - lo)));
      r = 30 + 225 * Math.min(1, t * 1.6);
      g = 40 + 190 * Math.max(0, t * 1.5 - 0.45);
      b = 150 * (1 - t) + 40 * Math.max(0, t - 0.75) * 4;
      a = 200;
    } else if (kind === 'ice') {
      // ground truth exists everywhere, but the map only shows what a scan has revealed
      const cell = SURVEY_EXTENT / SURVEY_SIZE;
      const cx = ((i % SURVEY_SIZE) + 0.5) * cell - SURVEY_EXTENT / 2;
      const cz = (Math.floor(i / SURVEY_SIZE) + 0.5) * cell - SURVEY_EXTENT / 2;
      let known = false;
      if (scans) {
        for (const s of scans) {
          if ((s.x - cx) ** 2 + (s.z - cz) ** 2 < (s.r + cell * 0.5) ** 2) {
            known = true;
            break;
          }
        }
      }
      if (known) {
        const f = hf.ice[i];
        r = 20 + 60 * f;
        g = 70 + 170 * f;
        b = 120 + 135 * f;
        a = 55 + 185 * f;
      }
    }
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  const tex = prev ?? new THREE.DataTexture(data as any, SURVEY_SIZE, SURVEY_SIZE, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export const HF_GLSL_PARS = /* glsl */ `
uniform sampler2D uHeightMap;
uniform vec3 uSunDir;
uniform vec4 uHf;
varying vec3 vHfWorld;
float hfHeight(vec2 xz) { return texture2D(uHeightMap, xz * uHf.x + 0.5).r + uHf.y; }
/* Soft shadow cast by distant terrain: march the baked heightfield toward the Sun. */
float hfShadowAt(vec3 p) {
  if (uHf.w < 0.5) return 1.0;
  vec3 L = uSunDir;
  if (L.y < -0.06) return 0.0;
  float res = 1.0;
  float y0 = max(p.y, hfHeight(p.xz)) + 0.75;
  float t = 6.0;
  for (int i = 0; i < HF_STEPS; i++) {
    vec3 q = vec3(p.x, y0, p.z) + L * t;
    float d = q.y - hfHeight(q.xz);
    res = min(res, uHf.z * d / t);
    if (res < -0.2) break;
    t += max(5.0, t * HF_GROW);
  }
  return smoothstep(0.0, 1.0, res) * smoothstep(-0.06, 0.0, L.y);
}
`;

export interface PatchOptions {
  steps?: number;
}

let hfSteps = 40;
export function setHeightfieldQuality(steps: number): void {
  hfSteps = steps;
}

/**
 * Make a standard material receive far-field terrain shadows (in addition to the
 * regular shadow map). Only the directional light — the Sun — is attenuated, so
 * lamps and the helmet light still work inside a shadowed crater.
 */
export function patchWorldMaterial<T extends THREE.Material>(mat: T, u: WorldUniforms, extra?: (shader: THREE.WebGLProgramParametersWithUniforms) => void): T {
  const steps = hfSteps;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.defines = shader.defines ?? {};
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHfWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        #ifdef USE_INSTANCING
          vHfWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vHfWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`,
      );
    const grow = steps >= 40 ? '0.155' : steps >= 28 ? '0.24' : '0.36';
    const lights = THREE.ShaderChunk.lights_fragment_begin.replace(
      'getDirectionalLightInfo( directionalLight, directLight );',
      'getDirectionalLightInfo( directionalLight, directLight ); directLight.color *= hfShadow;',
    );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n#define HF_STEPS ${steps}\n#define HF_GROW ${grow}\n${HF_GLSL_PARS}`)
      .replace('#include <lights_fragment_begin>', `float hfShadow = hfShadowAt(vHfWorld);\n${lights}`);
    extra?.(shader);
  };
  mat.customProgramCacheKey = () => `world-${steps}-${extra ? extra.name || 'x' : 'std'}-${(mat as any).userData?.variant ?? ''}`;
  return mat;
}
