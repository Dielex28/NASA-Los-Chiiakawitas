import * as THREE from 'three';
import { HF_EXTENT } from './heightfield';
import type { Terrain } from './terrain';

/** Quads per side of every terrain patch. */
const N = 32;
/** Vertices per side including the one-quad skirt that hides LOD seams. */
const G = N + 3;
export const TERRAIN_ROOT = HF_EXTENT;
const MAX_LEVEL = 8;
/** Grid spacing of the finest patches (metres) — also the collision grid. */
export const LEAF_CELL = TERRAIN_ROOT / (1 << MAX_LEVEL) / N;

class Node {
  children: Node[] | null = null;
  mesh: THREE.Mesh | null = null;
  queued = false;
  lastUsed = 0;
  minY = 0;
  maxY = 0;
  constructor(
    readonly cx: number,
    readonly cz: number,
    readonly size: number,
    readonly level: number,
  ) {}
}

/**
 * Quadtree level-of-detail terrain. Patches near the camera are ~0.8 m per quad;
 * each step out doubles the spacing. Patches are generated a few per frame and a
 * parent stays on screen until all four children are ready, so there are no holes.
 */
export class TerrainMesh {
  readonly group = new THREE.Group();
  private root: Node;
  private queue: Node[] = [];
  private index: THREE.BufferAttribute;
  private frame = 0;
  private visible: Node[] = [];
  private heights = new Float32Array((N + 3) * (N + 3));
  splitFactor = 1.55;
  nodeCount = 0;

  constructor(
    private terrain: Terrain,
    private material: THREE.Material,
  ) {
    this.group.name = 'terrain';
    const idx: number[] = [];
    for (let j = 0; j < G - 1; j++) {
      for (let i = 0; i < G - 1; i++) {
        const a = j * G + i;
        const b = a + 1;
        const c = a + G;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    this.index = new THREE.BufferAttribute(new Uint16Array(idx), 1);
    this.root = new Node(0, 0, TERRAIN_ROOT, 0);
    this.build(this.root);
  }

  /** Height of the rendered surface at leaf resolution (matches the mesh the player walks on). */
  ground(x: number, z: number): number {
    const c = LEAF_CELL;
    const fx = x / c;
    const fz = z / c;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const t = this.terrain;
    const h00 = t.height(i * c, j * c, c);
    const h10 = t.height((i + 1) * c, j * c, c);
    const h01 = t.height(i * c, (j + 1) * c, c);
    const h11 = t.height((i + 1) * c, (j + 1) * c, c);
    // same diagonal as the mesh triangles
    if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }

  normal(x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    const e = 0.6;
    const hx = this.ground(x + e, z) - this.ground(x - e, z);
    const hz = this.ground(x, z + e) - this.ground(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }

  private build(node: Node): void {
    const cell = node.size / N;
    const half = node.size / 2;
    const t = this.terrain;
    const H = this.heights;
    const S = N + 3;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let j = 0; j < S; j++) {
      const z = node.cz - half + (j - 1) * cell;
      for (let i = 0; i < S; i++) {
        const x = node.cx - half + (i - 1) * cell;
        const h = t.height(x, z, cell);
        H[j * S + i] = h;
        if (h < minY) minY = h;
        if (h > maxY) maxY = h;
      }
    }
    const pos = new Float32Array(G * G * 3);
    const nor = new Float32Array(G * G * 3);
    const skirt = cell * 1.6 + 0.6;
    const baseY = (minY + maxY) / 2;
    for (let j = 0; j < G; j++) {
      // grid vertex (gi, gj) → inner sample index clamped to the patch border
      const sj = Math.min(Math.max(j - 1, 0), N);
      for (let i = 0; i < G; i++) {
        const si = Math.min(Math.max(i - 1, 0), N);
        const isSkirt = i === 0 || j === 0 || i === G - 1 || j === G - 1;
        const k = (j * G + i) * 3;
        const hi = (sj + 1) * S + (si + 1);
        pos[k] = si * cell - half;
        pos[k + 1] = H[hi] - baseY - (isSkirt ? skirt : 0);
        pos[k + 2] = sj * cell - half;
        const dx = H[hi + 1] - H[hi - 1];
        const dz = H[hi + S] - H[hi - S];
        const inv = 1 / Math.hypot(dx, 2 * cell, dz);
        nor[k] = -dx * inv;
        nor[k + 1] = 2 * cell * inv;
        nor[k + 2] = -dz * inv;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setIndex(this.index);
    const r = Math.hypot(half * Math.SQRT2, (maxY - minY) / 2 + skirt);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), r);
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.position.set(node.cx, baseY, node.cz);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.receiveShadow = true;
    mesh.castShadow = node.size <= 200;
    mesh.visible = false;
    this.group.add(mesh);
    node.mesh = mesh;
    node.minY = minY;
    node.maxY = maxY;
    node.queued = false;
    this.nodeCount++;
  }

  private request(node: Node): void {
    if (node.mesh || node.queued) return;
    node.queued = true;
    this.queue.push(node);
  }

  private select(node: Node, cam: THREE.Vector3): void {
    node.lastUsed = this.frame;
    const half = node.size / 2;
    const dx = Math.max(0, Math.abs(cam.x - node.cx) - half);
    const dz = Math.max(0, Math.abs(cam.z - node.cz) - half);
    const dy = cam.y > node.maxY ? cam.y - node.maxY : cam.y < node.minY ? node.minY - cam.y : 0;
    const dist = Math.hypot(dx, dz, dy);
    if (node.level < MAX_LEVEL && dist < node.size * this.splitFactor) {
      if (!node.children) {
        const q = node.size / 4;
        const s = node.size / 2;
        node.children = [
          new Node(node.cx - q, node.cz - q, s, node.level + 1),
          new Node(node.cx + q, node.cz - q, s, node.level + 1),
          new Node(node.cx - q, node.cz + q, s, node.level + 1),
          new Node(node.cx + q, node.cz + q, s, node.level + 1),
        ];
      }
      let ready = true;
      for (const c of node.children) {
        if (!c.mesh) {
          ready = false;
          this.request(c);
        }
      }
      if (ready) {
        for (const c of node.children) this.select(c, cam);
        return;
      }
    }
    this.visible.push(node);
  }

  /**
   * Choose the patches to draw for this camera and generate missing ones within
   * `budgetMs`. Returns true when the terrain is fully refined for the view.
   */
  update(cam: THREE.Vector3, budgetMs: number): boolean {
    this.frame++;
    for (const n of this.visible) if (n.mesh) n.mesh.visible = false;
    this.visible.length = 0;
    this.select(this.root, cam);
    for (const n of this.visible) if (n.mesh) n.mesh.visible = true;

    if (this.queue.length) {
      // nearest (and coarsest) first
      this.queue.sort((a, b) => {
        const da = (a.cx - cam.x) ** 2 + (a.cz - cam.z) ** 2 - a.size * a.size;
        const db = (b.cx - cam.x) ** 2 + (b.cz - cam.z) ** 2 - b.size * b.size;
        return db - da;
      });
      const t0 = performance.now();
      while (this.queue.length && performance.now() - t0 < budgetMs) this.build(this.queue.pop()!);
    }
    if (this.frame % 240 === 0) this.evict(this.root);
    return this.queue.length === 0;
  }

  /** Free patches that have not been drawn for a while. */
  private evict(node: Node): void {
    if (!node.children) return;
    let allStale = true;
    for (const c of node.children) {
      this.evict(c);
      if (c.children || this.frame - c.lastUsed < 900 || c.queued) allStale = false;
    }
    if (allStale && node.level >= 2) {
      for (const c of node.children) {
        if (c.mesh) {
          this.group.remove(c.mesh);
          c.mesh.geometry.dispose();
          c.mesh = null;
          this.nodeCount--;
        }
      }
      node.children = null;
    }
  }

  dispose(): void {
    const walk = (n: Node): void => {
      n.mesh?.geometry.dispose();
      n.children?.forEach(walk);
    };
    walk(this.root);
    this.group.clear();
  }
}
