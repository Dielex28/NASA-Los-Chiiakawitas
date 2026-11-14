import * as THREE from 'three';
import { labelTexture, type Kit } from './kit';
import type { Vehicle } from '../game/vehicle';

/**
 * The surface rover, built part by part like every other object here: an open aluminium
 * chassis on four wire-mesh wheels, two seats, a hand controller between them, batteries
 * under foil at the nose, an umbrella antenna, a camera mast and a solar panel at the back.
 * The wheels are separate so they can steer, spin and ride up and down on their springs.
 */
export class RoverView {
  readonly group = new THREE.Group();
  private wheels: Array<{ arm: THREE.Group; steer: THREE.Group; spin: THREE.Group }> = [];
  readonly lamp = new THREE.SpotLight(0xe8f1ff, 0, 70, 0.55, 0.6, 1.3);
  private lampTarget = new THREE.Object3D();
  private dish = new THREE.Group();

  constructor(
    k: Kit,
    private vehicle: Vehicle,
  ) {
    const g = this.group;
    g.name = 'rover';
    const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
    const s = vehicle.spec;

    /* ------------------------------------------------------------ chassis */
    for (const sd of [-1, 1]) g.add(k.box(0.07, 0.09, 2.9, k.metal, sd * 0.5, -0.1, 0));
    for (const z of [-1.35, -0.45, 0.45, 1.35]) g.add(k.box(1.07, 0.07, 0.07, k.metal, 0, -0.1, z));
    g.add(k.box(1.25, 0.025, 1.5, k.hullDark, 0, -0.04, -0.05));
    // footrests
    g.add(k.box(1.2, 0.025, 0.4, k.metal, 0, 0.02, 0.62)).rotation.x = -0.5;

    /* -------------------------------------------------------------- seats */
    for (const sd of [-1, 1]) {
      g.add(k.box(0.5, 0.05, 0.48, k.hull, sd * 0.36, 0.2, -0.22));
      const back = k.box(0.5, 0.62, 0.05, k.hull, sd * 0.36, 0.52, -0.5);
      back.rotation.x = -0.14;
      g.add(back);
      for (const e of [-1, 1]) g.add(k.strut(V(sd * 0.36 + e * 0.24, -0.04, -0.4), V(sd * 0.36 + e * 0.24, 0.84, -0.56), 0.014, k.metal, 6));
      // lap restraint and handhold
      g.add(k.strut(V(sd * 0.62, 0.2, -0.45), V(sd * 0.62, 0.48, 0.0), 0.014, k.metal, 6));
    }

    /* ------------------------------------------- controls between the seats */
    g.add(k.box(0.2, 0.3, 0.5, k.hullDark, 0, 0.14, 0.1));
    g.add(k.cyl(0.014, 0.014, 0.16, k.metal, 0, 0.37, 0.16, 8));
    const handle = k.cyl(0.02, 0.02, 0.13, k.rubber, 0, 0.45, 0.16, 8);
    handle.rotation.z = Math.PI / 2;
    g.add(handle);
    const console = k.box(0.5, 0.26, 0.06, k.hullDark, 0, 0.5, 0.72);
    console.rotation.x = -0.5;
    g.add(console);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.17),
      new THREE.MeshBasicMaterial({
        map: labelTexture(
          [
            { text: 'HELIOS ROVER', size: 30, color: '#f2a93b' },
            { text: 'NAV · PWR · COMM', size: 20, color: '#7bd88f', weight: 400 },
          ],
          '#05080b',
          256,
          128,
        ),
        color: new THREE.Color(1.6, 1.6, 1.6),
      }),
    );
    screen.position.set(0, 0.512, 0.688);
    screen.rotation.x = -0.5 + Math.PI;
    screen.rotation.z = Math.PI;
    g.add(screen);
    g.add(k.strut(V(0, -0.04, 0.6), V(0, 0.42, 0.74), 0.02, k.metal, 6));

    /* ------------------------------------------------- nose: batteries, lights */
    g.add(k.box(1.05, 0.34, 0.52, k.foil, 0, 0.1, 1.1));
    g.add(k.box(1.0, 0.03, 0.5, k.hull, 0, 0.285, 1.1));
    for (const sd of [-1, 1]) {
      const light = k.cyl(0.06, 0.07, 0.07, k.darkMetal, sd * 0.4, 0.16, 1.39, 12);
      light.rotation.x = Math.PI / 2;
      g.add(light);
      const lens = k.cyl(0.055, 0.055, 0.012, k.lamp, sd * 0.4, 0.16, 1.43, 12);
      lens.rotation.x = Math.PI / 2;
      g.add(lens);
    }
    this.lamp.position.set(0, 0.3, 1.45);
    this.lampTarget.position.set(0, -0.6, 9);
    this.lamp.target = this.lampTarget;
    this.lamp.castShadow = false;
    g.add(this.lamp, this.lampTarget);

    /* ----------------------------- camera mast and umbrella antenna (front) */
    g.add(k.strut(V(0.45, 0.28, 1.2), V(0.45, 0.95, 1.2), 0.016, k.metal, 6));
    g.add(k.box(0.14, 0.1, 0.2, k.hull, 0.45, 1.0, 1.22));
    const eye = k.cyl(0.035, 0.035, 0.05, k.darkMetal, 0.45, 1.0, 1.34, 10);
    eye.rotation.x = Math.PI / 2;
    g.add(eye);
    g.add(k.strut(V(-0.45, 0.28, 1.2), V(-0.45, 1.55, 1.2), 0.016, k.metal, 6));
    this.dish.position.set(-0.45, 1.6, 1.2);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.2, 20, 1, true), k.hullDouble);
    cone.rotation.x = Math.PI;
    this.dish.add(cone);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.dish.add(k.strut(V(0, -0.1, 0), V(Math.cos(a) * 0.46, 0.1, Math.sin(a) * 0.46), 0.006, k.metal, 4));
    }
    this.dish.add(k.strut(V(0, -0.1, 0), V(0, 0.22, 0), 0.008, k.metal, 5));
    this.dish.rotation.set(0.5, 0, 0.25);
    g.add(this.dish);

    /* ------------------------------------- rear: equipment pallet, solar panel */
    g.add(k.box(1.15, 0.26, 0.55, k.hull, 0, 0.1, -1.12));
    g.add(k.box(0.34, 0.2, 0.3, k.accent, -0.3, 0.33, -1.1));
    g.add(k.box(0.3, 0.16, 0.26, k.hullDark, 0.2, 0.31, -1.12));
    const scoop = k.cyl(0.02, 0.02, 0.7, k.metal, 0.5, 0.42, -1.1, 8);
    scoop.rotation.x = 0.3;
    g.add(scoop);
    const panel = new THREE.Group();
    panel.position.set(0, 0.86, -1.28);
    panel.rotation.x = -0.32;
    panel.add(k.box(1.5, 0.025, 0.85, k.solar, 0, 0.014, 0));
    panel.add(k.box(1.54, 0.02, 0.89, k.metal, 0, 0, 0));
    g.add(panel);
    for (const sd of [-1, 1]) g.add(k.strut(V(sd * 0.5, 0.2, -1.3), V(sd * 0.5, 0.82, -1.3), 0.014, k.metal, 6));

    /* -------------------------------------------------------------- wheels */
    const R = s.wheelRadius;
    for (const w of vehicle.wheels) {
      const side = Math.sign(w.mount[0]);
      const arm = new THREE.Group();
      const steer = new THREE.Group();
      const spin = new THREE.Group();
      arm.add(steer);
      steer.add(spin);
      g.add(arm);
      // tyre: woven wire mesh with riveted chevron cleats
      const tyre = k.torus(R - 0.1, 0.1, k.darkMetal, 0, 0, 0, Math.PI * 2, 30);
      tyre.rotation.y = Math.PI / 2;
      tyre.scale.set(1, 1, 1.25);
      spin.add(tyre);
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const cleat = k.box(0.2, 0.02, 0.05, k.metal, 0, Math.sin(a) * (R - 0.004), Math.cos(a) * (R - 0.004));
        cleat.rotation.x = -a;
        spin.add(cleat);
      }
      const hub = k.cyl(0.13, 0.13, 0.16, k.hull, 0, 0, 0, 16);
      hub.rotation.z = Math.PI / 2;
      spin.add(hub);
      const cap = k.cyl(0.07, 0.07, 0.19, k.accent, 0, 0, 0, 12);
      cap.rotation.z = Math.PI / 2;
      spin.add(cap);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        spin.add(k.strut(V(0, Math.sin(a) * 0.12, Math.cos(a) * 0.12), V(0, Math.sin(a) * (R - 0.12), Math.cos(a) * (R - 0.12)), 0.012, k.metal, 5));
      }
      // fender: the dust guard whose loss famously sprayed Apollo 17's crew
      const fender = new THREE.Group();
      for (let i = -2; i <= 2; i++) {
        const a = i * 0.34;
        const seg = k.box(0.3, 0.012, 0.19, k.accent, 0, Math.cos(a) * (R + 0.09), Math.sin(a) * (R + 0.09));
        seg.rotation.x = a;
        fender.add(seg);
      }
      steer.add(fender);
      // suspension arm from the frame to the hub
      g.add(k.strut(V(side * 0.5, -0.1, w.mount[2]), V(w.mount[0] - side * 0.12, -0.3, w.mount[2]), 0.02, k.metal, 6));
      this.wheels.push({ arm, steer, spin });
    }

    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m !== screen) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    this.sync(0, 0);
  }

  /** Copy the physics state onto the model. */
  sync(darkness: number, time: number): void {
    const v = this.vehicle;
    const s = v.spec;
    this.group.position.set(v.pos[0], v.pos[1], v.pos[2]);
    this.group.quaternion.set(v.q[0], v.q[1], v.q[2], v.q[3]);
    v.wheels.forEach((w, i) => {
      const part = this.wheels[i];
      const drop = s.restLength - (w.contact ? w.compression : 0);
      part.arm.position.set(w.mount[0], w.mount[1] - drop, w.mount[2]);
      part.steer.rotation.y = w.steered ? v.steerAngle : 0;
      part.spin.rotation.x = w.spin;
    });
    this.lamp.intensity = 420 * Math.max(0, Math.min(1, (darkness - 0.3) / 0.5));
    // the antenna shivers a little on its mast when the rover moves
    this.dish.rotation.z = 0.25 + 0.012 * Math.sin(time * 9) * Math.min(1, Math.abs(v.speed) / 3);
  }
}
