import * as THREE from 'three';
import type { Kit } from '../entities/kit';
import { ModuleView } from '../entities/modules3d';
import { MODULES, TUNE } from '../sim/catalog';
import { placeModule } from '../sim/sim';
import type { ModuleState, ModuleType, SimState } from '../sim/types';
import type { World } from '../world/world';

export type PlacementIssue = 'none' | 'slope' | 'overlap' | 'range' | 'far' | 'empty';

export interface Placement {
  x: number;
  y: number;
  z: number;
  valid: boolean;
  issue: PlacementIssue;
  slopeDeg: number;
  /** Fraction of the cycle this spot is sunlit. */
  illum: number;
  /** Ice richness if this spot has been scanned, else −1. */
  ice: number;
  /** Distance to the nearest habitat or lander (reactor siting). */
  crewDist: number;
}

export interface ScanCircle {
  x: number;
  z: number;
  r: number;
}

/** Intersect a ray with the terrain by marching, then refine by bisection. */
export function raycastTerrain(origin: THREE.Vector3, dir: THREE.Vector3, ground: (x: number, z: number) => number, maxDist: number, out: THREE.Vector3): boolean {
  let t = 0;
  let prev = 0;
  for (let i = 0; i < 220; i++) {
    const x = origin.x + dir.x * t;
    const y = origin.y + dir.y * t;
    const z = origin.z + dir.z * t;
    const h = y - ground(x, z);
    if (h <= 0) {
      let lo = prev;
      let hi = t;
      for (let k = 0; k < 10; k++) {
        const mid = (lo + hi) / 2;
        const my = origin.y + dir.y * mid - ground(origin.x + dir.x * mid, origin.z + dir.z * mid);
        if (my > 0) lo = mid;
        else hi = mid;
      }
      out.set(origin.x + dir.x * hi, 0, origin.z + dir.z * hi);
      out.y = ground(out.x, out.z);
      return true;
    }
    prev = t;
    t += Math.max(0.4, h * 0.55);
    if (t > maxDist) break;
  }
  return false;
}

/** Module placement: a holographic ghost that follows the cursor and reports why a spot is unsuitable. */
export class BuildSystem {
  active: ModuleType | null = null;
  rot = 0;
  placement: Placement | null = null;
  private ghost: ModuleView | null = null;
  private ghostValid = true;
  private hit = new THREE.Vector3();

  constructor(
    private world: World,
    private kit: Kit,
    private scans: () => ScanCircle[],
  ) {}

  start(type: ModuleType): void {
    this.cancel();
    this.active = type;
    this.ghost = new ModuleView(type, this.kit, this.world.id);
    this.ghost.setGhost(true);
    this.ghostValid = true;
    this.ghost.group.visible = false;
    this.world.scene.add(this.ghost.group);
  }

  cancel(): void {
    if (this.ghost) {
      this.world.scene.remove(this.ghost.group);
      this.ghost.dispose();
      this.ghost = null;
    }
    this.active = null;
    this.placement = null;
    this.world.uniforms.uRing.value.w = 0;
    this.world.uniforms.uRange.value.w = 0;
  }

  /** Evaluate a candidate position. */
  check(sim: SimState, type: ModuleType, x: number, z: number): Placement {
    const def = MODULES[type];
    const hf = this.world.hf;
    const pad = hf.padHeight(x, z, def.radius * 0.7);
    const slope = hf.slopeDeg(x, z, Math.max(1.5, def.radius * 0.7));
    let issue: PlacementIssue = 'none';
    if ((sim.inventory[type] ?? 0) <= 0) issue = 'empty';
    else if (Math.hypot(x, z) > 1150) issue = 'far';
    else if (slope > def.maxSlopeDeg) issue = 'slope';
    let linked = false;
    let crewDist = Infinity;
    for (const m of sim.modules) {
      const d = Math.hypot(m.x - x, m.z - z);
      const md = MODULES[m.type];
      if (d < (md.radius + def.radius) * 0.86 + 0.5 && issue === 'none') issue = 'overlap';
      if (d <= TUNE.linkRange) linked = true;
      if (m.type === 'hab' || m.type === 'lander') crewDist = Math.min(crewDist, d);
    }
    if (!linked && issue === 'none') issue = 'range';
    let ice = -1;
    for (const s of this.scans()) {
      if ((s.x - x) ** 2 + (s.z - z) ** 2 < s.r * s.r) {
        ice = hf.iceRichness(x, z);
        break;
      }
    }
    return { x, y: pad.top, z, valid: issue === 'none', issue, slopeDeg: slope, illum: hf.illumination(x, z), ice, crewDist };
  }

  update(sim: SimState, origin: THREE.Vector3, dir: THREE.Vector3, time: number): void {
    if (!this.active || !this.ghost) return;
    const ok = raycastTerrain(origin, dir, (x, z) => this.world.ground(x, z), 1500, this.hit);
    if (!ok) {
      this.ghost.group.visible = false;
      this.placement = null;
      this.world.uniforms.uRing.value.w = 0;
      return;
    }
    const p = this.check(sim, this.active, this.hit.x, this.hit.z);
    this.placement = p;
    this.ghost.group.visible = true;
    this.ghost.group.position.set(p.x, p.y + 0.05 + 0.04 * Math.sin(time * 3), p.z);
    this.ghost.group.rotation.y = this.rot;
    if (p.valid !== this.ghostValid) {
      this.ghostValid = p.valid;
      this.ghost.setGhost(p.valid);
    }
    const u = this.world.uniforms;
    u.uRing.value.set(p.x, p.z, MODULES[this.active].radius, 1);
    if (p.valid) u.uRingColor.value.setRGB(0.2, 1.0, 0.55);
    else u.uRingColor.value.setRGB(1.0, 0.25, 0.15);
    // show how far the utility network reaches from the nearest module
    let nearest: ModuleState | null = null;
    let nd = Infinity;
    for (const m of sim.modules) {
      const d = Math.hypot(m.x - p.x, m.z - p.z);
      if (d < nd) {
        nd = d;
        nearest = m;
      }
    }
    if (nearest) u.uRange.value.set(nearest.x, nearest.z, TUNE.linkRange, 1);
  }

  confirm(sim: SimState): ModuleState | null {
    if (!this.active || !this.placement || !this.placement.valid) return null;
    const p = this.placement;
    return placeModule(sim, this.active, p.x, p.y, p.z, this.rot, this.world.hf);
  }
}
