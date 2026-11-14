import * as THREE from 'three';
import type { Kit } from '../entities/kit';
import { AIR_DENSITY, EARTH_GRAVITY, FEATHER, HAMMER, PhysicsWorld, ROCK, fallTime, vacuumRange, type Body, type PhysEnv } from './physics';

/** Outcome of dropping a hammer and a feather from the same height. */
export interface DropResult {
  /** Fall times here, s. */
  hammer: number;
  feather: number;
  /** How far the wind carried the feather, m. */
  drift: number;
  /** Extra time the feather would take in Earth's air, s. */
  earthLag: number;
}

/** Outcome of a throw, measured at the first touch on the ground. */
export interface ThrowResult {
  range: number;
  time: number;
  apex: number;
  /** Range of the same throw under Earth's gravity, m. */
  earthRange: number;
}

const DROP_HEIGHT = 1.6;
const MAX_PROPS = 28;

function featherTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 256, 64);
  // vane
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, '#6b5a48');
  grad.addColorStop(0.55, '#9a8468');
  grad.addColorStop(1, '#d9cdb8');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(30, 32);
  g.bezierCurveTo(70, 2, 190, 4, 250, 30);
  g.bezierCurveTo(190, 62, 80, 60, 30, 32);
  g.fill();
  // barbs
  g.strokeStyle = 'rgba(40,30,22,0.35)';
  g.lineWidth = 1;
  for (let x = 40; x < 245; x += 5) {
    g.beginPath();
    g.moveTo(x, 32);
    g.lineTo(x + 12, 6 + (x % 7));
    g.moveTo(x, 32);
    g.lineTo(x + 12, 58 - (x % 7));
    g.stroke();
  }
  // shaft (rachis) and quill
  g.strokeStyle = '#efe6d2';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(2, 32);
  g.lineTo(250, 31);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function rockGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 1 + 0.22 * Math.sin(v.x * 3.1 + v.y * 1.7) * Math.cos(v.z * 2.6 + v.x) + 0.1 * Math.sin(v.y * 7.3 + v.z * 5.1);
    p.setXYZ(i, v.x * n * 1.15, v.y * n * 0.8, v.z * n);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Loose objects the commander can drop or throw, driven by the physics core and shown in 3D.
 * Two experiments use them: Galileo's (a hammer and a feather released together) and a
 * ballistic throw, each reported with what the same act would have done on Earth.
 */
export class Props {
  readonly group = new THREE.Group();
  private world = new PhysicsWorld();
  private views = new Map<number, THREE.Object3D>();
  private drop: { hammer: Body; feather: Body; reported: boolean } | null = null;
  private throws = new Map<number, { speed: number; elevation: number; height: number }>();
  private featherMat: THREE.MeshStandardMaterial;
  private rockGeo = rockGeometry();
  onDrop?: (r: DropResult) => void;
  onThrow?: (r: ThrowResult) => void;
  /** Something hit the ground at `speed` m/s, at (x, y, z). */
  onImpact?: (speed: number, kind: string, x: number, y: number, z: number) => void;

  constructor(private kit: Kit) {
    this.group.name = 'props';
    const map = featherTexture();
    this.featherMat = new THREE.MeshStandardMaterial({ map, alphaTest: 0.4, transparent: false, side: THREE.DoubleSide, roughness: 0.8 });
  }

  /** True while the hammer-and-feather run is still in the air. */
  get dropping(): boolean {
    return !!this.drop && !this.drop.reported;
  }

  clear(): void {
    this.world.clear();
    for (const o of this.views.values()) this.group.remove(o);
    this.views.clear();
    this.drop = null;
    this.throws.clear();
  }

  private view(body: Body): THREE.Object3D {
    const k = this.kit;
    let o: THREE.Object3D;
    if (body.kind === 'hammer') {
      const g = new THREE.Group();
      g.add(k.cyl(0.011, 0.013, 0.3, k.rubber, 0, 0, 0, 10));
      g.add(k.box(0.105, 0.034, 0.034, k.metal, 0, 0.16, 0));
      g.add(k.box(0.02, 0.04, 0.03, k.darkMetal, 0.045, 0.16, 0));
      o = g;
    } else if (body.kind === 'feather') {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.075), this.featherMat);
      o = m;
    } else {
      const m = new THREE.Mesh(this.rockGeo, k.regolith);
      m.scale.setScalar(body.radius * 1.05);
      o = m;
    }
    o.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    o.rotation.set(Math.random() * 0.4, Math.random() * 6.28, body.kind === 'feather' ? 0 : Math.random() * 0.4);
    this.group.add(o);
    this.views.set(body.id, o);
    return o;
  }

  private trim(): void {
    // keep the scene tidy: the oldest objects that have come to rest are picked up again
    while (this.world.bodies.length > MAX_PROPS) {
      const old = this.world.bodies.find((b) => b.resting) ?? this.world.bodies[0];
      const o = this.views.get(old.id);
      if (o) this.group.remove(o);
      this.views.delete(old.id);
      this.throws.delete(old.id);
      this.world.remove(old);
    }
  }

  /**
   * Release a hammer and a feather at the same instant from the same height above the ground
   * beneath each of them, `side` metres to the left and right of (x, z).
   */
  startDrop(x: number, z: number, yaw: number, ground: (x: number, z: number) => number): void {
    if (this.dropping) return;
    // tidy up the previous run
    if (this.drop) {
      for (const b of [this.drop.hammer, this.drop.feather]) {
        const o = this.views.get(b.id);
        if (o) this.group.remove(o);
        this.views.delete(b.id);
        this.world.remove(b);
      }
    }
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const place = (side: number): [number, number] => [x + fx * 0.55 + fz * side, z + fz * 0.55 - fx * side];
    const [hx, hz] = place(0.3);
    const [px, pz] = place(-0.3);
    const hammer = this.world.add(HAMMER, hx, ground(hx, hz) + HAMMER.radius + DROP_HEIGHT, hz);
    const feather = this.world.add(FEATHER, px, ground(px, pz) + FEATHER.radius + DROP_HEIGHT, pz);
    // released from rest: no tumble until something disturbs them
    hammer.wx = hammer.wy = hammer.wz = 0;
    feather.wx = feather.wy = feather.wz = 0;
    this.view(hammer).rotation.set(0, yaw, 0);
    this.view(feather).rotation.set(-Math.PI / 2, yaw + Math.PI / 2, 0);
    this.drop = { hammer, feather, reported: false };
    this.trim();
  }

  /** Throw a rock from (x, y, z) with the given velocity. */
  throwRock(x: number, y: number, z: number, vx: number, vy: number, vz: number, ground: (x: number, z: number) => number): void {
    const body = this.world.add(ROCK, x, y, z, vx, vy, vz);
    const horizontal = Math.hypot(vx, vz);
    this.throws.set(body.id, { speed: Math.hypot(horizontal, vy), elevation: Math.atan2(vy, horizontal), height: Math.max(0, y - ground(x, z)) });
    this.view(body);
    this.trim();
  }

  update(dt: number, env: PhysEnv): void {
    const events = this.world.step(dt, env);
    for (const e of events) {
      const b = e.body;
      if (e.type === 'landed') {
        this.onImpact?.(b.impactSpeed, b.kind, b.landX, b.y - b.radius, b.landZ);
        const th = this.throws.get(b.id);
        if (th) {
          this.throws.delete(b.id);
          this.onThrow?.({
            range: Math.hypot(b.landX - b.x0, b.landZ - b.z0),
            time: b.landedAt ?? 0,
            apex: th.height + b.apex,
            earthRange: vacuumRange(th.speed, th.elevation, EARTH_GRAVITY, th.height),
          });
        }
      }
    }
    const d = this.drop;
    if (d && !d.reported && d.hammer.landedAt !== null && d.feather.landedAt !== null) {
      d.reported = true;
      this.onDrop?.({
        hammer: d.hammer.landedAt,
        feather: d.feather.landedAt,
        drift: Math.hypot(d.feather.landX - d.feather.x0, d.feather.landZ - d.feather.z0),
        earthLag: fallTime(FEATHER, DROP_HEIGHT, EARTH_GRAVITY, AIR_DENSITY.earth) - fallTime(HAMMER, DROP_HEIGHT, EARTH_GRAVITY, AIR_DENSITY.earth),
      });
    }
    for (const b of this.world.bodies) {
      const o = this.views.get(b.id);
      if (!o) continue;
      o.position.set(b.x, b.y, b.z);
      if (b.resting) {
        // settle flat on the ground
        if (b.kind === 'hammer') o.rotation.z += (Math.PI / 2 - o.rotation.z) * Math.min(1, dt * 12);
        if (b.kind === 'feather') o.rotation.x += (-Math.PI / 2 - o.rotation.x) * Math.min(1, dt * 12);
      } else {
        o.rotation.x += b.wx * dt;
        o.rotation.y += b.wy * dt;
        o.rotation.z += b.wz * dt;
      }
    }
  }
}
