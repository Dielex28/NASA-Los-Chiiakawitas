import * as THREE from 'three';
import { clamp01, damp, dampAngle, lerp } from '../core/math';
import { CROPS, MODULES, TUNE } from '../sim/catalog';
import type { CropId, ModuleState, ModuleType, WorldId } from '../sim/types';
import type { Kit } from './kit';

export interface ViewContext {
  dt: number;
  time: number;
  sunDir: THREE.Vector3;
  sunAz: number;
  sunEl: number;
  darkness: number;
  world: WorldId;
  /** Direction toward Earth (for dishes). */
  earthDir: THREE.Vector3;
  /** Look up another module's position (RASSOR targets). */
  moduleById: (id: number) => ModuleState | undefined;
  ground: (x: number, z: number) => number;
  /** Real seconds of sim speed-up for animation pacing. */
  simRate: number;
}

const STATUS = {
  ok: new THREE.Color(0.25, 2.4, 0.9),
  standby: new THREE.Color(2.6, 1.6, 0.2),
  off: new THREE.Color(2.8, 0.25, 0.2),
  build: new THREE.Color(0.3, 1.4, 2.8),
};

const CROP_COLORS: Record<CropId, number> = {
  lettuce: 0x7fd65a,
  radish: 0x4faa4a,
  tomato: 0x3f8f3a,
  potato: 0x2f7a3a,
  wheat: 0xc9c05a,
};

type Updater = (m: ModuleState, c: ViewContext) => void;

/** 3D representation of one base module: procedural mesh, status beacon and animations. */
export class ModuleView {
  readonly group = new THREE.Group();
  /** Meshes in assembly order (revealed one by one while the module is being built). */
  private parts: Array<{ mesh: THREE.Mesh; mat: THREE.Material | THREE.Material[] }> = [];
  private statusMat = new THREE.MeshBasicMaterial({ color: STATUS.build.clone() });
  private updaters: Updater[] = [];
  private lastBuilt = -1;
  private blink = Math.random() * 10;
  ghost = false;
  /** World-space anchor for a nearby light when it is dark. */
  readonly lightAnchor = new THREE.Vector3();
  hasLight = false;

  constructor(
    readonly type: ModuleType,
    private kit: Kit,
    world: WorldId,
  ) {
    this.group.name = `module-${type}`;
    BUILDERS[type](this, kit, world);
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !(mesh as any).isInstancedMesh && !mesh.userData.noAssemble) {
        this.parts.push({ mesh, mat: mesh.material });
        if (mesh.userData.cast !== false) mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
  }

  add<T extends THREE.Object3D>(o: T, parent: THREE.Object3D = this.group): T {
    parent.add(o);
    return o;
  }

  /** Small glowing beacon whose colour reports the module's state. */
  beacon(x: number, y: number, z: number, r = 0.11): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), this.statusMat);
    m.position.set(x, y, z);
    m.userData.cast = false;
    m.userData.noAssemble = true;
    this.group.add(m);
    return m;
  }

  onUpdate(fn: Updater): void {
    this.updaters.push(fn);
  }

  /** Ghost preview used by the build cursor. */
  setGhost(valid: boolean): void {
    this.ghost = true;
    this.group.userData.skipAO = true;
    const mat = valid ? this.kit.holo : this.kit.holoBad;
    for (const p of this.parts) {
      p.mesh.material = mat;
      p.mesh.castShadow = false;
    }
    this.group.traverse((o) => {
      if ((o as any).isInstancedMesh) o.visible = false;
      if ((o as THREE.Mesh).isMesh && o.userData.noAssemble) o.visible = false;
    });
  }

  private applyBuilt(f: number): void {
    const n = this.parts.length;
    const shown = f >= 1 ? n : Math.floor(f * n);
    for (let i = 0; i < n; i++) {
      const p = this.parts[i];
      const real = i < shown;
      p.mesh.material = real ? p.mat : this.kit.holo;
      p.mesh.castShadow = real && p.mesh.userData.cast !== false;
      p.mesh.userData.skipAO = !real || p.mesh.userData.glass === true;
    }
  }

  update(m: ModuleState, c: ViewContext): void {
    if (this.ghost) return;
    const stepped = Math.floor(m.built * this.parts.length);
    if (stepped !== this.lastBuilt) {
      this.lastBuilt = stepped;
      this.applyBuilt(m.built);
    }
    this.blink += c.dt;
    let col = STATUS.ok;
    let pulse = 1;
    if (m.built < 1) {
      col = STATUS.build;
      pulse = 0.55 + 0.45 * Math.sin(this.blink * 5);
    } else if (m.down || !m.enabled) {
      col = STATUS.off;
      pulse = m.down ? (Math.sin(this.blink * 9) > 0 ? 1 : 0.15) : 0.6;
    } else if (m.mode === 'off') {
      col = STATUS.off;
      pulse = 0.5 + 0.5 * Math.sin(this.blink * 4);
    } else if (m.mode === 'standby') col = STATUS.standby;
    this.statusMat.color.copy(col).multiplyScalar(pulse);
    if (m.built >= 1) for (const u of this.updaters) u(m, c);
    this.group.getWorldPosition(this.lightAnchor);
    this.lightAnchor.y += 3;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    this.statusMat.dispose();
  }
}

type Builder = (v: ModuleView, k: Kit, world: WorldId) => void;
const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const rotZ = <T extends THREE.Object3D>(o: T, a = Math.PI / 2): T => {
  o.rotation.z = a;
  return o;
};
const rotX = <T extends THREE.Object3D>(o: T, a = Math.PI / 2): T => {
  o.rotation.x = a;
  return o;
};
const noCast = <T extends THREE.Object3D>(o: T): T => {
  o.userData.cast = false;
  return o;
};

/** Row of LEDs that shows a level (charge, tank). */
function gauge(v: ModuleView, k: Kit, x: number, y: number, z: number, n: number, axis: 'x' | 'y', level: (m: ModuleState) => number): void {
  const leds: THREE.Mesh[] = [];
  for (let i = 0; i < n; i++) {
    const led = noCast(k.box(axis === 'x' ? 0.2 : 0.16, axis === 'x' ? 0.1 : 0.16, 0.05, k.ledOff, x + (axis === 'x' ? i * 0.27 : 0), y + (axis === 'y' ? i * 0.24 : 0), z));
    led.userData.noAssemble = true;
    leds.push(v.add(led));
  }
  v.onUpdate((m) => {
    const lit = Math.round(clamp01(level(m)) * n);
    for (let i = 0; i < n; i++) leds[i].material = i < lit ? k.ledOn : k.ledOff;
  });
}

function legs(v: ModuleView, k: Kit, w: number, d: number, top: number, r = 0.09): void {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      v.add(k.strut(V((sx * w) / 2, top, (sz * d) / 2), V(sx * (w / 2 + 0.25), -0.6, sz * (d / 2 + 0.25)), r, k.darkMetal));
      v.add(noCast(k.cyl(0.26, 0.3, 0.1, k.metal, sx * (w / 2 + 0.25), 0.02, sz * (d / 2 + 0.25), 10)));
    }
  }
}

const BUILDERS: Record<ModuleType, Builder> = {
  /* ------------------------------------------------------------ lander */
  lander(v, k) {
    // descent stage
    v.add(k.cyl(3.1, 3.3, 1.7, k.foil, 0, 2.25, 0, 8));
    v.add(k.cyl(3.15, 3.15, 0.14, k.darkMetal, 0, 3.15, 0, 8));
    v.add(k.cyl(0.55, 1.15, 1.25, k.darkMetal, 0, 0.95, 0, 20, true));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const cx = Math.cos(a);
      const cz = Math.sin(a);
      v.add(k.strut(V(cx * 3.0, 2.9, cz * 3.0), V(cx * 5.5, 0.12, cz * 5.5), 0.11, k.metal));
      v.add(k.strut(V(cx * 2.6, 1.5, cz * 2.6), V(cx * 4.6, 0.9, cz * 4.6), 0.06, k.metal));
      v.add(k.cyl(0.62, 0.7, 0.14, k.foil, cx * 5.5, 0.08, cz * 5.5, 14));
      v.add(k.sphere(0.72, k.foil, Math.cos(a + Math.PI / 4) * 2.35, 2.25, Math.sin(a + Math.PI / 4) * 2.35, 14, 10));
    }
    // crew cabin
    v.add(k.cyl(2.05, 2.05, 2.5, k.hull, 0, 4.5, 0, 24));
    const dome = v.add(k.sphere(2.05, k.hull, 0, 5.75, 0, 24, 12));
    dome.scale.y = 0.45;
    v.add(k.torus(1.0, 0.09, k.darkMetal, 0, 6.72, 0)).rotation.x = Math.PI / 2;
    v.add(k.cyl(2.08, 2.08, 0.28, k.accent, 0, 3.55, 0, 24));
    for (const s of [-1, 1]) {
      const win = v.add(noCast(k.cyl(0.36, 0.36, 0.08, k.window, s * 0.8, 4.9, 1.95, 14)));
      win.rotation.x = Math.PI / 2;
      win.rotation.z = s * 0.38;
      win.position.set(Math.sin(s * 0.4) * 2.03, 4.9, Math.cos(s * 0.4) * 2.03);
      win.lookAt(Math.sin(s * 0.4) * 6, 4.9, Math.cos(s * 0.4) * 6);
      win.rotateX(Math.PI / 2);
    }
    // hatch, porch and ladder on the +z side
    v.add(k.box(1.1, 1.5, 0.12, k.hullDark, 0, 4.2, 2.05));
    v.add(k.box(1.5, 0.08, 1.2, k.metal, 0, 3.3, 2.7));
    v.add(k.strut(V(-0.35, 3.3, 3.25), V(-0.35, 0.1, 4.6), 0.045, k.metal));
    v.add(k.strut(V(0.35, 3.3, 3.25), V(0.35, 0.1, 4.6), 0.045, k.metal));
    for (let i = 0; i < 7; i++) {
      const t = (i + 0.5) / 7;
      v.add(noCast(k.box(0.7, 0.04, 0.05, k.metal, 0, lerp(3.3, 0.1, t), lerp(3.25, 4.6, t))));
    }
    // deployable solar wings
    for (const s of [-1, 1]) {
      v.add(k.strut(V(s * 2.0, 5.0, 0), V(s * 2.8, 5.0, 0), 0.05, k.metal));
      const wing = v.add(k.box(3.4, 0.05, 1.7, k.solar, s * 4.5, 5.0, 0));
      wing.rotation.x = -0.5;
    }
    // high-gain dish and mast
    v.add(k.strut(V(-1.1, 6.2, -0.9), V(-1.1, 7.6, -0.9), 0.045, k.metal));
    const dish = v.add(k.dish(0.75, 0.24, k.hullDouble));
    dish.position.set(-1.1, 7.6, -0.9);
    dish.rotation.set(-0.9, 0, 0.3);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      v.add(noCast(k.box(0.28, 0.2, 0.28, k.darkMetal, Math.cos(a) * 2.15, 5.3, Math.sin(a) * 2.15)));
    }
    v.beacon(0, 6.95, 0, 0.14);
    v.hasLight = true;
  },

  /* --------------------------------------------------------------- hab */
  hab(v, k) {
    const R = 2.55;
    const L = 8.6;
    const cy = 3.0;
    v.add(rotZ(k.cyl(R, R, L, k.hull, 0, cy, 0, 28)));
    for (const s of [-1, 1]) {
      const cap = v.add(k.sphere(R, k.hull, (s * L) / 2, cy, 0, 28, 14));
      cap.scale.x = 0.55;
    }
    for (let i = -1.5; i <= 1.5; i++) v.add(rotY(k.torus(R + 0.02, 0.09, k.hullDark, i * 2.2, cy, 0)));
    v.add(rotZ(k.cyl(R + 0.03, R + 0.03, 0.5, k.accent, -3.6, cy, 0, 28)));
    // cradle
    for (const x of [-2.8, 2.8]) {
      v.add(k.box(0.5, 1.1, 4.6, k.hullDark, x, 0.75, 0));
      v.add(k.box(0.7, 0.2, 5.4, k.darkMetal, x, 0.1, 0));
      v.add(k.box(0.5, 1.6, 0.4, k.darkMetal, x, -0.9, 2.2));
      v.add(k.box(0.5, 1.6, 0.4, k.darkMetal, x, -0.9, -2.2));
    }
    // airlock on the +x end
    v.add(rotZ(k.cyl(1.25, 1.25, 2.2, k.hullDark, L / 2 + 1.9, 1.95, 0, 20)));
    v.add(rotZ(k.cyl(0.95, 0.95, 0.12, k.hazard, L / 2 + 3.05, 1.95, 0, 20)));
    v.add(noCast(rotZ(k.cyl(0.28, 0.28, 0.14, k.window, L / 2 + 3.08, 2.25, 0, 12))));
    v.add(k.box(1.6, 0.14, 1.8, k.metal, L / 2 + 3.7, 0.62, 0));
    v.add(k.box(0.7, 0.14, 1.8, k.metal, L / 2 + 4.6, 0.3, 0));
    // windows
    for (const z of [-1, 1]) {
      for (const x of [-2.4, 0, 2.4]) {
        const w = v.add(noCast(k.cyl(0.36, 0.36, 0.1, k.window, x, cy + 0.75, z * (R - 0.18), 14)));
        w.rotation.x = Math.PI / 2 - z * 0.3;
      }
    }
    // radiators and mast
    for (const z of [-1, 1]) {
      const rad = v.add(k.box(4.2, 0.05, 1.5, k.hullDouble, 0.4, cy + R + 0.55, z * 1.25));
      rad.rotation.x = z * 0.5;
    }
    v.add(k.strut(V(-2.6, cy + R, 0), V(-2.6, cy + R + 1.9, 0), 0.04, k.metal));
    v.add(noCast(k.sphere(0.12, k.lamp, L / 2 + 3.1, 3.3, 0, 8, 6)));
    v.beacon(-2.6, cy + R + 1.95, 0);
    v.hasLight = true;

    // regolith overburden: grows as the RASSOR piles soil on the habitat
    const geo = new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const n = 1 + 0.07 * Math.sin(x * 9 + z * 4) + 0.05 * Math.sin(z * 13 - y * 5);
      p.setXYZ(i, x * n, y * n, z * n);
    }
    geo.computeVertexNormals();
    const mound = new THREE.Mesh(geo, k.regolith);
    mound.userData.noAssemble = true;
    mound.castShadow = true;
    mound.receiveShadow = true;
    mound.position.set(-0.7, -0.4, 0);
    mound.visible = false;
    v.add(mound);
    let shown = 0;
    v.onUpdate((m, c) => {
      const f = clamp01(m.regolith / TUNE.regolithMax);
      shown = damp(shown, f, 2, c.dt);
      mound.visible = shown > 0.004;
      const e = Math.pow(shown, 0.6);
      mound.scale.set(lerp(4.5, 7.4, e), lerp(0.6, 6.6, e), lerp(2.6, 5.2, e));
    });
  },

  /* ------------------------------------------------------------- eclss */
  eclss(v, k) {
    v.add(k.box(3.2, 2.3, 2.3, k.hull, 0, 1.75, 0));
    v.add(k.box(3.25, 0.25, 2.35, k.blue, 0, 2.55, 0));
    legs(v, k, 3.0, 2.1, 0.6);
    v.add(k.capsule(0.5, 1.4, k.hull, -2.3, 1.55, 0.55));
    v.add(k.cyl(0.52, 0.52, 0.3, k.blue, -2.3, 1.6, 0.55, 16));
    v.add(k.capsule(0.5, 1.4, k.hull, -2.3, 1.55, -0.6));
    v.add(k.cyl(0.52, 0.52, 0.3, k.green, -2.3, 1.6, -0.6, 16));
    v.add(k.torus(0.55, 0.07, k.metal, -1.65, 2.6, 0, Math.PI)).rotation.y = 0;
    v.add(k.strut(V(-2.3, 2.75, 0.55), V(-1.4, 2.95, 0.55), 0.06, k.metal));
    v.add(k.strut(V(-2.3, 2.75, -0.6), V(-1.4, 2.95, -0.6), 0.06, k.metal));
    const rad = v.add(k.box(2.8, 0.05, 1.6, k.hullDouble, 0.2, 3.5, 0));
    rad.rotation.z = 0.35;
    v.add(k.strut(V(0.2, 2.9, 0), V(0.2, 3.5, 0), 0.05, k.metal));
    // fan housing with a spinning rotor
    v.add(rotX(k.cyl(0.62, 0.62, 0.3, k.darkMetal, 0.7, 1.9, 1.2, 18)));
    const fan = new THREE.Group();
    fan.position.set(0.7, 1.9, 1.37);
    for (let i = 0; i < 5; i++) {
      const b = noCast(k.box(0.5, 0.1, 0.02, k.metal, 0.27, 0, 0));
      const arm = new THREE.Group();
      arm.rotation.z = (i / 5) * Math.PI * 2;
      arm.add(b);
      fan.add(arm);
    }
    v.add(fan);
    v.add(k.box(0.9, 0.6, 0.08, k.hullDark, -0.7, 1.7, 1.17));
    v.beacon(1.45, 3.05, 1.0);
    v.onUpdate((m, c) => {
      if (m.mode === 'full') fan.rotation.z += c.dt * 9;
    });
  },

  /* ------------------------------------------------------------- solar */
  solar(v, k, world) {
    const cells = k.solarInstance();
    if (world === 'moon') {
      // vertical array on a tall mast: at the pole the Sun circles the horizon
      v.add(k.box(1.3, 0.7, 1.3, k.hullDark, 0, 0.45, 0));
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        v.add(k.strut(V(Math.cos(a) * 0.5, 0.6, Math.sin(a) * 0.5), V(Math.cos(a) * 2.4, -0.4, Math.sin(a) * 2.4), 0.07, k.metal));
        v.add(noCast(k.cyl(0.3, 0.34, 0.1, k.metal, Math.cos(a) * 2.4, 0.03, Math.sin(a) * 2.4, 10)));
      }
      v.add(k.cyl(0.13, 0.17, 5.4, k.metal, 0, 3.4, 0, 12));
      const head = new THREE.Group();
      head.position.y = 6.1;
      v.add(head);
      head.add(k.cyl(0.24, 0.24, 0.5, k.darkMetal, 0, 0, 0, 12));
      head.add(k.box(0.12, 9.4, 0.12, k.metal, 0, 4.4, 0));
      for (const s of [-1, 1]) {
        head.add(k.box(2.25, 8.6, 0.05, cells, s * 1.24, 4.6, 0.02));
        head.add(k.box(0.06, 8.7, 0.08, k.metal, s * 2.4, 4.6, 0));
      }
      for (const y of [0.35, 4.6, 8.85]) head.add(noCast(k.box(4.9, 0.07, 0.09, k.metal, 0, y, 0)));
      v.beacon(0, 15.3, 0, 0.13);
      v.onUpdate((m, c) => {
        // local +z of the head faces the Sun's azimuth
        const target = Math.atan2(c.sunDir.x, c.sunDir.z) - v.group.rotation.y;
        head.rotation.y = dampAngle(head.rotation.y, target, 0.8, c.dt);
        cells.color.setRGB(1 - 0.5 * m.dust, 1 - 0.58 * m.dust, 1 - 0.68 * m.dust);
      });
    } else {
      // two-axis tracker close to the ground (easy to brush the dust off)
      v.add(k.cyl(0.7, 0.9, 0.35, k.hullDark, 0, 0.2, 0, 14));
      v.add(k.cyl(0.14, 0.16, 1.9, k.metal, 0, 1.2, 0, 10));
      const yaw = new THREE.Group();
      yaw.position.y = 2.2;
      v.add(yaw);
      yaw.add(rotZ(k.cyl(0.11, 0.11, 2.2, k.darkMetal, 0, 0, 0, 10)));
      const tilt = new THREE.Group();
      yaw.add(tilt);
      for (const s of [-1, 1]) {
        tilt.add(k.box(3.5, 0.06, 4.4, cells, s * 2.75, 0.05, 0));
        tilt.add(noCast(k.box(3.6, 0.05, 0.08, k.metal, s * 2.75, 0, 2.22)));
        tilt.add(noCast(k.box(3.6, 0.05, 0.08, k.metal, s * 2.75, 0, -2.22)));
      }
      tilt.add(noCast(k.box(0.1, 0.07, 4.5, k.metal, 0, 0, 0)));
      v.beacon(0, 2.55, 0);
      v.onUpdate((m, c) => {
        const up = c.sunEl > 0.03;
        const target = Math.atan2(c.sunDir.x, c.sunDir.z) - v.group.rotation.y;
        if (up) yaw.rotation.y = dampAngle(yaw.rotation.y, target, 0.9, c.dt);
        // tilt so the panel normal (+y) points at the Sun; stow flat at night
        const want = up ? Math.PI / 2 - Math.max(0.12, c.sunEl) : 0;
        tilt.rotation.x = damp(tilt.rotation.x, Math.min(want, 1.15), 0.9, c.dt);
        cells.color.setRGB(1 - 0.35 * m.dust, 1 - 0.55 * m.dust, 1 - 0.75 * m.dust);
      });
    }
  },

  /* ----------------------------------------------------------- battery */
  battery(v, k) {
    v.add(k.box(2.8, 1.5, 1.7, k.hullDark, 0, 1.15, 0));
    v.add(k.box(2.84, 0.22, 1.74, k.accent, 0, 1.55, 0));
    for (let i = 0; i < 7; i++) v.add(noCast(k.box(0.06, 0.4, 1.5, k.metal, -1.05 + i * 0.35, 2.1, 0)));
    v.add(k.box(2.5, 0.08, 1.6, k.metal, 0, 1.92, 0));
    legs(v, k, 2.6, 1.5, 0.4, 0.07);
    v.add(k.box(1.75, 0.3, 0.04, k.rubber, 0, 1.05, 0.86));
    gauge(v, k, -0.68, 1.05, 0.89, 6, 'x', (m) => m.charge / MODULES.battery.storageKwh);
    v.beacon(1.2, 2.2, 0.7);
  },

  /* ---------------------------------------------------------- fuelcell */
  fuelcell(v, k) {
    v.add(k.sphere(1.15, k.hull, -1.35, 1.75, 0));
    v.add(k.torus(1.16, 0.06, k.blue, -1.35, 1.75, 0)).rotation.x = Math.PI / 2;
    v.add(k.sphere(0.95, k.hull, 1.25, 1.55, 0));
    v.add(k.torus(0.96, 0.06, k.green, 1.25, 1.55, 0)).rotation.x = Math.PI / 2;
    v.add(k.box(1.0, 1.3, 1.5, k.hullDark, 0, 1.05, 0));
    v.add(k.box(3.9, 0.16, 1.9, k.darkMetal, 0, 0.36, 0));
    legs(v, k, 3.7, 1.7, 0.3, 0.07);
    v.add(k.strut(V(-1.35, 2.9, 0), V(0, 1.9, 0), 0.05, k.metal));
    v.add(k.strut(V(1.25, 2.5, 0), V(0, 1.9, 0), 0.05, k.metal));
    v.add(k.box(0.32, 1.25, 0.04, k.rubber, 0, 1.08, 0.77));
    gauge(v, k, 0, 0.6, 0.8, 5, 'y', (m) => m.charge / MODULES.fuelcell.storageKwh);
    v.beacon(0, 1.95, 0.6);
  },

  /* ----------------------------------------------------------- reactor */
  reactor(v, k) {
    // core sits low behind its own shield; heat goes up the mast to a radiator "umbrella"
    v.add(k.cyl(1.5, 1.7, 0.5, k.hullDark, 0, 0.2, 0, 20));
    v.add(k.cyl(0.62, 0.62, 1.5, k.darkMetal, 0, 1.15, 0, 18));
    v.add(k.cyl(0.9, 0.9, 0.22, k.hazard, 0, 1.95, 0, 18));
    const glow = v.add(noCast(k.cyl(0.64, 0.64, 0.12, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.6, 2.8) }), 0, 0.72, 0, 18)));
    v.add(k.cyl(0.14, 0.2, 3.4, k.metal, 0, 3.7, 0, 10));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      v.add(noCast(k.strut(V(0, 4.2, 0), V(Math.cos(a) * 2.9, 5.55, Math.sin(a) * 2.9), 0.035, k.metal, 6)));
    }
    const fin = v.add(new THREE.Mesh(new THREE.CylinderGeometry(3.1, 0.35, 1.1, 24, 1, true), k.hullDouble));
    fin.position.y = 5.2;
    v.add(k.torus(3.1, 0.05, k.accent, 0, 5.75, 0)).rotation.x = Math.PI / 2;
    v.beacon(0, 5.95, 0, 0.13);
    v.onUpdate((m, c) => {
      (glow.material as THREE.MeshBasicMaterial).color.setRGB(0.2, 1.6, 2.8).multiplyScalar(m.enabled && !m.down ? 0.75 + 0.25 * Math.sin(c.time * 2.2) : 0.05);
    });
  },

  /* -------------------------------------------------------- greenhouse */
  greenhouse(v, k) {
    const R = 2.9;
    const L = 8.4;
    v.add(k.box(L + 0.6, 0.35, 2 * R + 0.5, k.hullDark, 0, 0.35, 0));
    v.add(k.box(L + 0.2, 1.8, 0.3, k.darkMetal, 0, -0.6, R - 0.3));
    v.add(k.box(L + 0.2, 1.8, 0.3, k.darkMetal, 0, -0.6, -R + 0.3));
    // planting beds
    for (const z of [-1.55, 0, 1.55]) v.add(noCast(k.box(L - 1.0, 0.32, 1.05, k.hull, 0, 0.7, z)));
    for (const z of [-1.55, 0, 1.55]) v.add(noCast(k.box(L - 1.2, 0.06, 0.9, k.rubber, 0, 0.87, z)));
    // end walls
    for (const s of [-1, 1]) {
      const wall = v.add(new THREE.Mesh(new THREE.CircleGeometry(R, 24, 0, Math.PI), k.hullDouble));
      wall.position.set((s * L) / 2, 0.52, 0);
      wall.rotation.y = Math.PI / 2;
    }
    v.add(k.box(1.4, 2.0, 1.5, k.hullDark, L / 2 + 0.7, 1.5, 0));
    v.add(k.box(0.08, 1.6, 1.0, k.hazard, L / 2 + 1.42, 1.4, 0));
    // ribs + glazing
    for (let i = 0; i <= 5; i++) {
      const rib = v.add(k.torus(R, 0.07, k.metal, -L / 2 + (i * L) / 5, 0.52, 0, Math.PI, 20));
      rib.rotation.y = Math.PI / 2;
    }
    v.add(rotZ(k.cyl(0.05, 0.05, L, k.metal, 0, 0.52 + R, 0, 6)));
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.02, R - 0.02, L, 28, 1, true, 0, Math.PI), k.glass);
    glass.rotation.z = Math.PI / 2;
    glass.rotation.y = Math.PI / 2;
    glass.position.y = 0.52;
    glass.userData.cast = false;
    glass.userData.glass = true;
    glass.userData.skipAO = true;
    v.add(glass);
    // grow lights: LEDs tuned to the red/blue that chlorophyll absorbs best, hence the magenta glow
    const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) });
    for (const z of [-1.55, 0, 1.55]) {
      const strip = noCast(k.box(L - 1.2, 0.05, 0.16, ledMat, 0, z === 0 ? 2.75 : 2.2, z));
      strip.userData.noAssemble = true;
      v.add(strip);
    }
    // plants
    const rows = 3;
    const per = 16;
    const plantGeo = new THREE.ConeGeometry(0.2, 0.5, 6);
    plantGeo.translate(0, 0.25, 0);
    const plantMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    const plants = new THREE.InstancedMesh(plantGeo, plantMat, rows * per);
    plants.userData.cast = false;
    v.add(plants);
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const col = new THREE.Color();
    let lastKey = '';
    let lit = 0;
    v.onUpdate((m, c) => {
      lit = damp(lit, m.mode === 'full' ? 1 : 0, 4, c.dt);
      ledMat.color.setRGB(2.6 * lit, 0.35 * lit, 2.2 * lit);
      const g = Math.round(m.growth * 40);
      const key = `${m.crop}:${g}:${Math.round(m.cropHealth * 10)}`;
      if (key === lastKey) return;
      lastKey = key;
      col.setHex(CROP_COLORS[m.crop]).lerp(new THREE.Color(0x6b5a2a), 1 - m.cropHealth);
      const tall = m.crop === 'wheat' ? 2.4 : m.crop === 'tomato' ? 2.0 : m.crop === 'potato' ? 1.3 : 0.8;
      let idx = 0;
      for (let r = 0; r < rows; r++) {
        for (let i = 0; i < per; i++) {
          const jitter = Math.sin(i * 12.9898 + r * 78.233) * 0.5 + 0.5;
          const s = 0.12 + (0.5 + 0.5 * jitter) * m.growth;
          pos.set(-L / 2 + 0.9 + (i * (L - 1.8)) / (per - 1), 0.9, (r - 1) * 1.55 + (jitter - 0.5) * 0.3);
          scl.set(s * 1.5, s * tall, s * 1.5);
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), jitter * 6.28);
          mtx.compose(pos, q, scl);
          plants.setMatrixAt(idx, mtx);
          plants.setColorAt(idx, col);
          idx++;
        }
      }
      plants.instanceMatrix.needsUpdate = true;
      if (plants.instanceColor) plants.instanceColor.needsUpdate = true;
    });
    v.beacon(L / 2 + 0.7, 2.65, 0);
    v.hasLight = true;
  },

  /* ------------------------------------------------------------ icerig */
  icerig(v, k) {
    v.add(k.cyl(2.3, 2.5, 0.3, k.hullDark, 0, 0.25, 0, 8));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      v.add(k.strut(V(Math.cos(a) * 2.0, 0.4, Math.sin(a) * 2.0), V(0, 6.3, 0), 0.08, k.metal));
      v.add(k.strut(V(Math.cos(a) * 2.0, 0.4, Math.sin(a) * 2.0), V(Math.cos(a) * 3.0, -0.5, Math.sin(a) * 3.0), 0.09, k.darkMetal));
      v.add(noCast(k.strut(V(Math.cos(a) * 1.33, 2.4, Math.sin(a) * 1.33), V(Math.cos(a + 2.094) * 1.33, 2.4, Math.sin(a + 2.094) * 1.33), 0.04, k.metal, 6)));
    }
    v.add(k.cyl(0.45, 0.45, 0.6, k.accent, 0, 6.3, 0, 12));
    const drill = new THREE.Group();
    v.add(drill);
    drill.add(k.cyl(0.09, 0.09, 6.0, k.darkMetal, 0, 3.0, 0, 8));
    for (let i = 0; i < 9; i++) {
      const fl = noCast(k.box(0.5, 0.04, 0.12, k.metal, 0, 0.3 + i * 0.36, 0));
      fl.rotation.y = i * 0.9;
      fl.rotation.z = 0.35;
      drill.add(fl);
    }
    v.add(k.cyl(0.85, 0.85, 1.7, k.foil, 1.35, 1.25, -0.2, 16));
    const cap = v.add(k.sphere(0.85, k.foil, 1.35, 2.1, -0.2, 16, 10));
    cap.scale.y = 0.5;
    v.add(k.strut(V(0.2, 0.8, 0), V(1.0, 1.3, -0.1), 0.07, k.metal));
    v.add(k.capsule(0.42, 1.0, k.hull, -1.5, 1.1, 0.4));
    v.add(k.cyl(0.44, 0.44, 0.26, k.blue, -1.5, 1.15, 0.4, 14));
    v.beacon(0, 6.75, 0, 0.13);
    v.onUpdate((m, c) => {
      if (m.mode === 'full' && m.output > 0.01) {
        drill.rotation.y += c.dt * 5;
        drill.position.y = -0.25 + 0.2 * Math.sin(c.time * 0.8);
      }
    });
  },

  /* ------------------------------------------------------------- moxie */
  moxie(v, k) {
    // like the instrument on Perseverance: a gold box that breathes in CO₂ and exhales oxygen
    v.add(k.box(2.0, 1.7, 1.8, k.foil, 0, 1.45, 0));
    v.add(k.box(2.3, 0.2, 2.1, k.hullDark, 0, 0.5, 0));
    legs(v, k, 2.1, 1.9, 0.4, 0.07);
    v.add(k.cyl(0.24, 0.24, 1.5, k.metal, -0.6, 3.0, 0.4, 12));
    v.add(k.cyl(0.36, 0.36, 0.5, k.darkMetal, -0.6, 3.85, 0.4, 12));
    v.add(rotZ(k.cyl(0.42, 0.42, 1.0, k.darkMetal, 1.45, 1.2, 0, 14)));
    v.add(k.capsule(0.36, 0.9, k.hull, 0.6, 2.9, -0.4));
    v.add(k.cyl(0.38, 0.38, 0.22, k.green, 0.6, 2.9, -0.4, 14));
    v.add(k.strut(V(0.6, 2.3, -0.4), V(0.6, 2.35, 0.3), 0.05, k.metal));
    v.beacon(-0.6, 4.2, 0.4);
  },

  /* ------------------------------------------------------------ rassor */
  rassor(v, k) {
    // charging dock
    v.add(k.box(2.6, 0.22, 2.2, k.hullDark, 0, 0.2, 0));
    const ramp = v.add(k.box(2.2, 0.08, 1.3, k.hazard, 0, 0.14, 1.6));
    ramp.rotation.x = 0.16;
    v.add(k.box(0.5, 1.5, 0.5, k.hull, -0.9, 1.0, -0.7));
    v.add(k.box(0.52, 0.2, 0.52, k.accent, -0.9, 1.5, -0.7));
    v.add(k.strut(V(-0.9, 1.75, -0.7), V(-0.9, 3.0, -0.7), 0.04, k.metal));
    v.add(noCast(k.sphere(0.1, k.lamp, -0.9, 2.75, -0.7, 8, 6)));
    v.beacon(-0.9, 3.05, -0.7);
    // the excavator: two counter-rotating bucket drums cancel each other's digging force,
    // which is how a light robot can dig in low gravity
    const bot = new THREE.Group();
    bot.userData.noAssemble = true;
    const body = k.box(1.25, 0.34, 0.8, k.hull, 0, 0.55, 0);
    bot.add(body);
    bot.add(k.box(1.27, 0.08, 0.82, k.accent, 0, 0.64, 0));
    const drums: THREE.Mesh[] = [];
    for (const s of [-1, 1]) {
      bot.add(k.strut(V(s * 0.5, 0.55, 0), V(s * 1.05, 0.42, 0), 0.05, k.metal));
      const d = rotX(k.cyl(0.36, 0.36, 0.95, k.darkMetal, s * 1.1, 0.4, 0, 10));
      drums.push(d);
      bot.add(d);
      for (const z of [-0.45, 0.45]) bot.add(rotX(k.cyl(0.25, 0.25, 0.14, k.rubber, s * 0.42, 0.26, z, 12)));
    }
    bot.traverse((o) => {
      o.userData.noAssemble = true;
      if ((o as THREE.Mesh).isMesh) {
        (o as THREE.Mesh).castShadow = true;
        (o as THREE.Mesh).receiveShadow = true;
      }
    });
    v.add(bot);
    let phase = 0;
    const local = new THREE.Vector3();
    v.onUpdate((m, c) => {
      const t = m.targetId ? c.moduleById(m.targetId) : undefined;
      const working = m.mode === 'full' && !!t && m.output > 0;
      if (!working || !t) {
        bot.position.lerp(local.set(0.2, 0.2, 0.1), Math.min(1, c.dt * 2));
        bot.rotation.y = damp(bot.rotation.y, 0, 3, c.dt);
        return;
      }
      // shuttle between a borrow pit and the habitat
      phase = (phase + c.dt * 0.11) % 1;
      const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2;
      const cos = Math.cos(-v.group.rotation.y);
      const sin = Math.sin(-v.group.rotation.y);
      const dx = t.x - v.group.position.x;
      const dz = t.z - v.group.position.z;
      const lx = dx * cos + dz * sin;
      const lz = -dx * sin + dz * cos;
      const dist = Math.hypot(lx, lz) || 1;
      const reach = Math.max(0, dist - 7.5);
      const px = (lx / dist) * lerp(2.5, reach, tri);
      const pz = (lz / dist) * lerp(2.5, reach, tri);
      const wx = v.group.position.x + px * Math.cos(v.group.rotation.y) + pz * Math.sin(v.group.rotation.y);
      const wz = v.group.position.z - px * Math.sin(v.group.rotation.y) + pz * Math.cos(v.group.rotation.y);
      bot.position.set(px, c.ground(wx, wz) - v.group.position.y, pz);
      bot.rotation.y = Math.atan2(-lz, lx) + (phase < 0.5 ? 0 : Math.PI);
      drums[0].rotation.y += c.dt * 6;
      drums[1].rotation.y -= c.dt * 6;
    });
  },

  /* ----------------------------------------------------------- shelter */
  shelter(v, k) {
    v.add(k.cyl(2.5, 2.7, 1.9, k.hullDark, 0, 1.05, 0, 24));
    // water wall: the crew's water doubles as radiation shielding
    v.add(k.cyl(2.74, 2.74, 0.9, k.blue, 0, 1.2, 0, 24));
    const dome = v.add(k.sphere(2.5, k.hull, 0, 2.0, 0, 24, 12));
    dome.scale.y = 0.42;
    v.add(rotX(k.cyl(0.95, 0.95, 1.5, k.hullDark, 0, 1.15, 2.9, 16)));
    v.add(rotX(k.cyl(0.75, 0.75, 0.1, k.hazard, 0, 1.15, 3.68, 16)));
    v.add(k.box(1.4, 0.12, 1.0, k.metal, 0, 0.3, 4.2));
    v.add(k.cyl(2.9, 3.1, 0.25, k.darkMetal, 0, 0.05, 0, 24));
    v.add(k.strut(V(1.2, 2.8, 0), V(1.2, 3.8, 0), 0.04, k.metal));
    v.beacon(1.2, 3.85, 0);
  },

  /* --------------------------------------------------------------- lab */
  lab(v, k) {
    v.add(k.cyl(2.7, 2.7, 3.6, k.hull, 0, 2.6, 0, 28));
    v.add(k.cyl(2.74, 2.74, 0.3, k.blue, 0, 3.3, 0, 28));
    v.add(k.cyl(2.74, 2.74, 0.18, k.hullDark, 0, 0.9, 0, 28));
    const dome = v.add(k.sphere(2.7, k.hull, 0, 4.4, 0, 28, 12));
    dome.scale.y = 0.38;
    // cupola
    v.add(k.cyl(0.95, 1.15, 0.5, k.hullDark, 0, 5.45, 0, 12));
    v.add(noCast(k.cyl(0.9, 0.98, 0.3, k.window, 0, 5.6, 0, 12)));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const w = v.add(noCast(k.box(0.7, 0.55, 0.08, k.window, Math.cos(a) * 2.68, 2.6, Math.sin(a) * 2.68)));
      w.rotation.y = -a + Math.PI / 2;
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.78;
      v.add(k.strut(V(Math.cos(a) * 2.3, 0.85, Math.sin(a) * 2.3), V(Math.cos(a) * 3.1, -0.6, Math.sin(a) * 3.1), 0.11, k.darkMetal));
      v.add(noCast(k.cyl(0.34, 0.38, 0.1, k.metal, Math.cos(a) * 3.1, 0.03, Math.sin(a) * 3.1, 10)));
    }
    // sample airlock and steps
    v.add(k.box(1.2, 1.5, 1.3, k.hullDark, 0, 1.75, 3.1));
    v.add(k.box(0.9, 1.1, 0.08, k.hazard, 0, 1.7, 3.78));
    v.add(k.box(1.2, 0.1, 0.8, k.metal, 0, 0.95, 4.1));
    v.add(k.box(1.2, 0.1, 0.8, k.metal, 0, 0.5, 4.7));
    // weather / dosimetry mast
    v.add(k.strut(V(1.6, 4.9, -1.2), V(1.6, 7.2, -1.2), 0.04, k.metal));
    v.add(noCast(k.box(0.9, 0.05, 0.05, k.metal, 1.6, 6.7, -1.2)));
    v.add(noCast(k.sphere(0.13, k.metal, 2.05, 6.72, -1.2, 8, 6)));
    v.add(noCast(k.cyl(0.1, 0.1, 0.25, k.darkMetal, 1.15, 6.78, -1.2, 8)));
    v.beacon(1.6, 7.25, -1.2);
    v.hasLight = true;
  },

  /* ----------------------------------------------------------- antenna */
  antenna(v, k) {
    v.add(k.cyl(0.9, 1.1, 0.3, k.hullDark, 0, 0.2, 0, 14));
    v.add(k.cyl(0.16, 0.22, 2.4, k.metal, 0, 1.5, 0, 10));
    v.add(k.box(0.6, 0.7, 0.5, k.hull, 0.45, 0.9, 0));
    const yaw = new THREE.Group();
    yaw.position.y = 2.75;
    v.add(yaw);
    yaw.add(k.box(0.3, 0.5, 1.5, k.darkMetal, 0, 0.1, 0));
    const tilt = new THREE.Group();
    tilt.position.y = 0.35;
    yaw.add(tilt);
    const dish = k.dish(1.75, 0.55, k.hullDouble);
    tilt.add(dish);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      tilt.add(noCast(k.strut(V(Math.cos(a) * 1.3, 0.32, Math.sin(a) * 1.3), V(0, 1.45, 0), 0.025, k.metal, 5)));
    }
    tilt.add(noCast(k.cyl(0.1, 0.14, 0.28, k.darkMetal, 0, 1.5, 0, 8)));
    v.beacon(0, 0.55, 0.7);
    v.onUpdate((m, c) => {
      // +y of the dish points at Earth
      const e = c.earthDir;
      const az = Math.atan2(e.x, e.z) - v.group.rotation.y;
      yaw.rotation.y = dampAngle(yaw.rotation.y, az, 0.8, c.dt);
      const el = Math.max(0.1, Math.asin(clamp01(Math.max(e.y, 0))));
      tilt.rotation.x = damp(tilt.rotation.x, Math.PI / 2 - el, 0.8, c.dt);
    });
  },

  /* -------------------------------------------------------------- tank */
  tank(v, k) {
    v.add(k.box(3.6, 0.16, 2.6, k.darkMetal, 0, 0.3, 0));
    legs(v, k, 3.4, 2.4, 0.3, 0.07);
    for (const [z, band] of [
      [-0.68, k.blue],
      [0.68, k.green],
    ] as const) {
      const t = v.add(k.capsule(0.62, 2.2, k.hull, 0, 1.05, z));
      t.rotation.z = Math.PI / 2;
      for (const x of [-0.8, 0.8]) v.add(rotZ(k.cyl(0.64, 0.64, 0.2, band, x, 1.05, z, 16)));
      v.add(k.cyl(0.07, 0.07, 0.4, k.metal, 1.2, 1.8, z, 8));
    }
    v.add(k.strut(V(1.2, 2.0, -0.68), V(1.2, 2.0, 0.68), 0.05, k.metal));
    v.beacon(1.2, 2.15, 0);
  },

  /* ------------------------------------------------------------- pylon */
  pylon(v, k) {
    v.add(k.cyl(0.32, 0.4, 0.14, k.hullDark, 0, 0.07, 0, 10));
    v.add(k.cyl(0.05, 0.07, 3.3, k.metal, 0, 1.7, 0, 8));
    v.add(noCast(k.box(0.8, 0.05, 0.05, k.metal, 0, 3.0, 0)));
    v.add(noCast(k.cyl(0.07, 0.07, 0.16, k.accent, -0.36, 3.05, 0, 8)));
    v.add(noCast(k.cyl(0.07, 0.07, 0.16, k.accent, 0.36, 3.05, 0, 8)));
    v.add(noCast(k.sphere(0.13, k.lamp, 0, 3.42, 0, 8, 6)));
    v.beacon(0, 2.6, 0.08, 0.06);
    v.hasLight = true;
  },
};

function rotY<T extends THREE.Object3D>(o: T, a = Math.PI / 2): T {
  o.rotation.y = a;
  return o;
}
