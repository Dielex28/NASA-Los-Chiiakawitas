/**
 * Rigid-body rover on four independently sprung wheels. No graphics here: the same code runs
 * in the unit tests.
 *
 * Each wheel is a spring and damper between the chassis and the ground. The spring carries
 * the weight; the tyre can push sideways and along the ground only as hard as friction allows,
 * μ·N, where N is the load on that wheel. That one rule is the whole lesson of driving on
 * another world: in one-sixth gravity the rover weighs one-sixth as much, so it grips one-sixth
 * as hard — but it has all of its mass, so it takes six times the distance to stop.
 */

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Rotate v by the unit quaternion q. */
export function rotate(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

const conj = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];

export interface VehicleEnv {
  /** m/s² */
  gravity: number;
  ground: (x: number, z: number) => number;
  normal: (x: number, z: number) => Vec3;
  /** Upright obstacles: [x, z, radius]. */
  colliders?: ReadonlyArray<readonly [number, number, number]>;
}

export interface VehicleInput {
  /** −1 (reverse) … 1 (forward) */
  throttle: number;
  /** −1 (left) … 1 (right) */
  steer: number;
  /** 0 … 1 */
  brake: number;
}

export interface Wheel {
  /** Mount point in the chassis frame (x right, y up, z forward), m. */
  mount: Vec3;
  steered: boolean;
  /** Spring compression, m. */
  compression: number;
  contact: boolean;
  /** Load carried, N. */
  load: number;
  /** Rotation of the wheel about its axle, rad (for drawing). */
  spin: number;
  /** How much of the available grip is in use, 0…1+ (above 1 the tyre is sliding). */
  slip: number;
}

export interface VehicleSpec {
  /** kg, with crew */
  mass: number;
  /** Half-distances between wheels, m. */
  halfTrack: number;
  halfBase: number;
  wheelRadius: number;
  /** Distance from mount to wheel centre with the spring unloaded, m. */
  restLength: number;
  /** Suspension travel before the bump stop, m. */
  travel: number;
  /** Tyre-on-regolith friction coefficient. */
  grip: number;
  /** Rolling resistance as a fraction of the load (soft soil). */
  rolling: number;
  /** Peak drive force of all motors together, N. */
  driveForce: number;
  /** m/s */
  topSpeed: number;
  /** Compression under the rover's own weight that the springs are sized for, m. */
  staticSag: number;
}

/** A light, open two-seat rover in the spirit of the Apollo Lunar Roving Vehicle. */
export const ROVER: VehicleSpec = {
  mass: 620,
  halfTrack: 0.95,
  halfBase: 1.15,
  wheelRadius: 0.41,
  restLength: 0.38,
  travel: 0.3,
  grip: 0.72,
  rolling: 0.06,
  driveForce: 1500,
  topSpeed: 9.5,
  staticSag: 0.07,
};

const STEP = 1 / 240;

export class Vehicle {
  pos: Vec3 = [0, 0, 0];
  vel: Vec3 = [0, 0, 0];
  /** Orientation of the chassis. */
  q: Quat = [0, 0, 0, 1];
  /** Angular velocity, world frame, rad/s. */
  w: Vec3 = [0, 0, 0];
  /** Current angle of the steered wheels, rad (positive turns right). */
  steerAngle = 0;
  readonly wheels: Wheel[];
  /** Mechanical power delivered by the motors over the last step, W. */
  power = 0;
  private carry = 0;
  /** Spring rate and damping per wheel, set for the gravity the rover was built for. */
  private k = 6000;
  private c = 1000;
  private inertia: Vec3;

  constructor(readonly spec: VehicleSpec = ROVER) {
    const { halfTrack: t, halfBase: b } = spec;
    const wheel = (x: number, z: number, steered: boolean): Wheel => ({ mount: [x, -0.12, z], steered, compression: 0, contact: false, load: 0, spin: 0, slip: 0 });
    this.wheels = [wheel(-t, b, true), wheel(t, b, true), wheel(-t, -b, false), wheel(t, -b, false)];
    // a box 2 × 0.8 × 3 m with the rover's mass
    const m = spec.mass / 12;
    this.inertia = [m * (0.8 ** 2 + 3 ** 2), m * (2 ** 2 + 3 ** 2), m * (2 ** 2 + 0.8 ** 2)];
  }

  /** Height of the chassis origin above flat ground when resting on its springs. */
  get rideHeight(): number {
    return 0.12 + this.spec.restLength + this.spec.wheelRadius - this.spec.staticSag;
  }

  /** Put the rover down at rest, level, heading `yaw` (0 = +z, positive toward +x). */
  place(x: number, z: number, yaw: number, env: VehicleEnv): void {
    this.tune(env.gravity);
    this.pos = [x, env.ground(x, z) + this.rideHeight, z];
    this.vel = [0, 0, 0];
    this.w = [0, 0, 0];
    this.q = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
    this.steerAngle = 0;
    for (const wh of this.wheels) wh.compression = this.spec.staticSag;
  }

  /** Springs are chosen for the world: the same sag under the local weight, about 55 % of critical damping. */
  tune(gravity: number): void {
    const quarter = this.spec.mass / 4;
    this.k = (quarter * gravity) / this.spec.staticSag;
    this.c = 2 * 0.55 * Math.sqrt(this.k * quarter);
  }

  get forward(): Vec3 {
    return rotate(this.q, [0, 0, 1]);
  }
  get up(): Vec3 {
    return rotate(this.q, [0, 1, 0]);
  }
  get right(): Vec3 {
    return rotate(this.q, [1, 0, 0]);
  }
  /** Heading, rad (0 = +z, positive toward +x). */
  get yaw(): number {
    const f = this.forward;
    return Math.atan2(f[0], f[2]);
  }
  /** Speed along the nose, m/s (negative in reverse). */
  get speed(): number {
    return dot(this.vel, this.forward);
  }
  /** True when at least one wheel is on the ground. */
  get grounded(): boolean {
    return this.wheels.some((w) => w.contact);
  }
  /** Largest share of grip in use on any wheel: above 1 the rover is sliding. */
  get slip(): number {
    return Math.max(...this.wheels.map((w) => (w.contact ? w.slip : 0)));
  }

  /** Advance by `dt` seconds in fixed sub-steps. */
  step(dt: number, input: VehicleInput, env: VehicleEnv): void {
    this.carry += Math.min(dt, 0.2);
    while (this.carry >= STEP) {
      this.carry -= STEP;
      this.integrate(STEP, input, env);
    }
  }

  private integrate(h: number, input: VehicleInput, env: VehicleEnv): void {
    const s = this.spec;
    const quarter = s.mass / 4;
    const fwd = this.forward;
    const speed = dot(this.vel, fwd);

    // steering eases toward the commanded angle and narrows with speed
    const lock = 0.52 / (1 + Math.abs(speed) / 5);
    const want = Math.max(-1, Math.min(1, input.steer)) * lock;
    const rate = 1.6 * h;
    this.steerAngle += Math.max(-rate, Math.min(rate, want - this.steerAngle));

    let fx = 0;
    let fy = -s.mass * env.gravity;
    let fz = 0;
    let tx = 0;
    let ty = 0;
    let tz = 0;
    let power = 0;
    const reach = s.restLength + s.wheelRadius;
    const throttle = Math.max(-1, Math.min(1, input.throttle));
    const brake = Math.max(0, Math.min(1, input.brake));

    for (const wh of this.wheels) {
      const off = rotate(this.q, wh.mount);
      const px = this.pos[0] + off[0];
      const py = this.pos[1] + off[1];
      const pz = this.pos[2] + off[2];
      const gh = env.ground(px, pz);
      const comp = reach - (py - gh);
      if (comp <= 0) {
        wh.contact = false;
        wh.compression = 0;
        wh.load = 0;
        wh.slip = 0;
        continue;
      }
      wh.contact = true;
      wh.compression = Math.min(comp, s.travel);
      const n = env.normal(px, pz);
      // arm from the centre of mass to the contact patch, and the patch's velocity
      const r: Vec3 = [off[0], gh - this.pos[1], off[2]];
      const wr = cross(this.w, r);
      const vc: Vec3 = [this.vel[0] + wr[0], this.vel[1] + wr[1], this.vel[2] + wr[2]];
      const closing = -dot(vc, n);
      // spring + damper, plus a stiff bump stop at the end of the travel
      let load = this.k * wh.compression + this.c * closing;
      if (comp > s.travel) load += this.k * 12 * (comp - s.travel);
      load = Math.max(0, load);
      wh.load = load;

      // tyre axes on the ground plane
      const ang = wh.steered ? this.steerAngle : 0;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const rt = this.right;
      const heading: Vec3 = [fwd[0] * ca + rt[0] * sa, fwd[1] * ca + rt[1] * sa, fwd[2] * ca + rt[2] * sa];
      const hn = dot(heading, n);
      let f: Vec3 = [heading[0] - hn * n[0], heading[1] - hn * n[1], heading[2] - hn * n[2]];
      const fl = Math.hypot(f[0], f[1], f[2]) || 1;
      f = [f[0] / fl, f[1] / fl, f[2] / fl];
      const l = cross(n, f);
      const vLong = dot(vc, f);
      const vLat = dot(vc, l);

      // what the tyre would like to do…
      let long = 0;
      if (Math.abs(throttle) > 0.01) {
        const along = vLong * Math.sign(throttle);
        const taper = along > 0 ? Math.max(0, 1 - (along / s.topSpeed) ** 2) : 1;
        long += (throttle * s.driveForce * taper) / 4;
      }
      const drive = long;
      // brakes and rolling resistance oppose the motion and cannot reverse it within a step
      const stop = Math.min((brake * 0.9 + s.rolling) * load + (Math.abs(throttle) < 0.01 ? 0.25 * load : 0), (quarter * Math.abs(vLong)) / h);
      long -= Math.sign(vLong) * stop;
      let lat = (-quarter * vLat) / 0.07;
      // …and what friction allows: one circle of radius μ·N for both directions together
      const limit = s.grip * load;
      const want2 = Math.hypot(long, lat);
      wh.slip = limit > 1e-6 ? want2 / limit : 0;
      if (want2 > limit && want2 > 1e-9) {
        const k = limit / want2;
        long *= k;
        lat *= k;
      }
      // work done by the motor on this wheel (none while coasting or braking)
      if (Math.abs(drive) > 1e-9) power += Math.max(0, long * vLong);
      wh.spin += (vLong / s.wheelRadius) * h;

      const wx = load * n[0] + long * f[0] + lat * l[0];
      const wy = load * n[1] + long * f[1] + lat * l[1];
      const wz = load * n[2] + long * f[2] + lat * l[2];
      fx += wx;
      fy += wy;
      fz += wz;
      const tq = cross(r, [wx, wy, wz]);
      tx += tq[0];
      ty += tq[1];
      tz += tq[2];
    }
    this.power = power;

    // linear motion
    this.vel[0] += (fx / s.mass) * h;
    this.vel[1] += (fy / s.mass) * h;
    this.vel[2] += (fz / s.mass) * h;
    // rotation, in the chassis frame where the inertia tensor is diagonal
    const inv = conj(this.q);
    const wb = rotate(inv, this.w);
    const tb = rotate(inv, [tx, ty, tz]);
    const I = this.inertia;
    const gyro = cross(wb, [I[0] * wb[0], I[1] * wb[1], I[2] * wb[2]]);
    wb[0] += ((tb[0] - gyro[0]) / I[0]) * h;
    wb[1] += ((tb[1] - gyro[1]) / I[1]) * h;
    wb[2] += ((tb[2] - gyro[2]) / I[2]) * h;
    const damp = Math.exp(-0.35 * h);
    this.w = rotate(this.q, [wb[0] * damp, wb[1] * damp, wb[2] * damp]);

    this.pos[0] += this.vel[0] * h;
    this.pos[1] += this.vel[1] * h;
    this.pos[2] += this.vel[2] * h;
    // q ← q + ½·h·(ω ⊗ q)
    const [qx, qy, qz, qw] = this.q;
    const [ox, oy, oz] = this.w;
    const nq: Quat = [
      qx + 0.5 * h * (ox * qw + oy * qz - oz * qy),
      qy + 0.5 * h * (oy * qw + oz * qx - ox * qz),
      qz + 0.5 * h * (oz * qw + ox * qy - oy * qx),
      qw + 0.5 * h * (-ox * qx - oy * qy - oz * qz),
    ];
    const len = Math.hypot(nq[0], nq[1], nq[2], nq[3]) || 1;
    this.q = [nq[0] / len, nq[1] / len, nq[2] / len, nq[3] / len];

    // the belly cannot sink into the ground
    const floor = env.ground(this.pos[0], this.pos[2]) + 0.22;
    if (this.pos[1] < floor) {
      this.pos[1] = floor;
      if (this.vel[1] < 0) this.vel[1] = 0;
      this.vel[0] *= Math.exp(-3 * h);
      this.vel[2] *= Math.exp(-3 * h);
    }
    // upright obstacles stop it dead along their normal
    if (env.colliders) {
      for (const c of env.colliders) {
        const dx = this.pos[0] - c[0];
        const dz = this.pos[2] - c[1];
        const rr = c[2] + 1.25;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-9) {
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const nz = dz / d;
          this.pos[0] = c[0] + nx * rr;
          this.pos[2] = c[1] + nz * rr;
          const vn = this.vel[0] * nx + this.vel[2] * nz;
          if (vn < 0) {
            this.vel[0] -= vn * nx;
            this.vel[2] -= vn * nz;
          }
        }
      }
    }
  }

  /** Stand the rover back on its wheels where it is (after a roll-over). */
  recover(env: VehicleEnv): void {
    this.place(this.pos[0], this.pos[2], this.yaw, env);
  }

  /** True when the rover is on its side or its back. */
  get overturned(): boolean {
    return this.up[1] < 0.25;
  }
}

/** Distance to stop from `speed` with locked wheels on level ground: v² / (2·μ·g). */
export function stoppingDistance(speed: number, grip: number, gravity: number): number {
  return (speed * speed) / (2 * grip * gravity);
}
