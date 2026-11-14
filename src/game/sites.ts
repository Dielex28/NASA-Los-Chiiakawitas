import * as THREE from 'three';
import { hash2i } from '../core/rng';
import type { Kit } from '../entities/kit';
import { patchWorldMaterial } from '../render/shading';
import { expeditionSite, type Poi } from '../world/terrain';
import type { World } from '../world/world';

const MINERAL: Record<string, number> = {
  anorthosite: 0xdad6cf,
  breccia: 0x8d8478,
  glass: 0xe07a24,
  basalt: 0x34363c,
  iceReg: 0x9fd4ff,
  impactMelt: 0x4a4038,
  agglutinate: 0x6b665e,
  boulder: 0x9a968f,
  hematite: 0x5d6b82,
  carbonate: 0xd8c9a0,
  sulfate: 0xe9e2d0,
  mudstone: 0x8e7a66,
  olivine: 0x7f9a4e,
  clay: 0xb98f6a,
  meteorite: 0x4c4f58,
  perchlorate: 0xcfe0d2,
  freshEjecta: 0xece9e2,
  deltaRock: 0xa98a6c,
};

/** What the expedition fetches on each world. */
export const EXPEDITION_KIND = { moon: 'freshEjecta', mars: 'deltaRock' } as const;

export interface Site {
  poi: Poi;
  group: THREE.Group;
  beam: THREE.Mesh;
  y: number;
  scanned: boolean;
  collected: boolean;
  /** The expedition target: known from orbit, far from the base, worth more science. */
  far?: boolean;
}

/** Geological sample sites: distinctive outcrops that the scanner tags with a beacon. */
export class Sites {
  readonly group = new THREE.Group();
  readonly list: Site[] = [];
  private beamMat: THREE.MeshBasicMaterial;
  private farMat: THREE.MeshBasicMaterial;

  constructor(world: World, kit: Kit) {
    this.group.name = 'sites';
    world.scene.add(this.group);
    this.beamMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.3, 1.6, 2.4),
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.farMat = this.beamMat.clone();
    this.farMat.color.setRGB(2.4, 1.3, 0.3);
    const beamGeo = new THREE.CylinderGeometry(0.1, 0.5, 46, 10, 1, true);
    beamGeo.translate(0, 23, 0);
    const exp = expeditionSite(world.terrain);
    const farPoi: Poi = { id: `${EXPEDITION_KIND[world.id]}-far`, x: exp.x, z: exp.z, kind: EXPEDITION_KIND[world.id] };
    [...world.terrain.pois, farPoi].forEach((poi, idx) => {
      const far = poi === farPoi;
      const g = new THREE.Group();
      const y = world.ground(poi.x, poi.z);
      g.position.set(poi.x, y, poi.z);
      const mat = patchWorldMaterial(
        new THREE.MeshStandardMaterial({ color: MINERAL[poi.kind] ?? 0x888888, roughness: poi.kind === 'glass' || poi.kind === 'iceReg' ? 0.25 : 0.8, metalness: poi.kind === 'meteorite' ? 0.8 : 0.05, flatShading: true }),
        kit.uniforms,
      );
      const n = 5;
      for (let i = 0; i < n; i++) {
        const h = hash2i(idx * 13 + i, 91, world.seed);
        const u1 = (h & 1023) / 1023;
        const u2 = ((h >>> 10) & 1023) / 1023;
        const u3 = ((h >>> 20) & 1023) / 1023;
        const shard = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35 + 0.55 * u1, 0), mat);
        const a = (i / n) * Math.PI * 2 + u2;
        const r = i === 0 ? 0 : 0.6 + u3 * 0.9;
        shard.position.set(Math.cos(a) * r, 0.15 + 0.3 * u1, Math.sin(a) * r);
        shard.scale.set(0.8 + 0.5 * u2, i === 0 ? 1.5 : 0.6 + 0.8 * u3, 0.8 + 0.5 * u3);
        if (far) {
          // a bigger outcrop, and layered on Mars
          shard.scale.multiplyScalar(1.7);
          shard.position.multiplyScalar(1.7);
        }
        shard.rotation.set(u1 * 3, u2 * 6, u3 * 3);
        shard.castShadow = true;
        shard.receiveShadow = true;
        g.add(shard);
      }
      const beam = new THREE.Mesh(beamGeo, far ? this.farMat : this.beamMat);
      beam.visible = false;
      // the expedition beacon is visible across the whole site
      if (far) beam.scale.set(7, 2.4, 7);
      beam.renderOrder = 6;
      beam.userData.skipAO = true;
      g.add(beam);
      this.group.add(g);
      this.list.push({ poi, group: g, beam, y, scanned: far, collected: false, far });
    });
  }

  restore(scanned: string[], collected: string[]): void {
    for (const s of this.list) {
      s.scanned = !!s.far || scanned.includes(s.poi.id);
      s.collected = collected.includes(s.poi.id);
    }
  }

  /** Tag every site within `radius` of the pulse. Returns the newly found ones. */
  scan(x: number, z: number, radius: number): Site[] {
    const found: Site[] = [];
    for (const s of this.list) {
      if (s.scanned || s.collected) continue;
      if ((s.poi.x - x) ** 2 + (s.poi.z - z) ** 2 < radius * radius) {
        s.scanned = true;
        found.push(s);
      }
    }
    return found;
  }

  /** The expedition target. */
  get expedition(): Site | undefined {
    return this.list.find((s) => s.far);
  }

  nearest(x: number, z: number, maxDist: number): Site | null {
    let best: Site | null = null;
    let bd = maxDist * maxDist;
    for (const s of this.list) {
      if (s.collected) continue;
      const d = (s.poi.x - x) ** 2 + (s.poi.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  update(time: number): void {
    this.beamMat.opacity = 0.24 + 0.1 * Math.sin(time * 2.4);
    this.farMat.opacity = 0.3 + 0.12 * Math.sin(time * 1.7);
    for (const s of this.list) s.beam.visible = s.scanned && !s.collected;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}
