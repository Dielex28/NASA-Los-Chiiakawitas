import * as THREE from 'three';
import { patchWorldMaterial, type WorldUniforms } from './shading';
import type { WorldId } from '../sim/types';

const PARS = /* glsl */ `
uniform sampler2D uNoise;
uniform sampler2D uOverlay;
uniform vec3 uOverlayMix;
uniform vec4 uScan;
uniform vec3 uScanColor;
uniform vec4 uRing;
uniform vec3 uRingColor;
uniform vec4 uRange;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColSteep;
uniform vec4 uSurface;
uniform vec3 uWrap;
uniform float uTime;
varying vec3 vTerrainN;

vec3 terrainBumpN;
float terrainDist;

vec3 terrainAlbedo(vec3 wp, vec3 wn) {
  vec2 p = wp.xz;
  float dist = terrainDist;
  vec4 nA = texture2D(uNoise, p * 0.0029);
  vec4 nB = texture2D(uNoise, p * 0.021 + 0.37);
  vec4 nC = texture2D(uNoise, p * 0.17 + 0.11);
  vec4 nD = texture2D(uNoise, p * 1.31);
  float midFade = 1.0 - smoothstep(140.0, 700.0, dist);
  float nearFade = 1.0 - smoothstep(14.0, 55.0, dist);
  float macro = nA.r * 0.65 + nB.g * 0.35;
  vec3 col = mix(uColB, uColA, smoothstep(0.3, 0.72, macro));
  float slope = 1.0 - wn.y;
  // exposed bedrock / fresh regolith on slopes, with sedimentary banding on Mars
  float strata = 0.5 + 0.5 * sin(wp.y * 1.7 + nB.r * 5.0 + nA.g * 9.0);
  vec3 steep = mix(uColSteep, uColSteep * 0.58, uSurface.x * smoothstep(0.35, 0.7, strata));
  col = mix(col, steep, smoothstep(0.07, 0.34, slope));
  // patchy tone variation at walking scale (two unrelated scales so the tiling never lines up)
  vec4 nE = texture2D(uNoise, p.yx * 0.061 + 0.53);
  col *= mix(1.0, 0.82 + 0.2 * nC.b + 0.16 * nE.r, midFade * 0.9);
  col *= mix(1.0, 0.88 + 0.24 * nD.a, nearFade);
  // pebbles and clods
  float speck = smoothstep(0.7, 0.82, nD.r) * smoothstep(0.45, 0.6, nC.r) * nearFade;
  col *= 1.0 - uSurface.y * speck;
  // wind-blown dust drifts (Mars)
  col = mix(col, uColA * 1.12, uSurface.w * smoothstep(0.5, 0.8, nC.g) * (1.0 - smoothstep(0.03, 0.14, slope)));

  // Fine relief as a world-space gradient (central differences on the noise), so it is
  // stable under grazing light and free of screen-space derivative blockiness.
  float e1 = 0.45;
  vec2 pa = p.yx * 0.061 + 0.53;
  vec2 pb = p * 0.143 + 0.11;
  float gx = 0.62 * (texture2D(uNoise, pa + vec2(0.0, e1 * 0.061)).g - texture2D(uNoise, pa - vec2(0.0, e1 * 0.061)).g)
           + 0.38 * (texture2D(uNoise, pb + vec2(e1 * 0.143, 0.0)).b - texture2D(uNoise, pb - vec2(e1 * 0.143, 0.0)).b);
  float gz = 0.62 * (texture2D(uNoise, pa + vec2(e1 * 0.061, 0.0)).g - texture2D(uNoise, pa - vec2(e1 * 0.061, 0.0)).g)
           + 0.38 * (texture2D(uNoise, pb + vec2(0.0, e1 * 0.143)).b - texture2D(uNoise, pb - vec2(0.0, e1 * 0.143)).b);
  vec2 g = vec2(gx, gz) * (0.55 / (2.0 * e1)) * midFade;
  if (nearFade > 0.01) {
    float e2 = 0.035;
    float fx = (texture2D(uNoise, (p + vec2(e2, 0.0)) * 1.31).a - texture2D(uNoise, (p - vec2(e2, 0.0)) * 1.31).a);
    float fz = (texture2D(uNoise, (p + vec2(0.0, e2)) * 1.31).a - texture2D(uNoise, (p - vec2(0.0, e2)) * 1.31).a);
    g += vec2(fx, fz) * (0.03 / (2.0 * e2)) * nearFade;
  }
  terrainBumpN = normalize(wn - vec3(g.x, 0.0, g.y) * uSurface.z);
  return col;
}

vec3 terrainGlow(vec3 wp) {
  vec3 e = vec3(0.0);
  // scanner pulse: an expanding ring with a faint survey grid in its wake
  if (uScan.w > 0.001) {
    float ds = distance(wp.xz, uScan.xy);
    float ring = exp(-pow((ds - uScan.z) / 1.6, 2.0));
    float wake = smoothstep(uScan.z - 70.0, uScan.z, ds) * step(ds, uScan.z);
    vec2 g = abs(fract(wp.xz / 5.0) - 0.5);
    float grid = 1.0 - smoothstep(0.0, 0.04, min(g.x, g.y));
    float contour = 1.0 - smoothstep(0.0, 0.08, abs(fract(wp.y / 2.0) - 0.5));
    e += uScanColor * (ring * 2.2 + wake * (grid * 0.5 + contour * 0.35)) * uScan.w;
  }
  // build cursor footprint
  if (uRing.w > 0.5) {
    float dr = distance(wp.xz, uRing.xy);
    float line = 1.0 - smoothstep(0.0, 0.22, abs(dr - uRing.z));
    float fill = (1.0 - smoothstep(uRing.z - 0.2, uRing.z, dr)) * 0.16;
    float dash = step(0.5, fract(atan(wp.z - uRing.y, wp.x - uRing.x) * 6.0 / 3.14159 + uTime * 0.2));
    e += uRingColor * (line * (0.6 + 0.6 * dash) + fill);
  }
  // utility-network reach around the base
  if (uRange.w > 0.5) {
    float dr = distance(wp.xz, uRange.xy);
    float line = 1.0 - smoothstep(0.0, 0.35, abs(dr - uRange.z));
    e += vec3(0.2, 0.7, 1.0) * line * 0.5 * (0.6 + 0.4 * sin(uTime * 2.0));
  }
  return e;
}
`;

/**
 * Procedural regolith: albedo, banding and bump detail are generated in the
 * shader from one tileable noise texture, so the ground stays sharp from
 * boot-print scale to the horizon without a single image asset.
 */
export function createTerrainMaterial(world: WorldId, u: WorldUniforms): THREE.MeshStandardMaterial {
  if (world === 'moon') {
    u.uColA.value.setRGB(0.3, 0.295, 0.29);
    u.uColB.value.setRGB(0.17, 0.17, 0.175);
    u.uColSteep.value.setRGB(0.38, 0.37, 0.36);
    u.uSurface.value.set(0.0, 0.32, 1.0, 0.0);
    u.uWrap.value.set(0.13, 0.7, 2.2);
  } else {
    u.uColA.value.setRGB(0.62, 0.33, 0.17);
    u.uColB.value.setRGB(0.3, 0.15, 0.09);
    u.uColSteep.value.setRGB(0.42, 0.2, 0.12);
    u.uSurface.value.set(1.0, 0.38, 1.05, 0.5);
    u.uWrap.value.set(0.05, 0.35, 1.6);
  }
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0 });
  (mat as any).userData.variant = `terrain-${world}`;
  return patchWorldMaterial(mat, u, function terrain(shader) {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTerrainN;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvTerrainN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PARS}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        terrainDist = length(vViewPosition);
        vec3 tN = normalize(vTerrainN);
        diffuseColor.rgb = terrainAlbedo(vHfWorld, tN);
        vec4 ov = texture2D(uOverlay, vHfWorld.xz * uOverlayMix.z + 0.5);
        vec2 ouv = abs(vHfWorld.xz * uOverlayMix.z);
        float oin = step(max(ouv.x, ouv.y), 0.5) * uOverlayMix.x * ov.a;
        diffuseColor.rgb = mix(diffuseColor.rgb, ov.rgb * 0.55, oin * 0.8);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        // Grazing sunlight makes hard per-pixel normal mapping flicker, so the fine relief
        // modulates the sunlight softly instead (micro-shadowing), and the shading normal is
        // leaned toward the Sun a little: regolith back-scatters and the solar disc is not a point.
        vec3 sunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
        float terrainMicro = clamp(1.0 + (dot(terrainBumpN, uSunDir) - dot(tN, uSunDir)) * uWrap.z, 0.35, 1.9);
        normal = normalize(normal + sunV * uWrap.x);
        float muW = max(dot(normal, sunV), 1e-3);
        terrainMicro *= mix(1.0, pow(muW, 0.55) * 0.85 / muW, uWrap.y);`,
      )
      .replace('directLight.color *= hfShadow;', 'directLight.color *= hfShadow * terrainMicro;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += terrainGlow(vHfWorld);
        totalEmissiveRadiance += ov.rgb * oin * 0.4;
        if (uOverlayMix.y > 0.01) {
          float cl = abs(fract(vHfWorld.y / 5.0) - 0.5);
          float w = fwidth(vHfWorld.y / 5.0) * 1.2;
          totalEmissiveRadiance += vec3(0.5, 0.85, 1.0) * (1.0 - smoothstep(0.0, w, cl)) * 0.16 * uOverlayMix.y;
        }`,
      );
  });
}
