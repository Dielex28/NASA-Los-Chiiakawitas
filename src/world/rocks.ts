import * as THREE from 'three';
import { Noise2D } from '../core/noise';
import { hash2i, Rng } from '../core/rng';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchWorldMaterial, type WorldUniforms } from '../render/shading';
import type { WorldId } from '../sim/types';

const CELL = 22;
const RADIUS_CELLS = 6;

/** Three size classes, each with its own level of geometric detail. */
const TIERS = [
  { detail: 1, shapes: 2, cuts: 3 }, // pebbles: a few pixels across
  { detail: 4, shapes: 3, cuts: 6 }, // rocks
  { detail: 9, shapes: 3, cuts: 9 }, // boulders: seen up close on EVA
] as const;

export interface Keepout {
  x: number;
  z: number;
  r: number;
}

const ROCK_PARS = /* glsl */ `
uniform sampler2D uNoise;
uniform vec3 uColA;
vec3 rockBump(vec3 N, float h, vec3 vp, float strength) {
  vec3 dpdx = dFdx(vp);
  vec3 dpdy = dFdy(vp);
  vec3 r1 = cross(dpdy, N);
  vec3 r2 = cross(N, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * N - strength * grad);
}
`;

/**
 * A rock is a sphere that has been broken: lumpy at large scale, then cut by a handful of
 * random planes (fracture faces), then roughened. Normals are smooth, so the fracture edges
 * read as worn rather than as polygon facets.
 */
function rockGeometry(noise: Noise2D, rng: Rng, detail: number, cuts: number): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  geo = mergeVertices(geo, 1e-4);
  const planes: Array<[number, number, number, number]> = [];
  for (let i = 0; i < cuts; i++) {
    const a = rng.next() * Math.PI * 2;
    const y = rng.range(-0.25, 0.95);
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    planes.push([Math.cos(a) * r, y, Math.sin(a) * r, rng.range(0.66, 0.93)]);
  }
  const ox = rng.range(0, 40);
  const oy = rng.range(0, 40);
  const tall = rng.range(0.55, 0.85);
  const wide = rng.range(1, 1.35);
  const n3 = (x: number, y: number, z: number, f: number): number =>
    (noise.noise(x * f + ox, y * f + oy) + noise.noise(y * f + oy + 17.3, z * f + ox) + noise.noise(z * f + ox + 31.7, x * f + oy)) / 3;
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const dx = v.x;
    const dy = v.y;
    const dz = v.z;
    v.multiplyScalar(1 + 0.3 * n3(dx, dy, dz, 1.25) + 0.12 * n3(dx, dy, dz, 2.9));
    for (const [nx, ny, nz, d] of planes) {
      const over = v.x * nx + v.y * ny + v.z * nz - d;
      if (over > 0) v.set(v.x - nx * over * 0.94, v.y - ny * over * 0.94, v.z - nz * over * 0.94);
    }
    if (detail >= 4) v.multiplyScalar(1 + 0.03 * n3(dx, dy, dz, 7.5) + (detail >= 8 ? 0.012 * n3(dx, dy, dz, 19) : 0));
    // rocks sit flat, wider than tall, and are part-buried
    v.y *= tall;
    if (v.y < -0.22) v.y = -0.22 + (v.y + 0.22) * 0.2;
    v.x *= wide;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Rocks and boulders, streamed around the camera. Positions come from a hash of
 * the grid cell, so the same boulder is always in the same place for a seed.
 * Their long shadows are what sells a low Sun.
 */
export class Rocks {
  readonly group = new THREE.Group();
  /** meshes[tier][shape] */
  private meshes: THREE.InstancedMesh[][] = [];
  private cellX = 1e9;
  private cellZ = 1e9;
  private dirty = true;
  private keepouts: Keepout[] = [];
  private capacity: number;
  /** Boulders large enough to block movement: x, z, radius. */
  readonly colliders: Array<[number, number, number]> = [];

  constructor(
    private world: WorldId,
    private seed: number,
    private ground: (x: number, z: number) => number,
    uniforms: WorldUniforms,
    private density: number,
  ) {
    this.group.name = 'rocks';
    this.capacity = Math.ceil(700 * Math.max(0.3, density));
    const noise = new Noise2D(seed + 77);
    const rng = new Rng(seed + 4242);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.93, metalness: 0 });
    (mat as any).userData.variant = `rock-${world}`;
    patchWorldMaterial(mat, uniforms, function rock(shader) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${ROCK_PARS}`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          // mineral mottling and grain, projected on two axes so no face is ever stretched
          vec4 rkA = texture2D(uNoise, vHfWorld.xz * 0.43 + vHfWorld.y * 0.27);
          vec4 rkB = texture2D(uNoise, vHfWorld.xy * 2.3 + vHfWorld.z * 1.1);
          vec4 rkC = texture2D(uNoise, vHfWorld.zy * 0.9 + vHfWorld.x * 0.31);
          diffuseColor.rgb *= (0.7 + 0.55 * rkA.r) * (0.9 + 0.2 * rkB.a) * (0.9 + 0.2 * rkC.g);
          diffuseColor.rgb *= 1.0 - 0.3 * smoothstep(0.55, 0.8, rkB.b);`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          float rkDist = length(vViewPosition);
          // only the broad relief is bumped: per-pixel grain from screen-space derivatives reads as dither
          float rkH = (rkA.g * 0.06 + rkC.b * 0.035) * (1.0 - smoothstep(18.0, 60.0, rkDist));
          normal = rockBump(normal, rkH, -vViewPosition, 1.0);
          // fine dust settles on every upward face
          float rkUp = inverseTransformDirection(normal, viewMatrix).y;
          diffuseColor.rgb = mix(diffuseColor.rgb, uColA * (0.8 + 0.3 * rkC.r), 0.62 * smoothstep(0.35, 0.92, rkUp));`,
        );
    });
    TIERS.forEach((tier, ti) => {
      const row: THREE.InstancedMesh[] = [];
      for (let k = 0; k < tier.shapes; k++) {
        const mesh = new THREE.InstancedMesh(rockGeometry(noise, rng, tier.detail, tier.cuts), mat, ti === 2 ? 96 : this.capacity);
        mesh.count = 0;
        mesh.castShadow = ti > 0;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        row.push(mesh);
        this.group.add(mesh);
      }
      this.meshes.push(row);
    });
  }

  setKeepouts(list: Keepout[]): void {
    this.keepouts = list;
    this.dirty = true;
  }

  update(focusX: number, focusZ: number): void {
    const cx = Math.floor(focusX / CELL);
    const cz = Math.floor(focusZ / CELL);
    if (!this.dirty && cx === this.cellX && cz === this.cellZ) return;
    this.cellX = cx;
    this.cellZ = cz;
    this.dirty = false;
    this.rebuild();
  }

  private rebuild(): void {
    const counts = this.meshes.map((row) => row.map(() => 0));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const col = new THREE.Color();
    this.colliders.length = 0;
    const mars = this.world === 'mars';
    for (let j = -RADIUS_CELLS; j <= RADIUS_CELLS; j++) {
      for (let i = -RADIUS_CELLS; i <= RADIUS_CELLS; i++) {
        if (i * i + j * j > RADIUS_CELLS * RADIUS_CELLS + 1) continue;
        const gx = this.cellX + i;
        const gz = this.cellZ + j;
        const h0 = hash2i(gx, gz, this.seed);
        // rock fields are patchy: some cells are strewn, most are sparse
        const strewn = (h0 & 255) / 255;
        const n = Math.floor((mars ? 2 + 7 * strewn * strewn : 1 + 6 * strewn * strewn * strewn) * this.density + 0.5);
        for (let k = 0; k < n; k++) {
          const h = hash2i(gx * 31 + k, gz * 17 - k, this.seed + 1 + k);
          const u1 = (h & 1023) / 1023;
          const u2 = ((h >>> 10) & 1023) / 1023;
          const u3 = ((h >>> 20) & 1023) / 1023;
          const h2 = hash2i(gx - k * 7, gz + k * 13, this.seed + 99);
          const u4 = (h2 & 1023) / 1023;
          const u5 = ((h2 >>> 10) & 1023) / 1023;
          const x = (gx + u1) * CELL;
          const z = (gz + u2) * CELL;
          // most rocks are fist-to-football size; a few are boulders
          const size = 0.07 + 0.5 * u3 * u3 * u3 + (u4 > 0.965 ? 0.7 + 1.6 * u5 : 0);
          let blocked = Math.hypot(x, z) < 11 + size;
          for (const ko of this.keepouts) {
            if ((ko.x - x) ** 2 + (ko.z - z) ** 2 < (ko.r + size) ** 2) {
              blocked = true;
              break;
            }
          }
          if (blocked) continue;
          const tier = size > 0.62 ? 2 : size > 0.16 ? 1 : 0;
          const row = this.meshes[tier];
          const shape = (h2 >>> 20) % row.length;
          const mesh = row[shape];
          const at = counts[tier][shape];
          if (at >= mesh.instanceMatrix.count) continue;
          const y = this.ground(x, z);
          pos.set(x, y + size * 0.1, z);
          e.set((u5 - 0.5) * 0.5, u4 * Math.PI * 2, (u3 - 0.5) * 0.5);
          q.setFromEuler(e);
          s.set(size * (0.8 + 0.5 * u1), size * (0.7 + 0.5 * u2), size * (0.8 + 0.5 * u5));
          m.compose(pos, q, s);
          mesh.setMatrixAt(at, m);
          const tone = 0.8 + 0.45 * u4;
          if (mars) col.setRGB(0.3 * tone, 0.175 * tone, 0.115 * tone);
          else col.setRGB(0.3 * tone, 0.295 * tone, 0.29 * tone);
          mesh.setColorAt(at, col);
          counts[tier][shape] = at + 1;
          if (size > 0.75) this.colliders.push([x, z, size * 0.95]);
        }
      }
    }
    this.meshes.forEach((row, ti) =>
      row.forEach((mesh, k) => {
        mesh.count = counts[ti][k];
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }),
    );
  }
}
