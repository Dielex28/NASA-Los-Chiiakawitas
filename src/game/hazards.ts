import * as THREE from 'three';
import type { Kit } from '../entities/kit';
import type { Particles } from '../render/particles';
import { MODULES } from '../sim/catalog';
import { faultLocal, type CatastropheRecord, type Fault } from '../sim/faults';
import type { Instrument } from '../sim/requests';
import type { ModuleState, SimState } from '../sim/types';
import type { World } from '../world/world';
import type { BaseView } from './base';

/**
 * What catastrophes leave behind, drawn in the world: holes with air jetting out, cracks, soot,
 * sparking cables, leaks freezing into ice crystals, fresh craters with bright ejecta rays, and
 * the instruments the crew set out for Mission Control.
 */
type DecalKind = 'hole' | 'crack' | 'scorch' | 'crater';

const textures = new Map<DecalKind, THREE.CanvasTexture>();

function decalTexture(kind: DecalKind): THREE.CanvasTexture {
  const have = textures.get(kind);
  if (have) return have;
  const n = 256;
  const cv = document.createElement('canvas');
  cv.width = n;
  cv.height = n;
  const c = cv.getContext('2d')!;
  const mid = n / 2;
  const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
  if (kind === 'hole') {
    // a ragged puncture with a ring of frost where the escaping air froze
    const g = c.createRadialGradient(mid, mid, 4, mid, mid, mid);
    g.addColorStop(0, 'rgba(235,245,255,0)');
    g.addColorStop(0.25, 'rgba(235,245,255,0.55)');
    g.addColorStop(1, 'rgba(235,245,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, n, n);
    c.fillStyle = '#050607';
    c.beginPath();
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const r = rnd(18, 30);
      c.lineTo(mid + Math.cos(a) * r, mid + Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(60,60,60,0.8)';
    c.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = rnd(0, Math.PI * 2);
      c.beginPath();
      c.moveTo(mid + Math.cos(a) * 26, mid + Math.sin(a) * 26);
      c.lineTo(mid + Math.cos(a) * rnd(45, 70), mid + Math.sin(a) * rnd(45, 70));
      c.stroke();
    }
  } else if (kind === 'crack') {
    c.strokeStyle = 'rgba(10,10,12,0.95)';
    c.lineCap = 'round';
    const branch = (x: number, y: number, a: number, len: number, w: number, depth: number): void => {
      let px = x;
      let py = y;
      for (let s = 0; s < 6; s++) {
        const nx = px + Math.cos(a) * (len / 6);
        const ny = py + Math.sin(a) * (len / 6);
        c.lineWidth = w * (1 - s / 7);
        c.beginPath();
        c.moveTo(px, py);
        c.lineTo(nx, ny);
        c.stroke();
        px = nx;
        py = ny;
        a += rnd(-0.5, 0.5);
        if (depth > 0 && Math.random() < 0.3) branch(px, py, a + rnd(-1, 1), len * 0.45, w * 0.6, depth - 1);
      }
    };
    branch(mid, mid, rnd(0, Math.PI), 120, 5, 2);
    branch(mid, mid, rnd(Math.PI, Math.PI * 2), 110, 5, 2);
  } else if (kind === 'scorch') {
    for (let i = 0; i < 26; i++) {
      const x = mid + rnd(-50, 50);
      const y = mid + rnd(-50, 50);
      const r = rnd(30, 80);
      const g = c.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, 'rgba(8,7,6,0.5)');
      g.addColorStop(1, 'rgba(8,7,6,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, n, n);
    }
  } else {
    // a fresh crater: dark floor, a bright rim and rays of fresh ejecta that space has not darkened yet
    for (let i = 0; i < 40; i++) {
      const a = rnd(0, Math.PI * 2);
      const len = rnd(0.45, 1) * mid;
      const w = rnd(0.04, 0.12);
      c.fillStyle = `rgba(255,252,245,${rnd(0.12, 0.3)})`;
      c.beginPath();
      c.moveTo(mid + Math.cos(a - w) * mid * 0.22, mid + Math.sin(a - w) * mid * 0.22);
      c.lineTo(mid + Math.cos(a) * len, mid + Math.sin(a) * len);
      c.lineTo(mid + Math.cos(a + w) * mid * 0.22, mid + Math.sin(a + w) * mid * 0.22);
      c.closePath();
      c.fill();
    }
    const rim = c.createRadialGradient(mid, mid, mid * 0.12, mid, mid, mid * 0.34);
    rim.addColorStop(0, 'rgba(20,20,22,0.85)');
    rim.addColorStop(0.65, 'rgba(70,70,72,0.7)');
    rim.addColorStop(0.85, 'rgba(240,238,232,0.75)');
    rim.addColorStop(1, 'rgba(240,238,232,0)');
    c.fillStyle = rim;
    c.beginPath();
    c.arc(mid, mid, mid * 0.34, 0, Math.PI * 2);
    c.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  textures.set(kind, tex);
  return tex;
}

function decalMaterial(kind: DecalKind): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ map: decalTexture(kind), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, toneMapped: false });
}

const DECAL_FOR: Partial<Record<Fault['kind'], DecalKind>> = { breach: 'hole', crack: 'crack', scorch: 'scorch' };

interface Placed {
  mesh: THREE.Mesh | null;
  point: THREE.Vector3;
  normal: THREE.Vector3;
}

export class HazardView {
  readonly group = new THREE.Group();
  private placed = new Map<number, Placed>();
  private signature = '';
  private craters = new Set<number>();
  private instruments = new Map<string, THREE.Group>();
  private flash = new THREE.PointLight(0xfff2dd, 0, 260, 1.4);
  private flashT = 0;
  private fireLight = new THREE.PointLight(0xff8a3a, 0, 14, 1.6);
  private ray = new THREE.Raycaster();
  private emit = 0;

  constructor(
    private world: World,
    private kit: Kit,
  ) {
    this.group.name = 'hazards';
    this.flash.castShadow = false;
    this.fireLight.castShadow = false;
    this.group.add(this.flash, this.fireLight);
    world.scene.add(this.group);
  }

  clear(): void {
    for (const p of this.placed.values()) if (p.mesh) this.group.remove(p.mesh);
    this.placed.clear();
    for (const g of this.instruments.values()) this.group.remove(g);
    this.instruments.clear();
    for (const o of [...this.group.children]) if (o.userData.crater) this.group.remove(o);
    this.craters.clear();
    this.signature = '';
  }

  /** Where on the module's real surface a fault sits (a ray toward the module's axis). */
  private place(m: ModuleState, f: Fault, base: BaseView): Placed {
    const [lx, ly, lz] = faultLocal(m, f);
    const c = Math.cos(m.rot);
    const s = Math.sin(m.rot);
    const out = new THREE.Vector3(lx * c + lz * s, 0, -lx * s + lz * c);
    if (out.lengthSq() < 1e-6) out.set(1, 0, 0);
    out.normalize();
    const y = m.y + ly;
    const r = MODULES[m.type].radius + 4;
    const origin = new THREE.Vector3(m.x + out.x * r, y, m.z + out.z * r);
    const view = base.views.get(m.id);
    const point = new THREE.Vector3(m.x + out.x * MODULES[m.type].radius * 0.6, y, m.z + out.z * MODULES[m.type].radius * 0.6);
    const normal = out.clone();
    if (view) {
      this.ray.set(origin, out.clone().negate());
      this.ray.far = r + 2;
      const hit = this.ray.intersectObject(view.group, true).find((h) => (h.object as THREE.Mesh).isMesh && !(h.object as THREE.Mesh).userData.noAssemble);
      if (hit) {
        point.copy(hit.point);
        if (hit.face) normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize();
      }
    }
    const kind = DECAL_FOR[f.kind];
    let mesh: THREE.Mesh | null = null;
    if (kind) {
      const size = f.kind === 'breach' ? 0.45 + Math.min(1.2, f.size / 12) : f.kind === 'crack' ? 1.3 : 1.4 + 2 * f.size;
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), decalMaterial(kind));
      mesh.position.copy(point).addScaledVector(normal, 0.03);
      mesh.lookAt(point.clone().add(normal));
      mesh.rotateZ(Math.random() * Math.PI * 2);
      mesh.renderOrder = 2;
      this.group.add(mesh);
    }
    return { mesh, point, normal };
  }

  /** Keep the drawn damage, craters and instruments in step with the simulation. */
  sync(sim: SimState, base: BaseView): void {
    const faults: Array<{ m: ModuleState; f: Fault }> = [];
    for (const m of sim.modules) for (const f of m.faults ?? []) faults.push({ m, f });
    const sig = faults.map(({ m, f }) => `${f.id}:${m.id}:${m.x.toFixed(1)}:${f.kind === 'scorch' ? f.size.toFixed(1) : ''}`).join('|');
    if (sig !== this.signature) {
      this.signature = sig;
      const alive = new Set(faults.map(({ f }) => f.id));
      for (const [id, p] of this.placed) {
        if (alive.has(id)) continue;
        if (p.mesh) {
          this.group.remove(p.mesh);
          p.mesh.geometry.dispose();
        }
        this.placed.delete(id);
      }
      for (const { m, f } of faults) {
        const have = this.placed.get(f.id);
        if (have && f.kind === 'scorch' && have.mesh) {
          // soot spreads while a fire burns
          const size = 1.4 + 2 * f.size;
          have.mesh.geometry.dispose();
          have.mesh.geometry = new THREE.PlaneGeometry(size, size);
        }
        if (!have) this.placed.set(f.id, this.place(m, f, base));
      }
    }
    for (const rec of sim.catastrophes ?? []) if (rec.kind === 'impact' && !this.craters.has(rec.id)) this.addCrater(rec);
    for (const ins of sim.requests?.instruments ?? []) {
      const key = `${ins.kind}:${ins.x.toFixed(1)}:${ins.z.toFixed(1)}`;
      if (!this.instruments.has(key)) this.addInstrument(key, ins);
    }
  }

  /** A crater decal laid over the ground (a small grid that follows the terrain). */
  private addCrater(rec: CatastropheRecord): void {
    this.craters.add(rec.id);
    const size = rec.mag * 3.2;
    const segs = 20;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + rec.x;
      const z = pos.getZ(i) + rec.z;
      pos.setY(i, this.world.ground(x, z) + 0.07);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, decalMaterial('crater'));
    mesh.position.set(rec.x, 0, rec.z);
    mesh.userData.crater = true;
    mesh.renderOrder = 1;
    this.group.add(mesh);
  }

  private addInstrument(key: string, ins: Instrument): void {
    const k = this.kit;
    const g = new THREE.Group();
    const y = this.world.ground(ins.x, ins.z);
    g.position.set(ins.x, y, ins.z);
    if (ins.kind === 'seismometer') {
      // a foil-wrapped dome on a levelled base, its thermal skirt spread on the ground
      g.add(k.cyl(0.9, 0.9, 0.02, k.foil, 0, 0.02, 0, 24));
      g.add(k.cyl(0.22, 0.26, 0.38, k.foil, 0, 0.21, 0, 16));
      g.add(k.sphere(0.23, k.foil, 0, 0.4, 0, 16, 10));
      g.add(k.cyl(0.02, 0.02, 0.9, k.darkMetal, 0.5, 0.45, 0, 6));
    } else if (ins.kind === 'reflector') {
      // an array of corner-cube prisms tilted toward Earth, as on Apollo 11, 14 and 15
      const tray = new THREE.Group();
      tray.position.y = 0.45;
      tray.rotation.x = -0.6;
      tray.add(k.box(0.9, 0.05, 0.7, k.metal));
      for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) tray.add(k.cyl(0.055, 0.055, 0.06, k.glass, -0.36 + i * 0.145, 0.05, -0.24 + j * 0.16, 8));
      g.add(tray);
      for (const [x, z] of [
        [-0.35, 0.25],
        [0.35, 0.25],
        [0, -0.3],
      ])
        g.add(k.strut(new THREE.Vector3(x, 0, z), new THREE.Vector3(x * 0.5, 0.42, z * 0.5), 0.02, k.metal, 6));
    } else {
      // a weather mast with a wind sensor, a dust sensor and a solar cell
      g.add(k.cyl(0.03, 0.04, 1.8, k.metal, 0, 0.9, 0, 8));
      g.add(k.box(0.5, 0.04, 0.04, k.metal, 0, 1.6, 0));
      g.add(k.box(0.12, 0.12, 0.12, k.hull, 0.24, 1.6, 0));
      g.add(k.box(0.12, 0.12, 0.12, k.accent, -0.24, 1.6, 0));
      g.add(k.box(0.35, 0.02, 0.25, k.solar, 0, 1.0, 0.1));
    }
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    this.instruments.set(key, g);
    this.group.add(g);
  }

  /**
   * A catastrophe has just struck: draw it. Returns how hard the camera should shake (0..1).
   */
  strike(rec: CatastropheRecord, sim: SimState, dust: Particles, sparks: Particles): number {
    const moon = sim.world === 'moon';
    if (rec.kind === 'impact') {
      const y = this.world.ground(rec.x, rec.z);
      this.flash.position.set(rec.x, y + 4, rec.z);
      this.flash.intensity = 4000;
      this.flashT = 0.6;
      // ejecta: on the airless Moon every grain flies a perfect arc
      const [r, g, b] = moon ? [0.62, 0.61, 0.6] : [0.78, 0.47, 0.28];
      const n = Math.min(900, Math.round(rec.mag * 60));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const up = 0.4 + Math.random() * 0.9;
        const v = (8 + Math.random() * 30) * Math.min(1.8, rec.mag / 8);
        dust.spawn(rec.x, y + 0.3, rec.z, Math.cos(a) * v * Math.cos(up), Math.sin(up) * v, Math.sin(a) * v * Math.cos(up), 2.5 + Math.random() * 3, 0.5 + Math.random() * 1.2, r, g, b, 0.75);
      }
      for (let i = 0; i < 120; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 10 + Math.random() * 30;
        sparks.spawn(rec.x, y + 0.5, rec.z, Math.cos(a) * v, 4 + Math.random() * 18, Math.sin(a) * v, 0.4 + Math.random() * 0.5, 0.16, 4, 3, 1.8, 1);
      }
      return 0.6;
    }
    if (rec.kind === 'quake') {
      // shaken loose: a ring of dust lifts off the ground all around the base
      const cx = sim.modules[0]?.x ?? 0;
      const cz = sim.modules[0]?.z ?? 0;
      const [r, g, b] = moon ? [0.62, 0.61, 0.6] : [0.78, 0.47, 0.28];
      for (let i = 0; i < 260; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 4 + Math.random() * 60;
        const x = cx + Math.cos(a) * d;
        const z = cz + Math.sin(a) * d;
        dust.spawn(x, this.world.ground(x, z) + 0.05, z, (Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 1.6, (Math.random() - 0.5) * 0.8, 1.4 + Math.random(), 0.35 + Math.random() * 0.4, r, g, b, 0.55);
      }
      return Math.min(1, 0.3 + (rec.mag - 2.5) * 0.3);
    }
    if (rec.kind === 'runaway' || rec.kind === 'fire') {
      for (let i = 0; i < 60; i++) {
        const a = Math.random() * Math.PI * 2;
        sparks.spawn(rec.x, this.world.ground(rec.x, rec.z) + 1.2, rec.z, Math.cos(a) * 3, 2 + Math.random() * 4, Math.sin(a) * 3, 0.5 + Math.random() * 0.6, 0.1, 3.2, 1.6, 0.5, 1);
      }
      return 0.15;
    }
    return 0;
  }

  /** Air jetting from holes, sparks from cut cables, ice from leaks, smoke and glow from a fire. */
  update(dt: number, time: number, sim: SimState, dust: Particles, sparks: Particles): void {
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flash.intensity = Math.max(0, this.flashT / 0.6) ** 2 * 4000;
    } else this.flash.intensity = 0;
    this.emit += dt;
    const burst = this.emit > 0.05;
    if (burst) this.emit = 0;
    for (const m of sim.modules) {
      for (const f of m.faults ?? []) {
        const p = this.placed.get(f.id);
        if (!p || !burst) continue;
        const { point, normal } = p;
        if (f.kind === 'breach' && !m.down) {
          // escaping air freezes into a jet of ice crystals that streams straight out
          const v = 4 + Math.min(10, f.size);
          for (let i = 0; i < 3; i++) {
            dust.spawn(point.x, point.y, point.z, normal.x * v + (Math.random() - 0.5), normal.y * v + (Math.random() - 0.5), normal.z * v + (Math.random() - 0.5), 0.6 + Math.random() * 0.5, 0.18 + Math.random() * 0.2, 0.95, 0.97, 1, 0.55);
          }
        } else if (f.kind === 'wiring' && Math.random() < 0.25) {
          sparks.spawn(m.x + normal.x, m.y + 0.5, m.z + normal.z, (Math.random() - 0.5) * 3, 1 + Math.random() * 3, (Math.random() - 0.5) * 3, 0.25 + Math.random() * 0.3, 0.06, 3.4, 2.4, 0.9, 1);
        } else if (f.kind === 'leak' && Math.random() < 0.5) {
          dust.spawn(m.x + normal.x * 1.2, m.y + 0.6, m.z + normal.z * 1.2, normal.x * 0.8, 0.4, normal.z * 0.8, 1.2, 0.25, 0.9, 0.95, 1, 0.45);
        }
      }
    }
    // a fire inside: firelight in the windows and smoke escaping round the hatch
    const e = sim.emergency;
    const burning = e && e.kind === 'fire' && (!e.choice || (e.choice === 'extinguish' && (e.doneH ?? 0) > sim.timeH));
    const fm = burning ? sim.modules.find((m) => m.id === e.moduleId) : undefined;
    if (fm) {
      this.fireLight.position.set(fm.x, fm.y + 2.2, fm.z);
      this.fireLight.intensity = 40 + 30 * Math.sin(time * 17) * Math.sin(time * 7.3);
      if (burst) dust.spawn(fm.x + (Math.random() - 0.5) * 2, fm.y + 3.5, fm.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 0.6, 1.2 + Math.random(), (Math.random() - 0.5) * 0.6, 2.5, 0.8, 0.12, 0.11, 0.1, 0.6);
    } else this.fireLight.intensity = 0;
  }
}
