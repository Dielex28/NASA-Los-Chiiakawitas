import * as THREE from 'three';
import type { Kit } from '../entities/kit';
import { RoverView } from '../entities/rover3d';
import type { Particles } from '../render/particles';
import { Footprints } from '../world/footprints';
import { Vehicle, rotate, type VehicleEnv, type VehicleInput } from './vehicle';

/** Usable energy of the traction batteries, kWh. */
const CAPACITY_KWH = 9;
/** Electronics, thermal control and navigation while switched on, W. */
const HOTEL_WATTS = 120;
/** Motor and drive efficiency. */
const EFFICIENCY = 0.8;
/** Output of the rover's own panel in full Sun, kW. */
const SOLAR_KW = 0.45;
/** Charge rate when plugged into the base, kW. */
const DOCK_KW = 2.5;
/** Distance from the lander within which the rover counts as docked, m. */
export const DOCK_RANGE = 34;

const IDLE: VehicleInput = { throttle: 0, steer: 0, brake: 1 };

/** The rover as the game sees it: physics, model, battery, wheel dust and the tracks it leaves. */
export class RoverUnit {
  readonly vehicle = new Vehicle();
  readonly view: RoverView;
  readonly tracks: Footprints;
  /** State of charge, 0..1. */
  battery = 1;
  /** Electrical power drawn right now, W. */
  draw = 0;
  /** Someone is at the controls. */
  occupied = false;
  private trackGap = [0, 0];
  private last: Array<[number, number]> = [
    [0, 0],
    [0, 0],
  ];
  private seat = new THREE.Vector3();
  private tmpN = new THREE.Vector3();

  constructor(kit: Kit, moon: boolean) {
    this.view = new RoverView(kit, this.vehicle);
    this.tracks = new Footprints(moon ? 0.42 : 0.3, 'tyre', 1500);
  }

  place(x: number, z: number, yaw: number, env: VehicleEnv): void {
    this.vehicle.place(x, z, yaw, env);
    this.battery = 1;
    this.occupied = false;
    this.tracks.clear();
    this.rememberWheels();
    this.view.sync(0, 0);
  }

  private rememberWheels(): void {
    const v = this.vehicle;
    for (let i = 0; i < 2; i++) {
      const off = rotate(v.q, v.wheels[2 + i].mount);
      this.last[i] = [v.pos[0] + off[0], v.pos[2] + off[2]];
    }
    this.trackGap = [0, 0];
  }

  /** Horizontal distance from a point to the rover. */
  distanceTo(x: number, z: number): number {
    return Math.hypot(x - this.vehicle.pos[0], z - this.vehicle.pos[2]);
  }

  /** Where the driver sits (boots of the seated figure), in world space, and the chassis orientation. */
  seatPose(outQuat: THREE.Quaternion): THREE.Vector3 {
    const v = this.vehicle;
    const off = rotate(v.q, [-0.36, -0.68, -0.26]);
    outQuat.set(v.q[0], v.q[1], v.q[2], v.q[3]);
    return this.seat.set(v.pos[0] + off[0], v.pos[1] + off[1], v.pos[2] + off[2]);
  }

  /** A clear spot to step down to, on the driver's side. */
  exitPoint(): [number, number] {
    const v = this.vehicle;
    const off = rotate(v.q, [-1.9, 0, -0.2]);
    return [v.pos[0] + off[0], v.pos[2] + off[2]];
  }

  /**
   * @param input controls, or null when nobody is driving (parking brake on)
   * @param hours mission time elapsed this frame, for charging
   * @param sunlight 0..1 direct Sun on the rover's panel
   * @param docked plugged into the base
   */
  update(
    dt: number,
    input: VehicleInput | null,
    env: VehicleEnv,
    hours: number,
    sunlight: number,
    docked: boolean,
    dust: Particles,
    dustColor: [number, number, number],
    hasAir: boolean,
    darkness: number,
    time: number,
  ): void {
    const v = this.vehicle;
    const flat = this.battery <= 0;
    const control: VehicleInput = input ? { throttle: flat ? 0 : input.throttle, steer: input.steer, brake: input.brake } : IDLE;
    v.step(dt, control, env);

    // energy: real seconds at the wheel count as mission minutes, like everything else on EVA
    this.draw = input ? v.power / EFFICIENCY + HOTEL_WATTS : 0;
    const used = (this.draw / 1000) * (dt / 60);
    const parked = Math.abs(v.speed) < 0.3;
    const gained = parked ? (SOLAR_KW * sunlight + (docked ? DOCK_KW : 0)) * hours : 0;
    this.battery = Math.max(0, Math.min(1, this.battery + (gained - used) / CAPACITY_KWH));

    // dust thrown by the rear wheels: straight parabolas on the Moon, a hanging cloud on Mars
    const speed = Math.abs(v.speed);
    const fwd = v.forward;
    for (let i = 0; i < 2; i++) {
      const w = v.wheels[2 + i];
      const off = rotate(v.q, w.mount);
      const wx = v.pos[0] + off[0];
      const wz = v.pos[2] + off[2];
      if (!w.contact) {
        this.last[i] = [wx, wz];
        continue;
      }
      const gy = env.ground(wx, wz);
      const churn = speed * 0.5 + Math.max(0, w.slip - 0.9) * 6;
      if (churn > 0.7 && Math.random() < dt * churn * 9) {
        const back = -Math.sign(v.speed || 1);
        const sp = 0.25 + Math.random() * 0.45;
        dust.spawn(
          wx + (Math.random() - 0.5) * 0.2,
          gy + 0.06,
          wz + (Math.random() - 0.5) * 0.2,
          fwd[0] * back * churn * sp + (Math.random() - 0.5) * 0.6,
          (0.25 + Math.random() * 0.55) * churn,
          fwd[2] * back * churn * sp + (Math.random() - 0.5) * 0.6,
          hasAir ? 2 + Math.random() * 1.6 : 1.8 + Math.random() * 1.4,
          hasAir ? 0.6 + Math.random() * 0.6 : 0.2 + Math.random() * 0.22,
          dustColor[0],
          dustColor[1],
          dustColor[2],
          hasAir ? 0.34 : 0.65,
        );
      }
      // tracks: one length of tyre print each time the wheel has rolled that far
      const moved = Math.hypot(wx - this.last[i][0], wz - this.last[i][1]);
      this.trackGap[i] += moved;
      this.last[i] = [wx, wz];
      if (this.trackGap[i] > 0.44) {
        this.trackGap[i] = 0;
        const n = env.normal(wx, wz);
        this.tracks.add(wx, gy, wz, v.yaw, this.tmpN.set(n[0], n[1], n[2]));
      }
    }
    this.view.sync(darkness, time);
  }
}
