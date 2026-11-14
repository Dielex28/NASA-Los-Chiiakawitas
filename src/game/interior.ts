import * as THREE from 'three';
import type { CrewMember, ModuleState, SimState } from '../sim/types';
import { totalDose } from '../sim/sim';
import type { Input } from './input';

/** What the inside of a module holds. */
export type RoomKind = 'hab' | 'lab' | 'greenhouse' | 'lander';

const LOOKS = [
  { skin: 0xc68a5e, hair: 0x1f1a17 },
  { skin: 0x7a4a2c, hair: 0x151210 },
  { skin: 0xf0cdb1, hair: 0xd9b77c },
  { skin: 0xb07850, hair: 0x2a211c },
  { skin: 0xa8714c, hair: 0x120f0d },
  { skin: 0x9c6644, hair: 0x0f0c0a },
];
const ROLE: Record<CrewMember['role'], number> = {
  commander: 0xf2a93b,
  engineer: 0x5bc8e8,
  botanist: 0x7bd88f,
  geologist: 0xe0a36b,
  medic: 0xff8a80,
  pilot: 0xc9a6ff,
};

type Pose = 'stand' | 'sit' | 'lie' | 'run' | 'kneel';

/** A crew member in flight overalls: simple shapes, the colour of their speciality on the shirt. */
class Person {
  readonly group = new THREE.Group();
  private readonly legs: THREE.Mesh[] = [];
  private readonly body: THREE.Group;
  pose: Pose = 'stand';

  constructor(c: CrewMember, mats: { cloth: THREE.Material }) {
    const look = LOOKS[(c.id - 1) % LOOKS.length];
    const skin = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.7 });
    const hair = new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.9 });
    const shirt = new THREE.MeshStandardMaterial({ color: ROLE[c.role], roughness: 0.8 });
    this.body = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.42, 4, 10), shirt);
    torso.position.y = 1.18;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), skin);
    head.position.y = 1.62;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.137, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    cap.position.y = 1.635;
    cap.rotation.x = -0.25;
    const armGeo = new THREE.CapsuleGeometry(0.055, 0.42, 3, 8);
    const armL = new THREE.Mesh(armGeo, shirt);
    armL.position.set(0.25, 1.2, 0);
    armL.rotation.z = 0.12;
    const armR = armL.clone();
    armR.position.x = -0.25;
    armR.rotation.z = -0.12;
    this.body.add(torso, head, cap, armL, armR);
    const legGeo = new THREE.CapsuleGeometry(0.075, 0.62, 3, 8);
    for (const x of [-0.1, 0.1]) {
      const leg = new THREE.Mesh(legGeo, mats.cloth);
      leg.position.set(x, 0.45, 0);
      this.legs.push(leg);
      this.body.add(leg);
    }
    this.group.add(this.body);
  }

  update(time: number, phase: number): void {
    const b = this.body;
    b.rotation.set(0, 0, 0);
    b.position.set(0, 0, 0);
    for (const l of this.legs) {
      l.rotation.x = 0;
      l.position.y = 0.45;
      l.position.z = 0;
    }
    if (this.pose === 'sit') {
      b.position.y = -0.4;
      for (const l of this.legs) {
        l.rotation.x = -Math.PI / 2;
        l.position.set(l.position.x, 0.82, 0.3);
      }
    } else if (this.pose === 'lie') {
      b.rotation.z = Math.PI / 2;
      b.position.set(0.85, 0.15, 0);
    } else if (this.pose === 'run') {
      const s = Math.sin(time * 9 + phase);
      this.legs[0].rotation.x = s * 0.55;
      this.legs[1].rotation.x = -s * 0.55;
      b.position.y = Math.abs(Math.cos(time * 9 + phase)) * 0.04;
    } else if (this.pose === 'kneel') {
      b.position.y = -0.35;
      b.rotation.x = 0.25;
      this.legs[0].rotation.x = -Math.PI / 2;
      this.legs[0].position.set(this.legs[0].position.x, 0.75, 0.32);
    } else {
      // standing: a slow breath so nobody looks frozen
      b.position.y = Math.sin(time * 1.4 + phase) * 0.006;
    }
  }
}

/** A canvas screen on the wall showing the base's live numbers. */
class WallScreen {
  readonly mesh: THREE.Mesh;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private sig = '';

  constructor(w: number, h: number) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = Math.round((512 * h) / w);
    this.ctx = canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
  }

  draw(lines: Array<[string, string, string]>, title: string): void {
    const sig = title + lines.map((l) => l.join()).join();
    if (sig === this.sig) return;
    this.sig = sig;
    const c = this.ctx;
    const W = c.canvas.width;
    const H = c.canvas.height;
    c.fillStyle = '#0b0e12';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#f2a93b';
    c.font = 'bold 26px monospace';
    c.fillText(title, 24, 44);
    c.font = '24px monospace';
    lines.forEach(([k, v, col], i) => {
      const y = 92 + i * 38;
      c.fillStyle = '#a9b3be';
      c.fillText(k, 24, y);
      c.fillStyle = col;
      c.textAlign = 'right';
      c.fillText(v, W - 24, y);
      c.textAlign = 'left';
    });
    this.tex.needsUpdate = true;
  }
}

/**
 * The inside of a module: a pressurised cylinder with a deck, lights, the furniture of its job,
 * a screen with live numbers, a porthole to the outside and the crew doing what the base is doing
 * — sleeping at night, exercising if you scheduled it, sheltering from a storm, fixing an
 * emergency. You look around from inside; the mission keeps running.
 */
export class Interior {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(72, 1, 0.05, 60);
  readonly kind: RoomKind;
  readonly moduleId: number;
  private readonly length: number;
  private readonly radius = 2.3;
  private yaw = -Math.PI / 2;
  private pitch = -0.08;
  private along: number;
  private readonly people = new Map<number, Person>();
  private readonly screen: WallScreen;
  private readonly window: THREE.MeshBasicMaterial;
  private readonly lights: THREE.PointLight[] = [];
  private readonly alarm: THREE.PointLight;
  private plants: THREE.InstancedMesh | null = null;
  private readonly spots: Record<string, THREE.Vector3[]> = {};
  private readonly mats: { cloth: THREE.Material };

  constructor(module: ModuleState, world: 'moon' | 'mars') {
    this.moduleId = module.id;
    this.kind = (module.type === 'lab' || module.type === 'greenhouse' || module.type === 'hab' ? module.type : 'lander') as RoomKind;
    this.length = { hab: 8.5, lab: 6.5, greenhouse: 9, lander: 4.2 }[this.kind];
    this.along = -this.length / 2 + 0.9;
    const L = this.length;
    const R = this.radius;
    const s = this.scene;
    s.background = new THREE.Color(0x05070a);
    this.mats = { cloth: new THREE.MeshStandardMaterial({ color: 0x2b3442, roughness: 0.85 }) };

    // shell: panelled wall, end bulkheads, deck
    const wallTex = panelTexture();
    wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
    wallTex.repeat.set(L / 1.2, 6);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 48, 1, true), new THREE.MeshStandardMaterial({ map: wallTex, side: THREE.BackSide, roughness: 0.75, color: 0xe8ebee }));
    wall.rotation.z = Math.PI / 2;
    const capMat = new THREE.MeshStandardMaterial({ color: 0xcfd5db, roughness: 0.7, side: THREE.DoubleSide });
    const hatchMat = new THREE.MeshStandardMaterial({ color: 0x7d8792, roughness: 0.5, metalness: 0.4 });
    for (const sx of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.CircleGeometry(R, 48), capMat);
      cap.position.x = (sx * L) / 2;
      cap.rotation.y = (sx * Math.PI) / 2;
      const hatch = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 10, 40), hatchMat);
      hatch.position.set((sx * L) / 2 - sx * 0.02, -0.25, 0);
      hatch.rotation.y = Math.PI / 2;
      s.add(cap, hatch);
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(L, 0.08, R * 1.7), new THREE.MeshStandardMaterial({ color: 0x5e6873, roughness: 0.6, metalness: 0.3 }));
    deck.position.y = -1.04;
    s.add(wall, deck);

    // porthole on the far bulkhead: the outside light (Moon: black sky; Mars: butterscotch)
    this.window = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
    const port = new THREE.Mesh(new THREE.CircleGeometry(0.36, 32), this.window);
    port.position.set(L / 2 - 0.03, 0.75, 0.9);
    port.rotation.y = -Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.05, 8, 32), hatchMat);
    rim.position.copy(port.position);
    rim.rotation.y = Math.PI / 2;
    s.add(port, rim);
    void world;

    // light: a ceiling strip and warm panels (magenta grow lights in the greenhouse)
    s.add(new THREE.HemisphereLight(0xdfe8f2, 0x3a3f46, 0.55));
    const strip = new THREE.Mesh(new THREE.BoxGeometry(L * 0.9, 0.04, 0.22), new THREE.MeshBasicMaterial({ color: 0xfff4e0, toneMapped: false }));
    strip.position.y = R - 0.22;
    s.add(strip);
    const n = Math.max(2, Math.round(L / 3));
    for (let i = 0; i < n; i++) {
      const p = new THREE.PointLight(0xfff1dc, 9, 9, 1.6);
      p.position.set(-L / 2 + ((i + 0.5) * L) / n, R - 0.5, 0);
      this.lights.push(p);
      s.add(p);
    }
    this.alarm = new THREE.PointLight(0xff3b2f, 0, 12, 1.5);
    this.alarm.position.set(0, R - 0.6, 0);
    s.add(this.alarm);

    // a wall screen with the base's numbers
    this.screen = new WallScreen(1.5, 0.95);
    this.screen.mesh.position.set(this.kind === 'lander' ? 0.4 : -L / 2 + 2.2, 0.55, R * 0.78);
    this.screen.mesh.rotation.y = Math.PI;
    s.add(this.screen.mesh);

    const furniture = new THREE.MeshStandardMaterial({ color: 0xb8c0c8, roughness: 0.55, metalness: 0.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a323b, roughness: 0.6 });
    const soft = new THREE.MeshStandardMaterial({ color: 0x4f6d8f, roughness: 0.95 });
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      s.add(b);
      return b;
    };
    const floor = -1.0;
    this.spots.stand = [];
    this.spots.sit = [];
    this.spots.lie = [];
    this.spots.run = [];
    this.spots.work = [];

    if (this.kind === 'hab') {
      // crew quarters: four bunks along one wall
      for (let i = 0; i < 2; i++) {
        for (let k = 0; k < 2; k++) {
          const x = 0.6 + i * 2.1;
          const y = floor + 0.35 + k * 0.95;
          box(2, 0.08, 0.8, furniture, x + 1, y, -1.35);
          box(1.9, 0.12, 0.72, soft, x + 1, y + 0.1, -1.35);
          this.spots.lie.push(new THREE.Vector3(x + 0.15, y + 0.1, -1.35));
        }
      }
      // galley: table and stools
      box(1.2, 0.06, 0.8, furniture, -1.4, floor + 0.75, -0.6);
      box(0.08, 0.72, 0.08, dark, -1.4, floor + 0.38, -0.6);
      for (const [dx, dz] of [[-0.55, -0.6], [0.55, -0.6], [-0.55, 0.15], [0.55, 0.15]] as const) {
        box(0.34, 0.06, 0.34, dark, -1.4 + dx, floor + 0.45, -0.6 + dz + (dz < 0 ? 0.25 : 0));
        this.spots.sit.push(new THREE.Vector3(-1.4 + dx, floor, -0.6 + dz + (dz < 0 ? 0.25 : 0)));
      }
      // exercise corner: treadmill with harness and a bike
      box(1.6, 0.12, 0.6, dark, 2.6, floor + 0.08, 0.95);
      box(0.06, 1.3, 0.06, furniture, 3.35, floor + 0.7, 0.95);
      this.spots.run.push(new THREE.Vector3(2.6, floor + 0.14, 0.95));
      // lockers and life support racks
      for (let i = 0; i < 3; i++) box(0.7, 1.6, 0.5, i === 1 ? hatchMat : furniture, -3.5 + i * 0.75, floor + 0.85, 1.55);
      this.spots.work.push(new THREE.Vector3(-L / 2 + 2.2, floor, 1.2), new THREE.Vector3(-2.75, floor, 1.0));
      this.spots.stand.push(new THREE.Vector3(0.2, floor, 0.4), new THREE.Vector3(-0.6, floor, 1.0));
    } else if (this.kind === 'lab') {
      // workbench, glovebox, microscope and sample racks
      box(L * 0.7, 0.07, 0.75, furniture, 0, floor + 0.92, -1.25);
      const glove = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: 0xb5d7e8, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.35 }));
      glove.position.set(-1.2, floor + 1.26, -1.25);
      s.add(glove);
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.45, 12), dark);
      scope.position.set(0.9, floor + 1.18, -1.2);
      s.add(scope);
      for (let i = 0; i < 6; i++) box(0.5, 0.06, 0.4, furniture, 1.8, floor + 0.6 + i * 0.28, 1.55);
      this.spots.work.push(new THREE.Vector3(-1.2, floor, -0.55), new THREE.Vector3(0.9, floor, -0.55));
      this.spots.stand.push(new THREE.Vector3(1.6, floor, 0.9));
      this.spots.sit.push(new THREE.Vector3(-1.2, floor, -0.55));
    } else if (this.kind === 'greenhouse') {
      // three tiers of planters under magenta LEDs, the crop sized by its growth
      const plantGeo = new THREE.SphereGeometry(0.1, 8, 6);
      const plantMat = new THREE.MeshStandardMaterial({ color: 0x4f9a4a, roughness: 0.8 });
      const count = 3 * 2 * 18;
      const plants = new THREE.InstancedMesh(plantGeo, plantMat, count);
      this.plants = plants;
      s.add(plants);
      const grow = new THREE.MeshBasicMaterial({ color: 0xff4fd8, toneMapped: false });
      for (const z of [-1.3, 1.3]) {
        for (let k = 0; k < 3; k++) {
          const y = floor + 0.35 + k * 0.6;
          box(L * 0.8, 0.12, 0.55, furniture, 0, y, z);
          const bar = box(L * 0.8, 0.03, 0.08, grow, 0, y + 0.45, z);
          void bar;
        }
        const pl = new THREE.PointLight(0xff5fd6, 6, 6, 1.5);
        pl.position.set(0, 0.2, z * 0.7);
        s.add(pl);
      }
      this.spots.work.push(new THREE.Vector3(-1.5, floor, -0.6), new THREE.Vector3(1.8, floor, 0.6));
      this.spots.stand.push(new THREE.Vector3(0.2, floor, 0));
    } else {
      // the lander's cabin: two seats facing the windows and the flight console
      for (const z of [-0.6, 0.6]) {
        box(0.6, 0.1, 0.6, soft, 0.9, floor + 0.5, z);
        box(0.6, 0.7, 0.1, soft, 0.6, floor + 0.85, z);
        this.spots.sit.push(new THREE.Vector3(0.9, floor + 0.05, z));
      }
      box(0.5, 1.1, 1.8, dark, 1.85, floor + 0.55, 0);
      this.spots.stand.push(new THREE.Vector3(-0.8, floor, 0.5), new THREE.Vector3(-0.8, floor, -0.5));
      this.spots.lie.push(new THREE.Vector3(-1.4, floor + 0.15, -1.0), new THREE.Vector3(-1.4, floor + 0.15, 1.0));
    }
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Look around (drag), move along the module (W/S, wheel). */
  update(dt: number, time: number, sim: SimState, input: Input, allowInput: boolean): void {
    if (allowInput) {
      if (input.buttons & 1 || input.locked) {
        this.yaw -= input.dx * 0.004;
        this.pitch = Math.max(-1.1, Math.min(1.1, this.pitch - input.dy * 0.004));
      }
      const fwd = (input.key('KeyW') || input.key('ArrowUp') ? 1 : 0) - (input.key('KeyS') || input.key('ArrowDown') ? 1 : 0) + input.stickY;
      this.along += (fwd * 1.8 * dt - input.wheel * 0.35) * 1;
      this.yaw -= input.stickX * 1.4 * dt;
    }
    const half = this.length / 2 - 0.6;
    this.along = Math.max(-half, Math.min(half, this.along));
    this.camera.position.set(this.along, 0.62, 0);
    const cp = Math.cos(this.pitch);
    const a = this.yaw + Math.PI / 2;
    this.camera.lookAt(this.along + Math.cos(a) * cp, 0.62 + Math.sin(this.pitch), Math.sin(a) * cp);
    this.populate(sim, time);
    this.updateScreen(sim);
    // the outside, through the porthole
    const sun = sim.env.sunVisBase;
    this.window.color.set(sim.world === 'mars' ? 0xd4a373 : 0x222630).multiplyScalar(sim.world === 'mars' ? 0.15 + sun * 0.85 : 0.2 + sun * 0.5);
    // power: lights dim in a blackout; red rotating alarm in an emergency
    const dim = sim.power.blackout ? 0.15 : sim.powerSave === 2 ? 0.45 : 1;
    for (const l of this.lights) l.intensity = 9 * dim;
    const alarm = (sim.emergency && !sim.emergency.choice) || sim.power.blackout;
    this.alarm.intensity = alarm ? 6 * (0.5 + 0.5 * Math.sin(time * 6)) : 0;
    if (this.plants) this.updatePlants(sim);
  }

  /** Who is here and what they are doing, from the state of the base. */
  private populate(sim: SimState, time: number): void {
    const night = sim.world === 'mars' ? sim.env.sunEl < -0.1 : false;
    const hour = sim.env.localH;
    const sleeping = night || (sim.world === 'moon' && (hour < 6 || hour >= 22));
    const here = sim.crew.filter((c) => c.health > 0 && !(c.isPlayer && sim.playerOutside));
    // who goes where: the specialist works in their own room, everyone else lives in the habitat
    const inRoom = here.filter((c) => {
      if (this.kind === 'lab') return c.role === 'geologist' || c.role === 'engineer';
      if (this.kind === 'greenhouse') return c.role === 'botanist';
      if (this.kind === 'lander') return !sim.modules.some((m) => m.type === 'hab' && m.built >= 1);
      return c.role !== 'botanist' || !sim.modules.some((m) => m.type === 'greenhouse' && m.built >= 1);
    });
    const used = new Set<number>();
    const counters: Record<string, number> = {};
    const take = (kind: string): THREE.Vector3 | null => {
      const list = this.spots[kind] ?? [];
      const i = counters[kind] ?? 0;
      counters[kind] = i + 1;
      return list[i] ?? null;
    };
    inRoom.forEach((c, i) => {
      let p = this.people.get(c.id);
      if (!p) {
        p = new Person(c, this.mats);
        this.people.set(c.id, p);
        this.scene.add(p.group);
      }
      used.add(c.id);
      let spot: THREE.Vector3 | null = null;
      let pose: Pose = 'stand';
      if (sim.shelterOrder || (sim.emergency && !sim.emergency.choice)) {
        spot = take('stand') ?? take('work');
        pose = 'stand';
      } else if (sleeping && (spot = take('lie'))) pose = 'lie';
      else if ((sim.exercise ?? 0) > 0 && i === Math.floor(time / 40) % Math.max(1, inRoom.length) && (spot = take('run'))) pose = 'run';
      else if ((spot = take('work'))) pose = this.kind === 'greenhouse' ? 'kneel' : 'stand';
      else if ((spot = take('sit'))) pose = 'sit';
      else spot = take('stand');
      if (!spot) spot = new THREE.Vector3(-1 + i * 0.7, -1, 0.3);
      p.pose = pose;
      p.group.position.set(spot.x, spot.y + (pose === 'lie' ? 0 : 0), spot.z);
      p.group.rotation.y = pose === 'run' ? Math.PI / 2 : spot.z > 0 ? Math.PI : 0;
      p.group.visible = true;
      p.update(time, c.id * 1.7);
    });
    for (const [id, p] of this.people) if (!used.has(id)) p.group.visible = false;
  }

  private updateScreen(sim: SimState): void {
    const f = sim.flows;
    const n = Math.max(1, sim.crew.length);
    const dose = sim.crew.reduce((a, c) => a + totalDose(c), 0) / n;
    const col = (bad: boolean, warn: boolean): string => (bad ? '#ff6b5e' : warn ? '#f2c94c' : '#7bd88f');
    this.screen.draw(
      [
        ['O2', `${f.o2Days.toFixed(1)} d`, col(f.o2Days < 3, f.o2Days < 8)],
        ['H2O', `${f.waterDays.toFixed(1)} d`, col(f.waterDays < 3, f.waterDays < 8)],
        ['CO2', `${f.co2MmHg.toFixed(1)} mmHg`, col(f.co2MmHg > 6, f.co2MmHg > 4)],
        ['kW', `${(sim.power.genKw - sim.power.servedKw).toFixed(1)}`, col(sim.power.blackout, sim.power.genKw < sim.power.servedKw)],
        ['mSv', `${dose.toFixed(1)}`, col(dose > sim.cfg.doseLimitMsv, dose > sim.cfg.doseLimitMsv * 0.7)],
        ['°C', `${sim.cabin.tempC.toFixed(0)}`, col(sim.cabin.tempC < 12, sim.cabin.tempC < 17)],
      ],
      sim.emergency && !sim.emergency.choice ? '!! ALERT !!' : 'HELIOS OUTPOST',
    );
  }

  private updatePlants(sim: SimState): void {
    const gh = sim.modules.find((m) => m.id === this.moduleId);
    const growth = gh ? Math.max(0.05, gh.growth ?? 0) * (gh.cropHealth ?? 1) : 0.3;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const L = this.length;
    let i = 0;
    for (const z of [-1.3, 1.3]) {
      for (let k = 0; k < 3; k++) {
        const y = -1.0 + 0.35 + k * 0.6 + 0.08;
        for (let j = 0; j < 18; j++) {
          const x = -L * 0.38 + (j / 17) * L * 0.76;
          const s = 0.4 + growth * 1.6 * (0.8 + 0.2 * Math.sin(j * 7.1 + k));
          m.compose(new THREE.Vector3(x, y + 0.05 * s, z + ((j % 2) - 0.5) * 0.2), q, new THREE.Vector3(s, s * 1.3, s));
          this.plants!.setMatrixAt(i++, m);
        }
      }
    }
    this.plants!.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
  }
}

/** White wall panels with seams, handrails and the odd label, drawn once. */
function panelTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e6e9ec';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#b9c0c7';
  g.lineWidth = 3;
  g.strokeRect(4, 4, 248, 248);
  g.strokeStyle = '#cfd5db';
  g.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.arc(30 + i * 64, 30, 4, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = '#9aa3ad';
  g.fillRect(16, 120, 224, 6);
  g.fillStyle = '#f2a93b';
  g.fillRect(200, 200, 34, 14);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
