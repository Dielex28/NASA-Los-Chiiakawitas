import * as THREE from 'three';
import { clamp01, damp, lerp } from '../core/math';
import { labelTexture, type Kit } from './kit';

/**
 * Procedural astronaut in a surface suit, built joint by joint so every part can move:
 * hard upper torso with a chest display, bearing rings at waist, shoulders, wrists and
 * neck, bellows at elbows and knees, gloves with fingers, lugged boots, a life-support
 * backpack with hoses, and a helmet with a gold sun visor that mirrors the landscape.
 * Lower legs and boots are stained with the local dust, as every surface suit ends up.
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
  private screenMat: THREE.MeshBasicMaterial;
  private glow = new THREE.PointLight(0xdfe8ff, 0, 9, 1.5);

  constructor(k: Kit) {
    const g = this.group;
    g.name = 'astronaut';
    g.add(this.body);
    this.body.position.y = 0.98;
    this.body.add(this.torso);
    const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
    /** Ring whose axis runs along X (around a limb pointing sideways) or Y (around a vertical limb). */
    const ring = (R: number, tube: number, mat: THREE.Material, axis: 'x' | 'y', x: number, y: number, z: number): THREE.Mesh => {
      const m = k.torus(R, tube, mat, x, y, z, Math.PI * 2, 24);
      if (axis === 'x') m.rotation.y = Math.PI / 2;
      else m.rotation.x = Math.PI / 2;
      return m;
    };
    const tapered = (rTop: number, rBot: number, len: number, mat: THREE.Material, y: number): THREE.Mesh => k.cyl(rTop, rBot, len, mat, 0, y, 0, 18);

    /* ---------------------------------------------------------- torso */
    const t = this.torso;
    const brief = k.sphere(1, k.suit, 0, 0.05, 0, 20, 14);
    brief.scale.set(0.215, 0.15, 0.17);
    t.add(brief);
    const waist = ring(0.2, 0.024, k.ring, 'y', 0, 0.17, 0);
    waist.scale.set(1, 0.84, 1);
    t.add(waist);
    // hard upper torso: a rigid shell that the arms, helmet and backpack all bolt on to
    const hut = k.sphere(1, k.shell, 0, 0.43, 0, 28, 20);
    hut.scale.set(0.285, 0.3, 0.215);
    t.add(hut);
    t.add(k.box(0.3, 0.3, 0.06, k.shell, 0, 0.42, -0.17));
    // display and control module on the chest
    t.add(k.box(0.27, 0.19, 0.1, k.hullDark, 0, 0.37, 0.215));
    this.screenMat = new THREE.MeshBasicMaterial({
      map: labelTexture(
        [
          { text: 'O₂ 98 %', size: 34, color: '#7bd88f' },
          { text: 'CO₂ 0.4', size: 26, color: '#e6eaee', weight: 400 },
        ],
        '#05080b',
        256,
        128,
      ),
      color: new THREE.Color(1.5, 1.5, 1.5),
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.055), this.screenMat);
    screen.position.set(-0.06, 0.41, 0.267);
    t.add(screen);
    for (let i = 0; i < 3; i++) {
      const knob = k.cyl(0.013, 0.013, 0.02, k.metal, 0.03 + i * 0.038, 0.42, 0.272, 10);
      knob.rotation.x = Math.PI / 2;
      t.add(knob);
    }
    t.add(k.box(0.1, 0.03, 0.012, k.accent, 0.07, 0.345, 0.268));
    const gauge = k.cyl(0.024, 0.024, 0.012, k.metal, -0.085, 0.335, 0.268, 14);
    gauge.rotation.x = Math.PI / 2;
    t.add(gauge);
    const tag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 0.03),
      new THREE.MeshStandardMaterial({ map: labelTexture([{ text: 'V. CRUZ', size: 40, color: '#ffffff' }], '#a8361c', 256, 64), roughness: 0.9 }),
    );
    tag.position.set(0, 0.56, 0.213);
    tag.rotation.x = -0.32;
    t.add(tag);
    // shoulder bearings
    for (const sd of [-1, 1]) t.add(ring(0.108, 0.02, k.ring, 'x', sd * 0.292, 0.555, 0));

    /* ------------------------------------------- life-support backpack */
    const pack = new THREE.Group();
    pack.position.set(0, 0.46, -0.3);
    t.add(pack);
    pack.add(k.box(0.5, 0.7, 0.23, k.shell, 0, 0, 0));
    const packTop = k.cyl(0.115, 0.115, 0.5, k.shell, 0, 0.35, 0, 16);
    packTop.rotation.z = Math.PI / 2;
    pack.add(packTop);
    pack.add(k.box(0.52, 0.07, 0.25, k.accent, 0, 0.24, 0));
    pack.add(k.box(0.42, 0.13, 0.19, k.hullDark, 0, -0.3, -0.03));
    for (const sd of [-1, 1]) {
      pack.add(k.cyl(0.055, 0.055, 0.5, k.metal, sd * 0.19, -0.05, -0.135, 12));
      pack.add(k.box(0.03, 0.56, 0.012, k.hazard, sd * 0.245, 0, 0.06));
      // umbilical from the pack to the helmet ring
      const hose = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(sd * 0.17, 0.3, 0.1), V(sd * 0.24, 0.4, 0.2), V(sd * 0.2, 0.33, 0.3), V(sd * 0.13, 0.22, 0.33)]), 14, 0.017, 6),
        k.rubber,
      );
      pack.add(hose);
    }
    const placard = new THREE.Mesh(
      new THREE.PlaneGeometry(0.26, 0.13),
      new THREE.MeshStandardMaterial({
        map: labelTexture(
          [
            { text: 'HELIOS', size: 46, color: '#16181b' },
            { text: 'PLSS · 01', size: 24, color: '#16181b', weight: 400 },
          ],
          '#ecebe6',
          256,
          128,
          '#a8361c',
        ),
        roughness: 0.8,
      }),
    );
    placard.position.set(0, 0.02, -0.117);
    placard.rotation.y = Math.PI;
    pack.add(placard);
    pack.add(k.strut(V(0.2, 0.4, -0.05), V(0.2, 0.74, -0.05), 0.008, k.metal, 5));
    pack.add(k.sphere(0.014, k.accent, 0.2, 0.75, -0.05, 8, 6));

    /* ----------------------------------------------------------- helmet */
    const hd = this.head;
    hd.position.set(0, 0.86, 0.025);
    t.add(hd);
    const neck = ring(0.185, 0.03, k.ring, 'y', 0, -0.2, 0);
    hd.add(neck);
    hd.add(k.cyl(0.19, 0.2, 0.07, k.shell, 0, -0.245, 0, 24));
    // pressure bubble (dark inside), gold sun visor in front, white housing over the top and back
    hd.add(k.sphere(0.24, k.darkMetal, 0, 0, 0, 28, 20));
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.252, 40, 24, -0.26, Math.PI + 0.52, 0.42, 1.72), k.visor);
    hd.add(visor);
    const back = new THREE.Mesh(new THREE.SphereGeometry(0.262, 32, 20, Math.PI + 0.2, Math.PI - 0.4, 0, 2.5), k.shell);
    hd.add(back);
    const brow = new THREE.Mesh(new THREE.SphereGeometry(0.264, 32, 8, 0, Math.PI * 2, 0, 0.5), k.shell);
    hd.add(brow);
    for (const sd of [-1, 1]) {
      hd.add(k.box(0.05, 0.075, 0.11, k.hullDark, sd * 0.262, 0.07, 0.04));
      hd.add(k.box(0.036, 0.045, 0.014, k.lamp, sd * 0.262, 0.07, 0.1));
      const cam = k.cyl(0.016, 0.016, 0.05, k.darkMetal, sd * 0.262, 0.12, 0.07, 8);
      cam.rotation.x = Math.PI / 2;
      hd.add(cam);
    }
    this.lamp.position.set(0, 0.1, 0.2);
    this.lampTarget.position.set(0, -0.9, 6);
    hd.add(this.lamp, this.lampTarget);
    this.lamp.target = this.lampTarget;
    this.lamp.castShadow = false;
    // suit running lights: a soft glow so the commander never disappears into a shadow
    this.glow.position.set(0, 0.5, 0.7);
    this.glow.castShadow = false;
    t.add(this.glow);

    /* ------------------------------------------------------------- arms */
    const arm = (root: THREE.Group, fore: THREE.Group, sd: number): void => {
      root.position.set(sd * 0.335, 0.555, 0);
      t.add(root);
      root.add(k.sphere(0.107, k.suit, 0, 0, 0, 16, 12));
      root.add(tapered(0.092, 0.082, 0.24, k.suit, -0.17));
      root.add(tapered(0.095, 0.095, 0.045, k.accent, -0.1)); // commander's red band
      // elbow: convoluted bellows let a pressurised sleeve bend
      root.add(ring(0.084, 0.013, k.suit, 'y', 0, -0.285, 0));
      root.add(k.sphere(0.086, k.suit, 0, -0.33, 0, 14, 10));
      root.add(ring(0.084, 0.013, k.suit, 'y', 0, -0.375, 0));
      fore.position.set(0, -0.35, 0);
      root.add(fore);
      fore.add(tapered(0.08, 0.07, 0.22, k.suit, -0.13));
      fore.add(ring(0.066, 0.017, k.ring, 'y', 0, -0.255, 0));
      // glove
      const palm = k.sphere(1, k.glove, 0, -0.325, 0.004, 12, 10);
      palm.scale.set(0.056, 0.066, 0.036);
      fore.add(palm);
      for (let f = 0; f < 4; f++) {
        const finger = k.capsule(0.0135, 0.05, k.glove, (f - 1.5) * 0.027, -0.405, 0.012);
        finger.rotation.x = 0.35;
        fore.add(finger);
      }
      const thumb = k.capsule(0.015, 0.04, k.glove, sd * -0.055, -0.335, 0.03);
      thumb.rotation.set(0.5, 0, sd * 0.9);
      fore.add(thumb);
    };
    arm(this.armL, this.foreL, -1);
    arm(this.armR, this.foreR, 1);
    const patchMat = new THREE.MeshStandardMaterial({ map: missionPatch(), transparent: true, roughness: 0.9 });
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.085), patchMat);
    patch.position.set(-0.097, -0.2, 0);
    patch.rotation.y = -Math.PI / 2;
    this.armL.add(patch);

    /* ------------------------------------------------------------- legs */
    const leg = (root: THREE.Group, shin: THREE.Group, sd: number): void => {
      root.position.set(sd * 0.125, 0, 0);
      this.body.add(root);
      root.add(k.sphere(0.126, k.suit, 0, -0.02, 0, 16, 12));
      root.add(tapered(0.122, 0.104, 0.34, k.suit, -0.22));
      root.add(tapered(0.125, 0.123, 0.045, k.accent, -0.13));
      root.add(ring(0.106, 0.014, k.suit, 'y', 0, -0.385, 0));
      root.add(k.sphere(0.108, k.suit, 0, -0.44, 0, 14, 10));
      root.add(ring(0.104, 0.014, k.suitDust, 'y', 0, -0.495, 0));
      shin.position.set(0, -0.45, 0);
      root.add(shin);
      shin.add(tapered(0.1, 0.09, 0.32, k.suitDust, -0.2));
      shin.add(ring(0.094, 0.016, k.ring, 'y', 0, -0.365, 0));
      // boot: insulated upper, moulded toe, lugged sole
      shin.add(tapered(0.098, 0.106, 0.11, k.suitDust, -0.425));
      const foot = k.capsule(0.078, 0.15, k.suitDust, 0, -0.46, 0.055);
      foot.rotation.x = Math.PI / 2;
      foot.scale.set(1.08, 1, 0.78);
      shin.add(foot);
      shin.add(k.box(0.185, 0.034, 0.33, k.rubber, 0, -0.513, 0.055));
      for (let i = 0; i < 5; i++) shin.add(k.box(0.185, 0.014, 0.03, k.rubber, 0, -0.534, -0.075 + i * 0.065));
    };
    leg(this.legL, this.shinL, -1);
    leg(this.legR, this.shinR, 1);

    /* ----------------------------------------------------- jet nozzles */
    this.thrustMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const sd of [-1, 1]) {
      t.add(k.cyl(0.045, 0.065, 0.1, k.darkMetal, sd * 0.2, 0.06, -0.36, 10));
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 8), this.thrustMat);
      flame.position.set(sd * 0.2, -0.24, -0.36);
      flame.rotation.x = Math.PI;
      flame.userData.skipAO = true;
      this.nozzles.push(flame);
      t.add(flame);
    }

    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material !== this.thrustMat) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
  }

  /** World position of the boots (for dust and footprints). */
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
    const stride = lerp(0.5, 0.8, clamp01(speed / 5)) * moving;
    const air = this.airBlend;

    // legs: swing + knee bend on the back-swing; tucked slightly in flight
    this.legL.rotation.x = lerp(s * stride, -0.35 + 0.15 * Math.sin(time * 2), air);
    this.legR.rotation.x = lerp(-s * stride, 0.2 + 0.1 * Math.sin(time * 2 + 1), air);
    this.shinL.rotation.x = lerp(Math.max(0, -c) * stride * 1.3 + 0.05, 0.75, air);
    this.shinR.rotation.x = lerp(Math.max(0, c) * stride * 1.3 + 0.05, 0.4, air);
    // arms: a pressurised suit holds the arms slightly out; counter-swing, raised for balance in flight
    const armSwing = stride * 0.7;
    this.armL.rotation.x = lerp(-s * armSwing, -0.5, air);
    this.armR.rotation.x = lerp(s * armSwing, -0.5, air);
    this.armL.rotation.z = lerp(-0.2, -0.75, air);
    this.armR.rotation.z = lerp(0.2, 0.75, air);
    this.foreL.rotation.x = lerp(-0.35 - Math.max(0, -s) * 0.45 * moving, -0.5, air);
    this.foreR.rotation.x = lerp(-0.35 - Math.max(0, s) * 0.45 * moving, -0.5, air);
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
    this.body.position.y = 0.98 + bob - 0.012 * (1 - moving) * (0.5 + 0.5 * Math.sin(time * 1.4));
    this.lean = damp(this.lean, clamp01(speed / 6) * 0.28 + air * clamp01(-vy / 6) * 0.2, 6, dt);
    this.torso.rotation.x = this.lean + this.workBlend * 0.25 + 0.04;
    this.torso.rotation.y = s * 0.07 * moving;
    this.head.rotation.y = -s * 0.04 * moving;

    this.thrustMat.color.setRGB(1.2 * thrust, 2.2 * thrust, 3.2 * thrust);
    for (const n of this.nozzles) {
      n.visible = thrust > 0.02;
      n.scale.y = 0.6 + thrust * (0.8 + 0.4 * Math.sin(time * 60));
    }
    this.lamp.intensity = 260 * clamp01((darkness - 0.3) / 0.5);
    this.glow.intensity = 5 * clamp01((darkness - 0.15) / 0.5);
    // the chest display is self-lit: it stands out more in the dark
    this.screenMat.color.setScalar(1.1 + 1.2 * darkness);
  }
}

/** Embroidered mission patch: the Sun on the horizon. */
function missionPatch(): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#10151c';
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 3, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = '#e6eaee';
  g.stroke();
  g.fillStyle = '#f2a93b';
  g.beginPath();
  g.arc(S / 2, S * 0.43, S * 0.17, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#8f8c87';
  g.beginPath();
  g.ellipse(S / 2, S * 0.86, S * 0.5, S * 0.26, 0, Math.PI, Math.PI * 2);
  g.fill();
  g.fillStyle = '#e6eaee';
  g.font = '700 15px "B612", sans-serif';
  g.textAlign = 'center';
  g.fillText('HELIOS', S / 2, S * 0.9);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
    this.group.scale.setScalar(0.72);
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
    // off the commander's right shoulder and a little ahead, clear of the camera's line of sight
    const want = new THREE.Vector3(follow.x + Math.cos(yaw) * 1.9 - Math.sin(yaw) * 1.3, 0, follow.z - Math.sin(yaw) * 1.9 - Math.cos(yaw) * 1.3);
    want.y = Math.max(follow.y, ground(want.x, want.z)) + 1.55 + 0.1 * Math.sin(this.t * 1.7);
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
