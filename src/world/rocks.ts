import * as THREE from 'three';
import { Noise2D } from '../core/noise';
import { hash2i } from '../core/rng';
import { patchWorldMaterial, type WorldUniforms } from '../render/shading';
import type { WorldId } from '../sim/types';

const CELL = 22;
const RADIUS_CELLS = 6;
const VARIANTS = 4;

export interface Keepout {
  x: number;
  z: number;
  r: number;
}

/**
 * Rocks and boulders, streamed around the camera. Positions come from a hash of
 * the grid cell, so the same boulder is always in the same place for a seed.
 * Their long shadows are what sells a low Sun.
 */
export class Rocks {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
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
    this.capacity = Math.ceil(900 * Math.max(0.3, density));
    const noise = new Noise2D(seed + 77);
    const mat = patchWorldMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.94,
        metalness: 0,
        flatShading: true,
      }),
      uniforms,
    );
    const v = new THREE.Vector3();
    for (let k = 0; k < VARIANTS; k++) {
      const geo = new THREE.IcosahedronGeometry(1, k === 0 ? 2 : 1);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const n = 1 + 0.34 * noise.noise(v.x * 1.3 + k * 9.1, v.y * 1.3 + v.z * 0.9) + 0.14 * noise.noise(v.x * 3.7 - k, v.z * 3.7 + v.y);
        v.multiplyScalar(n);
        // squash: rocks sit flat and are wider than tall
        v.y *= 0.62 + 0.1 * k;
        if (v.y < -0.25) v.y = -0.25 + (v.y + 0.25) * 0.25;
        v.x *= 1 + 0.25 * (k % 2);
        p.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
      const mesh = new THREE.InstancedMesh(geo, mat, this.capacity);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
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
    const counts = new Array<number>(VARIANTS).fill(0);
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
          const variant = (h2 >>> 20) % VARIANTS;
          if (counts[variant] >= this.capacity) continue;
          const y = this.ground(x, z);
          pos.set(x, y + size * 0.12, z);
          e.set((u5 - 0.5) * 0.5, u4 * Math.PI * 2, (u3 - 0.5) * 0.5);
          q.setFromEuler(e);
          s.set(size * (0.8 + 0.5 * u1), size * (0.7 + 0.5 * u2), size * (0.8 + 0.5 * u5));
          m.compose(pos, q, s);
          const mesh = this.meshes[variant];
          mesh.setMatrixAt(counts[variant], m);
          const tone = 0.75 + 0.5 * u4;
          if (mars) col.setRGB(0.26 * tone, 0.15 * tone, 0.1 * tone);
          else col.setRGB(0.27 * tone, 0.265 * tone, 0.26 * tone);
          mesh.setColorAt(counts[variant], col);
          counts[variant]++;
          if (size > 0.75) this.colliders.push([x, z, size * 0.95]);
        }
      }
    }
    for (let k = 0; k < VARIANTS; k++) {
      const mesh = this.meshes[k];
      mesh.count = counts[k];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
