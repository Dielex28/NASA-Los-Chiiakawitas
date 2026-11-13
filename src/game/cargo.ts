import * as THREE from 'three';
import type { Kit } from '../entities/kit';
import { ModuleView } from '../entities/modules3d';
import type { Particles } from '../render/particles';
import type { SimState } from '../sim/types';
import type { World } from '../world/world';

interface Drop {
  view: ModuleView;
  x: number;
  z: number;
  groundY: number;
  /** Seconds since the descent began; negative once it has settled. */
  t: number;
  flame: THREE.Mesh;
}

const DESCENT_S = 11;
const START_ALT = 150;

/**
 * Resupply landers. The simulation credits the cargo the moment a delivery is
 * due; this plays the arrival: a powered descent with an engine plume that
 * blasts regolith outward — the reason real bases will need landing pads.
 */
export class CargoLanders {
  private drops: Drop[] = [];
  private flameMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.6, 2.4, 3.6),
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  /** Set when a lander has just touched down (for a sound cue). */
  touchdown = false;

  constructor(
    private world: World,
    private kit: Kit,
    private dust: Particles,
    private sparks: Particles,
  ) {}

  clear(): void {
    for (const d of this.drops) {
      this.world.scene.remove(d.view.group);
      d.view.dispose();
    }
    this.drops.length = 0;
  }

  private spot(i: number): [number, number] {
    const a = 2.5 + i * 1.15;
    return [Math.cos(a) * 92, Math.sin(a) * 92];
  }

  /**
   * Match the number of landers to the deliveries made so far.
   * @param animate play the descent for new arrivals (false when restoring a save)
   */
  sync(sim: SimState, animate: boolean): void {
    const delivered = sim.resupply.filter((r) => r.delivered).length;
    while (this.drops.length < delivered) {
      const i = this.drops.length;
      const [x, z] = this.spot(i);
      const groundY = this.world.hf.padHeight(x, z, 4).top;
      const view = new ModuleView('lander', this.kit, this.world.id);
      view.group.scale.setScalar(0.78);
      view.group.rotation.y = i * 1.9;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.9, 7, 14, 1, true), this.flameMat);
      flame.rotation.x = Math.PI;
      flame.position.y = -2.6;
      flame.visible = false;
      view.group.add(flame);
      view.group.position.set(x, groundY + (animate ? START_ALT : 0), z);
      this.world.scene.add(view.group);
      this.drops.push({ view, x, z, groundY, t: animate ? 0 : -1, flame });
    }
  }

  update(dt: number, time: number): void {
    this.touchdown = false;
    for (const d of this.drops) {
      if (d.t < 0) continue;
      d.t += dt;
      const k = Math.min(1, d.t / DESCENT_S);
      // fast at first, then a slow final approach
      const alt = START_ALT * Math.pow(1 - k, 2.3);
      d.view.group.position.y = d.groundY + alt;
      d.flame.visible = k < 1;
      d.flame.scale.set(1, 0.7 + 0.5 * Math.sin(time * 50) * 0.3 + (1 - k) * 0.6, 1);
      if (alt < 45 && k < 1) {
        // plume impingement: regolith sprayed out radially along the ground
        const n = Math.round(60 * dt * (1 - alt / 45) * 6);
        const mars = this.world.id === 'mars';
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = 1.5 + Math.random() * 4;
          const v = 6 + Math.random() * 14;
          this.dust.spawn(
            d.x + Math.cos(a) * r,
            d.groundY + 0.15,
            d.z + Math.sin(a) * r,
            Math.cos(a) * v,
            0.6 + Math.random() * 2.2,
            Math.sin(a) * v,
            mars ? 3.5 : 4.5,
            mars ? 1.6 : 0.5,
            mars ? 0.78 : 0.62,
            mars ? 0.47 : 0.61,
            mars ? 0.28 : 0.6,
            mars ? 0.4 : 0.7,
          );
        }
        if (Math.random() < dt * 30) {
          this.sparks.spawn(d.x, d.groundY + alt - 1.5, d.z, (Math.random() - 0.5) * 3, -14, (Math.random() - 0.5) * 3, 0.5, 0.35, 1.4, 2.2, 3.4, 0.9);
        }
      }
      if (k >= 1) {
        d.t = -1;
        d.view.group.position.y = d.groundY;
        this.touchdown = true;
      }
    }
  }
}
