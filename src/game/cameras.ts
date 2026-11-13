import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../core/math';
import type { Input } from './input';

/** Orbiting overview camera for the command console. */
export class TacticalCamera {
  readonly target = new THREE.Vector3();
  yaw = 0.7;
  pitch = 0.62;
  distance = 85;
  private goalDistance = 85;
  private goal = new THREE.Vector3();
  minDistance = 14;
  maxDistance = 700;
  limitRadius = 1250;

  constructor(private ground: (x: number, z: number) => number) {}

  focus(x: number, z: number, snap = false): void {
    this.goal.set(x, 0, z);
    if (snap) {
      this.target.set(x, this.ground(x, z), z);
    }
  }

  setDistance(d: number, snap = false): void {
    this.goalDistance = clamp(d, this.minDistance, this.maxDistance);
    if (snap) this.distance = this.goalDistance;
  }

  update(input: Input, dt: number, camera: THREE.PerspectiveCamera, allowInput: boolean): void {
    if (allowInput) {
      const pan = this.distance * 0.9 * dt;
      const fx = input.axisX();
      const fy = input.axisY();
      const s = Math.sin(this.yaw);
      const c = Math.cos(this.yaw);
      this.goal.x += (c * fx - s * fy) * pan;
      this.goal.z += (-s * fx - c * fy) * pan;
      if (input.key('KeyQ')) this.yaw += dt * 1.3;
      if (input.key('KeyE')) this.yaw -= dt * 1.3;
      if (input.button(2) || input.button(1)) {
        this.yaw -= input.dx * 0.005;
        this.pitch = clamp(this.pitch + input.dy * 0.004, 0.16, 1.5);
      } else if (input.button(0) && input.dragDist > 6) {
        // drag the ground
        const k = this.distance * 0.0016;
        this.goal.x -= (c * input.dx + s * input.dy) * k;
        this.goal.z -= (-s * input.dx + c * input.dy) * k;
      }
      if (input.wheel && input.overView) this.goalDistance = clamp(this.goalDistance * Math.pow(1.14, input.wheel), this.minDistance, this.maxDistance);
    }
    const r = Math.hypot(this.goal.x, this.goal.z);
    if (r > this.limitRadius) this.goal.multiplyScalar(this.limitRadius / r);
    this.target.x = damp(this.target.x, this.goal.x, 9, dt);
    this.target.z = damp(this.target.z, this.goal.z, 9, dt);
    this.target.y = damp(this.target.y, this.ground(this.target.x, this.target.z), 6, dt);
    this.distance = damp(this.distance, this.goalDistance, 8, dt);
    const cp = Math.cos(this.pitch);
    camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.distance,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * cp * this.distance,
    );
    const minY = this.ground(camera.position.x, camera.position.z) + 2.5;
    if (camera.position.y < minY) camera.position.y = minY;
    camera.lookAt(this.target);
  }
}

/** Third-person chase camera for surface EVA. */
export class FollowCamera {
  yaw = 0;
  pitch = 0.18;
  distance = 6.2;
  private current = new THREE.Vector3();
  private look = new THREE.Vector3();
  private initialised = false;
  sensitivity = 0.0024;

  constructor(private ground: (x: number, z: number) => number) {}

  reset(yaw: number): void {
    this.yaw = yaw;
    this.pitch = 0.18;
    this.initialised = false;
  }

  update(input: Input, dt: number, camera: THREE.PerspectiveCamera, subject: THREE.Vector3, allowInput: boolean): void {
    if (allowInput && (input.locked || input.button(0) || input.button(2))) {
      this.yaw -= input.dx * this.sensitivity;
      this.pitch = clamp(this.pitch + input.dy * this.sensitivity, -0.55, 1.25);
    }
    if (allowInput && input.wheel) this.distance = clamp(this.distance * Math.pow(1.12, input.wheel), 2.6, 16);
    const cp = Math.cos(this.pitch);
    const want = new THREE.Vector3(
      subject.x + Math.sin(this.yaw) * cp * this.distance,
      subject.y + 1.75 + Math.sin(this.pitch) * this.distance,
      subject.z + Math.cos(this.yaw) * cp * this.distance,
    );
    // over-the-shoulder offset
    want.x += Math.cos(this.yaw) * 0.7;
    want.z -= Math.sin(this.yaw) * 0.7;
    const minY = this.ground(want.x, want.z) + 0.45;
    if (want.y < minY) want.y = minY;
    if (!this.initialised) {
      this.current.copy(want);
      this.look.set(subject.x, subject.y + 1.6, subject.z);
      this.initialised = true;
    }
    this.current.x = damp(this.current.x, want.x, 14, dt);
    this.current.y = damp(this.current.y, want.y, 10, dt);
    this.current.z = damp(this.current.z, want.z, 14, dt);
    this.look.x = damp(this.look.x, subject.x + Math.cos(this.yaw) * 0.45, 18, dt);
    this.look.y = damp(this.look.y, subject.y + 1.6, 12, dt);
    this.look.z = damp(this.look.z, subject.z - Math.sin(this.yaw) * 0.45, 18, dt);
    camera.position.copy(this.current);
    camera.lookAt(this.look);
  }
}

/** Blends the camera between two rigs so mode switches are a smooth move, not a cut. */
export class CameraBlend {
  private fromPos = new THREE.Vector3();
  private fromQuat = new THREE.Quaternion();
  private t = 1;
  private duration = 1;

  start(camera: THREE.Camera, duration: number): void {
    this.fromPos.copy(camera.position);
    this.fromQuat.copy(camera.quaternion);
    this.t = 0;
    this.duration = duration;
  }

  get active(): boolean {
    return this.t < 1;
  }

  /** Call after the destination rig has positioned the camera. */
  apply(camera: THREE.Camera, dt: number): void {
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / this.duration);
    const e = this.t * this.t * (3 - 2 * this.t);
    camera.position.lerpVectors(this.fromPos, camera.position, e);
    camera.quaternion.slerpQuaternions(this.fromQuat, camera.quaternion, e);
  }
}

export { dampAngle };
