import * as THREE from 'three';
import { patchWorldMaterial, type WorldUniforms } from './shading';
import type { WorldId } from '../sim/types';

const PARS = /* glsl */ `
uniform sampler2D uNoise;
uniform sampler2D uGroundN;
uniform vec2 uOpposition;
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
  vec4 nE = texture2D(uNoise, p.yx * 0.061 + 0.53);
  float midFade = 1.0 - smoothstep(140.0, 700.0, dist);
  float nearFade = 1.0 - smoothstep(14.0, 55.0, dist);
  float macro = nA.r * 0.65 + nB.g * 0.35;
  vec3 col = mix(uColB, uColA, smoothstep(0.3, 0.72, macro));
  float slope = 1.0 - wn.y;
  // exposed bedrock / fresh regolith on slopes, with sedimentary banding on Mars
  float strataPhase = wp.y * 1.7 + nB.r * 5.0 + nA.g * 9.0;
  float strata = 0.5 + 0.5 * sin(strataPhase);
  // bands thinner than a pixel would shimmer into moiré: let them melt into their average
  float strataKeep = 1.0 - smoothstep(0.5, 1.8, fwidth(strataPhase));
  vec3 steep = mix(uColSteep, uColSteep * 0.58, uSurface.x * mix(0.5, smoothstep(0.35, 0.7, strata), strataKeep));
  col = mix(col, steep, smoothstep(0.07, 0.34, slope));
  // patchy tone variation at walking scale (two unrelated scales so the tiling never lines up)
  col *= mix(1.0, 0.86 + 0.12 * nC.b + 0.16 * nE.r, midFade * 0.9);
  col *= mix(1.0, 0.88 + 0.24 * nD.a, nearFade);
  // pebbles and clods
  float speck = smoothstep(0.7, 0.82, nD.r) * smoothstep(0.45, 0.6, nC.r) * nearFade;
  col *= 1.0 - uSurface.y * speck;
  // wind-blown dust drifts (Mars)
  float drift = smoothstep(0.42, 0.7, nE.g * 0.55 + nB.b * 0.45);
  col = mix(col, uColA * 1.1, uSurface.w * drift * (1.0 - smoothstep(0.03, 0.14, slope)));

  // Fine relief from baked detail maps (grain, pebbles, clods, small pits) at three scales.
  // Reading a ready-made normal is sharper and cheaper than differencing noise in the shader.
  // It fades with distance: from the command view the real relief and the rocks carry the
  // detail, and a repeating bump would read as a quilt.
  float bumpFade = 1.0 - smoothstep(30.0, 95.0, dist);
  float closeFade = 1.0 - smoothstep(5.0, 22.0, dist);
  vec4 dA = texture2D(uGroundN, p * 0.47);
  vec4 dB = texture2D(uGroundN, p.yx * 0.139 + 0.31);
  vec4 dC = texture2D(uGroundN, p * 0.0417 + 0.63);
  vec2 g = (dA.rg * 2.0 - 1.0) * nearFade * 0.95
         + (dB.gr * 2.0 - 1.0) * bumpFade * 0.8
         + (dC.rg * 2.0 - 1.0) * bumpFade * 0.55;
  // pebbles and pits also change the tone of the soil
  col *= mix(1.0, dA.a, nearFade * 0.85) * mix(1.0, dB.a, bumpFade * 0.5);
  if (closeFade > 0.01) {
    // the finest grain, only where a boot could touch it
    vec4 dD = texture2D(uGroundN, p.yx * 1.93 + 0.17);
    g += (dD.gr * 2.0 - 1.0) * closeFade * 0.5;
    col *= mix(1.0, 0.9 + 0.1 * dD.a, closeFade);
  }
  terrainBumpN = normalize(wn + vec3(g.x, 0.0, g.y) * uSurface.z);
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
    u.uSurface.value.set(0.0, 0.36, 0.5, 0.0);
    u.uWrap.value.set(0.13, 0.7, 2.2);
    u.uOpposition.value.set(0.55, 0.075);
  } else {
    u.uColA.value.setRGB(0.62, 0.33, 0.17);
    u.uColB.value.setRGB(0.3, 0.15, 0.09);
    u.uColSteep.value.setRGB(0.42, 0.2, 0.12);
    u.uSurface.value.set(1.0, 0.4, 0.45, 0.5);
    u.uWrap.value.set(0.05, 0.35, 1.6);
    u.uOpposition.value.set(0.2, 0.09);
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
        diffuseColor.rgb = mix(diffuseColor.rgb, ov.rgb * 0.6, oin * 0.5);`,
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
        terrainMicro *= mix(1.0, pow(muW, 0.55) * 0.85 / muW, uWrap.y);
        // Opposition surge: looking straight down-Sun every grain hides its own shadow, so the
        // ground brightens in a halo around the point opposite the Sun (seen in every Apollo
        // photograph taken with the Sun behind the camera).
        float cosPhase = clamp(dot(normalize(cameraPosition - vHfWorld), uSunDir), -1.0, 1.0);
        float tanHalf = sqrt(max(1.0 - cosPhase, 0.0) / max(1.0 + cosPhase, 1e-4));
        terrainMicro *= 1.0 + uOpposition.x / (1.0 + tanHalf / uOpposition.y);`,
      )
      .replace('directLight.color *= hfShadow;', 'directLight.color *= hfShadow * terrainMicro;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += terrainGlow(vHfWorld);
        totalEmissiveRadiance += ov.rgb * oin * 0.22;
        if (uOverlayMix.y > 0.01) {
          float cl = abs(fract(vHfWorld.y / 5.0) - 0.5);
          float w = fwidth(vHfWorld.y / 5.0) * 1.2;
          totalEmissiveRadiance += vec3(0.5, 0.85, 1.0) * (1.0 - smoothstep(0.0, w, cl)) * 0.16 * uOverlayMix.y;
        }`,
      );
  });
}
