import * as THREE from 'three';
import { clamp01, damp, lerp } from '../core/math';
import type { Kit } from './kit';

/**
 * Procedural astronaut with a fully animated skeleton made of simple joints.
 * The gait changes with gravity: a walk on Mars, a loping bound on the Moon.
 */
export class Astronaut {
  readonly group = new THREE.Group();
  private body = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private foreL = new THREE.Group();
  private foreR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private shinL = new THREE.Group();
  private shinR = new THREE.Group();
  readonly lamp = new THREE.SpotLight(0xe8f1ff, 0, 60, 0.5, 0.55, 1.2);
  private lampTarget = new THREE.Object3D();
  private phase = 0;
  private lean = 0;
  private airBlend = 0;
  private workBlend = 0;
  private thrustMat: THREE.MeshBasicMaterial;
  private nozzles: THREE.Mesh[] = [];

  constructor(k: Kit) {
    const g = this.group;
    g.name = 'astronaut';
    g.add(this.body);
    this.body.position.y = 0.96;
    this.body.add(this.torso);

    const suit = k.suit;
    const dark = k.rubber;
    // torso
    const chest = k.capsule(0.235, 0.34, suit, 0, 0.36, 0);
    chest.scale.set(1.22, 1, 0.92);
    this.torso.add(chest);
    const hip = k.capsule(0.21, 0.1, suit, 0, 0.04, 0);
    hip.scale.set(1.2, 1, 0.95);
    this.torso.add(hip);
    this.torso.add(k.box(0.5, 0.06, 0.34, dark, 0, 0.12, 0));
    // life-support backpack
    this.torso.add(k.box(0.52, 0.68, 0.24, k.hull, 0, 0.42, -0.27));
    this.torso.add(k.box(0.54, 0.08, 0.26, k.accent, 0, 0.68, -0.27));
    this.torso.add(k.cyl(0.07, 0.07, 0.5, k.metal, -0.17, 0.36, -0.42, 8));
    this.torso.add(k.cyl(0.07, 0.07, 0.5, k.metal, 0.17, 0.36, -0.42, 8));
    this.torso.add(k.strut(new THREE.Vector3(0.2, 0.76, -0.3), new THREE.Vector3(0.2, 1.12, -0.3), 0.012, k.metal, 5));
    // chest control unit
    this.torso.add(k.box(0.3, 0.2, 0.09, k.hullDark, 0, 0.36, 0.23));
    const led = k.box(0.05, 0.03, 0.02, k.ledOn, -0.08, 0.4, 0.28);
    this.torso.add(led);
    // mission patch stripes on the shoulders (commander red)
    for (const s of [-1, 1]) this.torso.add(k.sphere(0.13, suit, s * 0.33, 0.58, 0, 10, 8));

    // helmet
    this.head.position.set(0, 0.84, 0.02);
    this.torso.add(this.head);
    this.head.add(k.sphere(0.255, suit, 0, 0, 0, 20, 14));
    const visor = k.sphere(0.225, k.visor, 0, 0.0, 0.06, 20, 14);
    visor.scale.set(0.98, 0.88, 0.95);
    this.head.add(visor);
    const ring = k.torus(0.2, 0.04, k.metal, 0, -0.2, 0);
    ring.rotation.x = Math.PI / 2;
    this.head.add(ring);
    for (const s of [-1, 1]) {
      this.head.add(k.box(0.06, 0.07, 0.1, k.hullDark, s * 0.25, 0.08, 0.06));
      this.head.add(k.box(0.04, 0.04, 0.02, k.lamp, s * 0.25, 0.08, 0.12));
    }
    this.lamp.position.set(0, 0.1, 0.2);
    this.lampTarget.position.set(0, -0.9, 6);
    this.head.add(this.lamp, this.lampTarget);
    this.lamp.target = this.lampTarget;
    this.lamp.castShadow = false;
    // suit running lights: a soft glow so the commander never disappears into a shadow
    const glow = new THREE.PointLight(0xdfe8ff, 7, 9, 1.5);
    glow.position.set(0, 0.5, 0.55);
    glow.castShadow = false;
    this.torso.add(glow);

    // arms
    const arm = (root: THREE.Group, fore: THREE.Group, s: number): void => {
      root.position.set(s * 0.36, 0.56, 0);
      this.torso.add(root);
      root.add(k.capsule(0.085, 0.24, suit, 0, -0.17, 0));
      root.add(k.cyl(0.092, 0.092, 0.06, k.accent, 0, -0.1, 0, 10));
      fore.position.set(0, -0.36, 0);
      root.add(fore);
      fore.add(k.capsule(0.078, 0.22, suit, 0, -0.15, 0));
      fore.add(k.sphere(0.09, dark, 0, -0.33, 0, 10, 8));
      fore.add(k.cyl(0.085, 0.085, 0.04, k.metal, 0, -0.26, 0, 10));
    };
    arm(this.armL, this.foreL, -1);
    arm(this.armR, this.foreR, 1);

    // legs
    const leg = (root: THREE.Group, shin: THREE.Group, s: number): void => {
      root.position.set(s * 0.14, 0, 0);
      this.body.add(root);
      root.add(k.capsule(0.115, 0.26, suit, 0, -0.21, 0));
      root.add(k.cyl(0.122, 0.122, 0.06, k.accent, 0, -0.14, 0, 10));
      shin.position.set(0, -0.44, 0);
      root.add(shin);
      shin.add(k.capsule(0.1, 0.26, suit, 0, -0.2, 0));
      shin.add(k.box(0.19, 0.13, 0.33, k.hullDark, 0, -0.45, 0.05));
      shin.add(k.box(0.2, 0.04, 0.35, dark, 0, -0.52, 0.05));
    };
    leg(this.legL, this.shinL, -1);
    leg(this.legR, this.shinR, 1);

    // jet nozzles
    this.thrustMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const s of [-1, 1]) {
      this.torso.add(k.cyl(0.05, 0.07, 0.1, k.darkMetal, s * 0.2, 0.06, -0.33, 8));
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 8), this.thrustMat);
      flame.position.set(s * 0.2, -0.24, -0.33);
      flame.rotation.x = Math.PI;
      this.nozzles.push(flame);
      this.torso.add(flame);
    }

    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material !== this.thrustMat) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
  }

  /** World position of the boots (for dust) */
  get feet(): THREE.Vector3 {
    return this.group.position;
  }

  /**
   * @param speed horizontal speed m/s
   * @param grounded standing on the surface
   * @param vy vertical speed
   * @param gravity m/s² (sets the gait)
   * @param thrust 0..1 jet pack output
   * @param working 0..1 using a tool on something in front
   */
  animate(dt: number, speed: number, grounded: boolean, vy: number, gravity: number, thrust: number, working: number, darkness: number, time: number): void {
    const lowG = clamp01((4.2 - gravity) / 2.6); // 1 on the Moon, ~0.2 on Mars
    this.airBlend = damp(this.airBlend, grounded ? 0 : 1, grounded ? 14 : 6, dt);
    this.workBlend = damp(this.workBlend, working, 8, dt);
    const moving = clamp01(speed / 1.2);
    const cadence = lerp(2.2, 1.35, lowG) * (0.55 + 0.45 * clamp01(speed / 4));
    this.phase += dt * cadence * Math.PI * 2 * moving;
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    const stride = lerp(0.55, 0.85, clamp01(speed / 5)) * moving;
    const air = this.airBlend;

    // legs: swing + knee bend on the back-swing; tucked slightly in flight
    this.legL.rotation.x = lerp(s * stride, -0.35 + 0.15 * Math.sin(time * 2), air);
    this.legR.rotation.x = lerp(-s * stride, 0.2 + 0.1 * Math.sin(time * 2 + 1), air);
    this.shinL.rotation.x = lerp(Math.max(0, -c) * stride * 1.3 + 0.05, 0.75, air);
    this.shinR.rotation.x = lerp(Math.max(0, c) * stride * 1.3 + 0.05, 0.4, air);
    // arms: counter-swing, raised for balance in flight
    const armSwing = stride * 0.75;
    this.armL.rotation.x = lerp(-s * armSwing, -0.5, air);
    this.armR.rotation.x = lerp(s * armSwing, -0.5, air);
    this.armL.rotation.z = lerp(-0.14, -0.75, air);
    this.armR.rotation.z = lerp(0.14, 0.75, air);
    this.foreL.rotation.x = lerp(-0.3 - Math.max(0, -s) * 0.5 * moving, -0.5, air);
    this.foreR.rotation.x = lerp(-0.3 - Math.max(0, s) * 0.5 * moving, -0.5, air);
    // reaching forward with a tool
    if (this.workBlend > 0.01) {
      const w = this.workBlend;
      const jit = Math.sin(time * 18) * 0.04;
      this.armR.rotation.x = lerp(this.armR.rotation.x, -1.25 + jit, w);
      this.armL.rotation.x = lerp(this.armL.rotation.x, -1.05 - jit, w);
      this.armR.rotation.z = lerp(this.armR.rotation.z, -0.12, w);
      this.armL.rotation.z = lerp(this.armL.rotation.z, 0.12, w);
      this.foreR.rotation.x = lerp(this.foreR.rotation.x, -0.5, w);
      this.foreL.rotation.x = lerp(this.foreL.rotation.x, -0.6, w);
    }
    // body: bob with the stride (a deeper bound in low gravity), lean into motion, breathe when idle
    const bob = Math.abs(s) * lerp(0.04, 0.12, lowG) * moving * (1 - air);
    this.body.position.y = 0.96 + bob - 0.03 * (1 - moving) * (0.5 + 0.5 * Math.sin(time * 1.4));
    this.lean = damp(this.lean, clamp01(speed / 6) * 0.3 + air * clamp01(-vy / 6) * 0.2, 6, dt);
    this.torso.rotation.x = this.lean + this.workBlend * 0.25;
    this.torso.rotation.y = s * 0.08 * moving;
    this.head.rotation.y = -s * 0.05 * moving;

    this.thrustMat.color.setRGB(1.2 * thrust, 2.2 * thrust, 3.2 * thrust);
    for (const n of this.nozzles) {
      n.visible = thrust > 0.02;
      n.scale.y = 0.6 + thrust * (0.8 + 0.4 * Math.sin(time * 60));
    }
    this.lamp.intensity = 260 * clamp01((darkness - 0.3) / 0.5);
  }
}

/** Orbi, the little companion drone that tutors the player and follows them on EVA. */
export class Orbi {
  readonly group = new THREE.Group();
  private eye: THREE.MeshBasicMaterial;
  private ringA: THREE.Mesh;
  private ringB: THREE.Mesh;
  private vel = new THREE.Vector3();
  private t = Math.random() * 10;
  talk = 0;

  constructor(k: Kit) {
    this.group.name = 'orbi';
    this.group.add(k.sphere(0.2, k.hull, 0, 0, 0, 18, 12));
    this.eye = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.8, 2.6) });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), this.eye);
    lens.position.z = 0.185;
    this.group.add(lens);
    const rim = k.torus(0.1, 0.018, k.darkMetal, 0, 0, 0.175, Math.PI * 2, 20);
    this.group.add(rim);
    this.ringA = k.torus(0.29, 0.014, k.metal, 0, 0, 0);
    this.ringB = k.torus(0.33, 0.01, k.accent, 0, 0, 0);
    this.group.add(this.ringA, this.ringB);
    for (const s of [-1, 1]) this.group.add(k.box(0.03, 0.12, 0.03, k.metal, s * 0.12, 0.24, 0));
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material !== this.eye) m.castShadow = true;
    });
  }

  update(dt: number, follow: THREE.Vector3, yaw: number, ground: (x: number, z: number) => number, lookAt: THREE.Vector3): void {
    this.t += dt;
    const want = new THREE.Vector3(follow.x + Math.cos(yaw) * 1.25 - Math.sin(yaw) * 0.4, 0, follow.z - Math.sin(yaw) * 1.25 - Math.cos(yaw) * 0.4);
    want.y = Math.max(follow.y, ground(want.x, want.z)) + 1.9 + 0.12 * Math.sin(this.t * 1.7);
    // critically-damped spring so Orbi drifts and settles rather than snapping
    const k = 26;
    const d = 9;
    const p = this.group.position;
    this.vel.x += ((want.x - p.x) * k - this.vel.x * d) * dt;
    this.vel.y += ((want.y - p.y) * k - this.vel.y * d) * dt;
    this.vel.z += ((want.z - p.z) * k - this.vel.z * d) * dt;
    p.addScaledVector(this.vel, dt);
    this.group.lookAt(lookAt);
    this.ringA.rotation.set(this.t * 1.3, this.t * 0.7, 0);
    this.ringB.rotation.set(-this.t * 0.9, 0.5, this.t * 1.1);
    this.talk = Math.max(0, this.talk - dt);
    const pulse = this.talk > 0 ? 1.6 + 0.9 * Math.sin(this.t * 22) : 1 + 0.15 * Math.sin(this.t * 2.4);
    this.eye.color.setRGB(0.3 * pulse, 1.8 * pulse, 2.6 * pulse);
  }
}
