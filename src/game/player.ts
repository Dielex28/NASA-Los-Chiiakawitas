import * as THREE from 'three';
import { clamp, clamp01, damp, dampAngle } from '../core/math';
import { Astronaut } from '../entities/astronaut';
import type { Kit } from '../entities/kit';
import type { Particles } from '../render/particles';
import type { Input } from './input';

export interface PlayerEnv {
  ground: (x: number, z: number) => number;
  normal: (x: number, z: number, out: THREE.Vector3) => THREE.Vector3;
  gravity: number;
  /** [x, z, radius] circles that block walking. */
  colliders: Array<[number, number, number]>;
  dust: Particles;
  dustColor: [number, number, number];
  hasAir: boolean;
  limitRadius: number;
  onStep?: (strength: number) => void;
  /** A boot came down at (x, z) heading `yaw`. */
  onPrint?: (x: number, z: number, yaw: number) => void;
  onLand?: (strength: number) => void;
  onJet?: (on: boolean) => void;
}

const WALK = 3.1;
const RUN = 5.8;
const JUMP_V = 2.95;

/** The commander on the surface: movement, jumping and a small jet pack, tuned by gravity. */
export class Player {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly astronaut: Astronaut;
  yaw = 0;
  grounded = true;
  /** 0..1 */
  fuel = 1;
  thrust = 0;
  /** Set by the interaction system while a tool is in use. */
  working = 0;
  faceTarget: THREE.Vector3 | null = null;
  private airTime = 0;
  private stepAcc = 0;
  private n = new THREE.Vector3();
  private jetting = false;
  private stepSide = 1;
  outOfBounds = false;

  constructor(kit: Kit) {
    this.astronaut = new Astronaut(kit);
  }

  place(x: number, z: number, yaw: number, ground: (x: number, z: number) => number): void {
    this.pos.set(x, ground(x, z), z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.grounded = true;
    this.astronaut.group.position.copy(this.pos);
    this.astronaut.group.rotation.y = yaw;
  }

  update(dt: number, input: Input | null, camYaw: number, env: PlayerEnv, darkness: number, time: number): void {
    const g = env.gravity;
    let mx = 0;
    let mz = 0;
    let wantRun = false;
    let wantJump = false;
    let holdJump = false;
    if (input && this.working < 0.5) {
      const ax = input.axisX();
      const ay = input.axisY();
      // camera sits at +(sin, cos)·d from the player, so "forward" is −(sin, cos)
      const fx = -Math.sin(camYaw);
      const fz = -Math.cos(camYaw);
      mx = fx * ay + -fz * ax;
      mz = fz * ay + fx * ax;
      const len = Math.hypot(mx, mz);
      if (len > 1) {
        mx /= len;
        mz /= len;
      }
      wantRun = input.key('ShiftLeft') || input.key('ShiftRight');
      wantJump = input.hit('Space');
      holdJump = input.key('Space');
    }
    const speedGoal = wantRun ? RUN : WALK;
    const tx = mx * speedGoal;
    const tz = mz * speedGoal;

    // traction scales with weight: less grip on the Moon, so starts and stops are lazier
    const grip = this.grounded ? 5 + 2.4 * g : 1.6;
    this.vel.x = damp(this.vel.x, tx, grip, dt);
    this.vel.z = damp(this.vel.z, tz, grip, dt);

    if (this.grounded) {
      this.fuel = Math.min(1, this.fuel + dt * 0.14);
      env.normal(this.pos.x, this.pos.z, this.n);
      // too steep to stand: slide downhill
      if (this.n.y < 0.74) {
        const slide = (0.74 - this.n.y) * 26;
        this.vel.x += this.n.x * slide * dt;
        this.vel.z += this.n.z * slide * dt;
      }
      if (wantJump) {
        this.vel.y = JUMP_V;
        this.grounded = false;
        this.airTime = 0;
        env.onStep?.(1.2);
        this.puff(env, 10, 1.4);
      }
    }

    let thrust = 0;
    if (!this.grounded) {
      this.airTime += dt;
      if (holdJump && this.airTime > 0.22 && this.fuel > 0) {
        thrust = 1;
        this.fuel = Math.max(0, this.fuel - dt * 0.3);
        this.vel.y += (g + 3.2) * dt;
        this.vel.y = Math.min(this.vel.y, 5.5);
        if (Math.random() < dt * 40) {
          const [r, gg, b] = env.dustColor;
          void r;
          void gg;
          void b;
        }
      }
      this.vel.y -= g * dt;
    }
    this.thrust = damp(this.thrust, thrust, 14, dt);
    if (thrust > 0 !== this.jetting) {
      this.jetting = thrust > 0;
      env.onJet?.(this.jetting);
    }

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    // obstacles
    for (const c of env.colliders) {
      const dx = this.pos.x - c[0];
      const dz = this.pos.z - c[1];
      const r = c[2] + 0.38;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        this.pos.x = c[0] + (dx / d) * r;
        this.pos.z = c[1] + (dz / d) * r;
        const vn = (this.vel.x * dx + this.vel.z * dz) / d;
        if (vn < 0) {
          this.vel.x -= (dx / d) * vn;
          this.vel.z -= (dz / d) * vn;
        }
      }
    }
    const rad = Math.hypot(this.pos.x, this.pos.z);
    this.outOfBounds = rad > env.limitRadius - 60;
    if (rad > env.limitRadius) {
      this.pos.x *= env.limitRadius / rad;
      this.pos.z *= env.limitRadius / rad;
    }

    const gy = env.ground(this.pos.x, this.pos.z);
    if (this.grounded) {
      // stay glued to the ground while walking over bumps and down slopes
      if (this.pos.y - gy < 0.45 || this.vel.y <= 0) {
        this.pos.y = gy;
        this.vel.y = 0;
      }
      if (this.pos.y - gy > 0.45) this.grounded = false;
    } else if (this.pos.y <= gy && this.vel.y <= 0) {
      const impact = -this.vel.y;
      this.pos.y = gy;
      this.vel.y = 0;
      this.grounded = true;
      if (impact > 0.8) {
        env.onLand?.(clamp01(impact / 5));
        this.puff(env, Math.round(8 + impact * 5), 0.9 + impact * 0.35);
        for (const side of [-1, 1]) {
          env.onPrint?.(this.pos.x + Math.cos(this.yaw) * 0.13 * side, this.pos.z - Math.sin(this.yaw) * 0.13 * side, this.yaw);
        }
      }
    }

    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.faceTarget && this.working > 0.2) {
      this.yaw = dampAngle(this.yaw, Math.atan2(this.faceTarget.x - this.pos.x, this.faceTarget.z - this.pos.z), 10, dt);
    } else if (speed > 0.4 && (mx !== 0 || mz !== 0)) {
      this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 9, dt);
    }

    // footfalls
    if (this.grounded && speed > 0.6) {
      this.stepAcc += dt * speed * (0.5 + 0.12 * g);
      if (this.stepAcc > 1) {
        this.stepAcc = 0;
        env.onStep?.(clamp(speed / RUN, 0.3, 1));
        this.puff(env, 5, 0.7 + speed * 0.12);
        // left, right, left… each print offset to its side of the line of travel
        this.stepSide = -this.stepSide;
        const ox = Math.cos(this.yaw) * 0.13 * this.stepSide;
        const oz = -Math.sin(this.yaw) * 0.13 * this.stepSide;
        env.onPrint?.(this.pos.x + ox, this.pos.z + oz, this.yaw);
      }
    }
    // jet wash
    if (this.thrust > 0.3 && this.pos.y - gy < 3.5 && Math.random() < dt * 60) {
      const [r, gg, b] = env.dustColor;
      const a = Math.random() * 6.283;
      const v = 1.5 + Math.random() * 2.5;
      env.dust.spawn(this.pos.x, gy + 0.05, this.pos.z, Math.cos(a) * v, 0.5 + Math.random() * 1.2, Math.sin(a) * v, 2.4, 0.5, r, gg, b, 0.5);
    }

    const a = this.astronaut;
    a.group.position.copy(this.pos);
    a.group.rotation.y = this.yaw;
    a.animate(dt, speed, this.grounded, this.vel.y, g, this.thrust, this.working, darkness, time);
  }

  private puff(env: PlayerEnv, count: number, energy: number): void {
    const [r, g, b] = env.dustColor;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 6.283;
      const v = (0.4 + Math.random() * 1.3) * energy;
      env.dust.spawn(
        this.pos.x + Math.cos(a) * 0.15,
        this.pos.y + 0.04,
        this.pos.z + Math.sin(a) * 0.15,
        Math.cos(a) * v - this.vel.x * 0.25,
        (0.5 + Math.random() * 1.4) * energy,
        Math.sin(a) * v - this.vel.z * 0.25,
        env.hasAir ? 1.6 + Math.random() * 1.4 : 1.8 + Math.random() * 1.6,
        env.hasAir ? 0.5 + Math.random() * 0.5 : 0.18 + Math.random() * 0.2,
        r,
        g,
        b,
        env.hasAir ? 0.38 : 0.7,
      );
    }
  }
}
