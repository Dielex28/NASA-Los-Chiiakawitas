import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { smoothstep } from '../core/math';
import type { Kit } from '../entities/kit';
import { ModuleView, type ViewContext } from '../entities/modules3d';
import { MODULES } from '../sim/catalog';
import type { ModuleState, SimState } from '../sim/types';
import type { World } from '../world/world';
import { COLLIDERS } from './colliders';

/** Keeps the 3D base in step with the simulation: module models, cables, lamps, collision. */
export class BaseView {
  readonly group = new THREE.Group();
  readonly views = new Map<number, ModuleView>();
  private cableMesh: THREE.Mesh | null = null;
  private signature = '';
  private lights: THREE.PointLight[] = [];
  private lightTimer = 0;
  /** World-space blocking circles [x, z, r] for the player. */
  readonly colliders: Array<[number, number, number]> = [];

  constructor(
    private world: World,
    private kit: Kit,
  ) {
    this.group.name = 'base';
    world.scene.add(this.group);
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffe2b8, 0, 34, 1.7);
      l.castShadow = false;
      this.lights.push(l);
      this.group.add(l);
    }
  }

  clear(): void {
    for (const v of this.views.values()) {
      this.group.remove(v.group);
      v.dispose();
    }
    this.views.clear();
    if (this.cableMesh) {
      this.group.remove(this.cableMesh);
      this.cableMesh.geometry.dispose();
      this.cableMesh = null;
    }
    this.signature = '';
    this.colliders.length = 0;
  }

  /** Create / remove views so they match the simulation's module list. */
  sync(sim: SimState): void {
    const sig = sim.modules.map((m) => `${m.id}:${m.x.toFixed(1)}:${m.z.toFixed(1)}`).join('|');
    if (sig === this.signature) return;
    this.signature = sig;
    const alive = new Set<number>();
    for (const m of sim.modules) {
      alive.add(m.id);
      let v = this.views.get(m.id);
      if (!v) {
        v = new ModuleView(m.type, this.kit, sim.world);
        this.views.set(m.id, v);
        this.group.add(v.group);
      }
      v.group.position.set(m.x, m.y, m.z);
      v.group.rotation.y = m.rot;
    }
    for (const [id, v] of this.views) {
      if (!alive.has(id)) {
        this.group.remove(v.group);
        v.dispose();
        this.views.delete(id);
      }
    }
    this.rebuildCables(sim);
    this.rebuildColliders(sim);
    this.world.rocks.setKeepouts(sim.modules.map((m) => ({ x: m.x, z: m.z, r: MODULES[m.type].radius + 1.5 })));
  }

  private rebuildColliders(sim: SimState): void {
    this.colliders.length = 0;
    for (const m of sim.modules) {
      const c = Math.cos(m.rot);
      const s = Math.sin(m.rot);
      for (const [lx, lz, r] of COLLIDERS[m.type]) {
        // local → world (rotation about Y)
        this.colliders.push([m.x + lx * c + lz * s, m.z - lx * s + lz * c, r]);
      }
    }
  }

  /** Utility lines: a minimum spanning tree over the modules, laid along the ground. */
  private rebuildCables(sim: SimState): void {
    if (this.cableMesh) {
      this.group.remove(this.cableMesh);
      this.cableMesh.geometry.dispose();
      this.cableMesh = null;
    }
    const mods = sim.modules;
    if (mods.length < 2) return;
    const inTree = new Array<boolean>(mods.length).fill(false);
    const dist = new Array<number>(mods.length).fill(Infinity);
    const parent = new Array<number>(mods.length).fill(-1);
    dist[0] = 0;
    const geos: THREE.BufferGeometry[] = [];
    for (let n = 0; n < mods.length; n++) {
      let u = -1;
      for (let i = 0; i < mods.length; i++) if (!inTree[i] && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0) break;
      inTree[u] = true;
      if (parent[u] >= 0) geos.push(this.cableGeometry(mods[parent[u]], mods[u]));
      for (let i = 0; i < mods.length; i++) {
        if (inTree[i]) continue;
        const d = Math.hypot(mods[i].x - mods[u].x, mods[i].z - mods[u].z);
        if (d < dist[i]) {
          dist[i] = d;
          parent[i] = u;
        }
      }
    }
    if (!geos.length) return;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) return;
    this.cableMesh = new THREE.Mesh(merged, this.kit.cable);
    this.cableMesh.castShadow = false;
    this.cableMesh.receiveShadow = true;
    this.group.add(this.cableMesh);
  }

  private cableGeometry(a: ModuleState, b: ModuleState): THREE.BufferGeometry {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(4, Math.ceil(len / 2.5));
    const pts: THREE.Vector3[] = [];
    const aPole = a.type === 'pylon';
    const bPole = b.type === 'pylon';
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      // a gentle sideways wander so cables do not look ruled
      const wob = Math.sin(t * Math.PI) * Math.sin(t * 9 + a.id) * Math.min(0.9, len * 0.03);
      const px = x + (-(b.z - a.z) / (len || 1)) * wob;
      const pz = z + ((b.x - a.x) / (len || 1)) * wob;
      const g = this.world.ground(px, pz) + 0.07;
      let y = g;
      if (aPole && bPole) {
        // overhead line between two poles, sagging in the middle
        const top = a.y + 3.0 + (b.y - a.y) * t;
        y = Math.max(g + 0.4, top - len * 0.05 * 4 * t * (1 - t));
      } else {
        if (aPole) y = Math.max(y, a.y + 3.0 * (1 - smoothstep(0, Math.min(5, len * 0.4), t * len)));
        if (bPole) y = Math.max(y, b.y + 3.0 * (1 - smoothstep(0, Math.min(5, len * 0.4), (1 - t) * len)));
      }
      pts.push(new THREE.Vector3(px, y, pz));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    return new THREE.TubeGeometry(curve, n * 2, 0.055, 5, false);
  }

  update(sim: SimState, ctx: ViewContext, focus: THREE.Vector3): void {
    this.kit.setDarkness(ctx.darkness);
    for (const m of sim.modules) this.views.get(m.id)?.update(m, ctx);

    // hand the few real lamps to the lit modules nearest the camera
    this.lightTimer -= ctx.dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.5;
      const lit: Array<{ d: number; v: ModuleView }> = [];
      for (const m of sim.modules) {
        const v = this.views.get(m.id);
        if (!v || !v.hasLight || m.built < 1 || m.mode === 'off') continue;
        lit.push({ d: (m.x - focus.x) ** 2 + (m.z - focus.z) ** 2, v });
      }
      lit.sort((a, b) => a.d - b.d);
      for (let i = 0; i < this.lights.length; i++) {
        const l = this.lights[i];
        if (i < lit.length) {
          l.position.copy(lit[i].v.lightAnchor);
          l.userData.on = true;
        } else l.userData.on = false;
      }
    }
    const power = 70 * Math.max(0, ctx.darkness - 0.3) / 0.7;
    for (const l of this.lights) l.intensity += ((l.userData.on ? power : 0) - l.intensity) * Math.min(1, ctx.dt * 4);
  }

  /** Nearest module hit by a ray, if any. */
  pick(origin: THREE.Vector3, dir: THREE.Vector3, sim: SimState): ModuleState | null {
    let best: ModuleState | null = null;
    let bestT = Infinity;
    const c = new THREE.Vector3();
    for (const m of sim.modules) {
      const r = Math.max(1.6, MODULES[m.type].radius * 0.72);
      c.set(m.x, m.y + Math.min(2.2, r), m.z).sub(origin);
      const tca = c.dot(dir);
      if (tca < 0) continue;
      const d2 = c.lengthSq() - tca * tca;
      if (d2 > r * r) continue;
      const t = tca - Math.sqrt(r * r - d2);
      if (t < bestT) {
        bestT = t;
        best = m;
      }
    }
    return best;
  }
}
