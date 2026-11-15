import * as THREE from 'three';
import { Rng } from '../core/rng';
import { clamp, damp } from '../core/math';
import { loadCuriosityModel } from '../render/models';

/** Distance at which the astronaut can download the scout's data, metres. */
export const SCOUT_REACH = 4.2;

/**
 * Curiosity's real top speed on flat ground is about 4 cm/s; at that pace a player would never
 * see it move, so here it drives at a third of a metre per second (the journal says so).
 */
const SPEED = 0.33;
/** Turning rate, rad/s: like Curiosity it can turn on the spot. */
const TURN = 0.4;
/** How long it stops at each target, seconds. */
const STUDY = 7.5;

/**
 * The robotic scout of the Mars missions, drawn with NASA's model of Curiosity. It wanders
 * between targets around the base, steers clear of modules and of the astronaut, follows the
 * slope of the ground, and at each stop fires ChemCam: a laser that turns a speck of rock into
 * a spark of plasma whose light tells what the rock is made of. (The laser itself is infrared
 * and invisible; only the spark shows.)
 */
export class Scout {
  readonly group = new THREE.Group();
  readonly pos = new THREE.Vector3();
  yaw = 0;
  private pitch = 0;
  private roll = 0;
  private rng: Rng;
  private goal = new THREE.Vector2();
  private mode: 'drive' | 'study' | 'hold' = 'hold';
  private timer = 3;
  private zapClock = 0;
  private zapAt = new THREE.Vector3();
  private flash: THREE.Mesh;
  private flashMat: THREE.MeshBasicMaterial;
  private light = new THREE.PointLight(0xd8e4ff, 0, 5, 2);
  /** Tilts with the ground; the group itself only carries the position. */
  private body = new THREE.Group();
  private seed: number;

  constructor(
    seed: number,
    private ground: (x: number, z: number) => number,
  ) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.group.name = 'scout';
    this.flashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3.4, 4), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), this.flashMat);
    this.flash.userData.skipAO = true;
    this.flash.visible = false;
    this.light.castShadow = false;
    this.group.add(this.flash, this.light);
    this.reset();
    void loadCuriosityModel().then((g) => {
      if (!g) return;
      const model = g.scene.clone(true);
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      model.name = 'curiosity';
      this.body.add(model);
    });
    this.group.add(this.body);
  }

  /** Park it at the start of a mission: 30 m from the landing site, facing the base. */
  reset(): void {
    this.rng = new Rng(this.seed);
    const a = this.rng.range(0, Math.PI * 2);
    this.pos.set(Math.sin(a) * 30, 0, Math.cos(a) * 30);
    this.pos.y = this.ground(this.pos.x, this.pos.z);
    this.yaw = Math.atan2(-this.pos.x, -this.pos.z);
    this.mode = 'hold';
    this.timer = 4;
    this.flash.visible = false;
    this.light.intensity = 0;
    this.place(1);
  }

  /** Horizontal distance from a point, metres. */
  distanceTo(p: THREE.Vector3): number {
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
  }

  /** Choose the next target: open, gentle ground 20–80 m from the landing site, away from every module. */
  private pickGoal(colliders: Array<[number, number, number]>): void {
    for (let tries = 0; tries < 24; tries++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(20, 80);
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      if (colliders.some((c) => Math.hypot(x - c[0], z - c[1]) < c[2] + 7)) continue;
      const slope = Math.abs(this.ground(x + 2, z) - this.ground(x - 2, z)) + Math.abs(this.ground(x, z + 2) - this.ground(x, z - 2));
      if (slope > 1.2) continue;
      // not too long a drive in one go
      if (Math.hypot(x - this.pos.x, z - this.pos.z) > 55) continue;
      this.goal.set(x, z);
      this.mode = 'drive';
      return;
    }
    this.mode = 'hold';
    this.timer = 3;
  }

  /**
   * @param colliders base modules as [x, z, radius]
   * @param astronaut where the astronaut stands (null when nobody is outside)
   */
  update(dt: number, colliders: Array<[number, number, number]>, astronaut: THREE.Vector3 | null, time: number): void {
    dt = Math.min(dt, 0.1);
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    if (this.mode === 'hold') {
      this.timer -= dt;
      if (this.timer <= 0) this.pickGoal(colliders);
    } else if (this.mode === 'drive') {
      const dx = this.goal.x - this.pos.x;
      const dz = this.goal.y - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.2) {
        this.mode = 'study';
        this.timer = STUDY;
        this.zapClock = 0.8;
      } else {
        let want = Math.atan2(dx, dz);
        // steer around modules that lie ahead
        for (const c of colliders) {
          const ox = c[0] - this.pos.x;
          const oz = c[1] - this.pos.z;
          const d = Math.hypot(ox, oz);
          if (d < c[2] + 6 && ox * fx + oz * fz > 0) want += (ox * fz - oz * fx > 0 ? 1 : -1) * 0.9 * (1 - d / (c[2] + 6));
        }
        let diff = want - this.yaw;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.yaw += clamp(diff, -TURN * dt, TURN * dt);
        // stop for anyone standing in front of it (rovers are cautious drivers)
        let blocked = false;
        if (astronaut) {
          const ax = astronaut.x - this.pos.x;
          const az = astronaut.z - this.pos.z;
          blocked = Math.hypot(ax, az) < 4.5 && ax * fx + az * fz > 0;
        }
        if (!blocked && Math.abs(diff) < 0.6) {
          const v = SPEED * Math.cos(diff) * dt;
          const nx = this.pos.x + Math.sin(this.yaw) * v;
          const nz = this.pos.z + Math.cos(this.yaw) * v;
          // never drive into a module (but always let it drive out, if one was built around it)
          const into = colliders.some((c) => {
            const next = Math.hypot(nx - c[0], nz - c[1]);
            return next < c[2] + 2.6 && next < Math.hypot(this.pos.x - c[0], this.pos.z - c[1]);
          });
          if (into) this.pickGoal(colliders);
          else {
            this.pos.x = nx;
            this.pos.z = nz;
          }
        }
      }
    } else {
      // ChemCam: a few laser shots at a spot of ground a few metres ahead
      this.timer -= dt;
      this.zapClock -= dt;
      if (this.zapClock <= 0) {
        this.zapClock = 1.4;
        const d = 3.2 + this.rng.range(-0.4, 0.6);
        const side = this.rng.range(-0.8, 0.8);
        const x = this.pos.x + fx * d + fz * side;
        const z = this.pos.z + fz * d - fx * side;
        this.zapAt.set(x, this.ground(x, z) + 0.08, z);
      }
      if (this.timer <= 0) {
        this.mode = 'hold';
        this.timer = this.rng.range(2, 6);
      }
    }
    // the spark: a flash of a tenth of a second at each shot
    const k = this.mode === 'study' ? Math.max(0, 1 - (1.4 - this.zapClock) / 0.14) : 0;
    this.flash.visible = k > 0;
    if (k > 0) {
      this.flash.position.copy(this.zapAt).sub(this.group.position);
      this.flash.scale.setScalar(0.6 + 1.6 * (1 - k));
      this.flashMat.opacity = k;
      this.light.position.copy(this.flash.position);
    }
    this.light.intensity = 9 * k;
    this.place(dt, time);
  }

  /** Follow the ground: height from the wheels' footprint, pitch and roll from its slope. */
  private place(dt: number, time = 0): void {
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const L = 1.15;
    const W = 1.05;
    const hF = this.ground(this.pos.x + fx * L, this.pos.z + fz * L);
    const hB = this.ground(this.pos.x - fx * L, this.pos.z - fz * L);
    const hR = this.ground(this.pos.x + fz * W, this.pos.z - fx * W);
    const hL = this.ground(this.pos.x - fz * W, this.pos.z + fx * W);
    const pitch = Math.atan2(hB - hF, 2 * L);
    const roll = Math.atan2(hR - hL, 2 * W);
    const k = dt >= 1 ? 1 : 1 - Math.exp(-6 * dt);
    this.pitch += (pitch - this.pitch) * k;
    this.roll += (roll - this.roll) * k;
    const y = (hF + hB + hR + hL) / 4;
    this.pos.y = dt >= 1 ? y : damp(this.pos.y, y, 8, dt);
    this.group.position.copy(this.pos);
    // a slight sway of the suspension while it drives
    const sway = this.mode === 'drive' ? Math.sin(time * 5.3) * 0.004 : 0;
    this.body.rotation.set(this.pitch + sway, this.yaw, this.roll, 'YXZ');
  }
}
