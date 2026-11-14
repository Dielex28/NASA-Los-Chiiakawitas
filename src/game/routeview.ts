import * as THREE from 'three';
import type { RoutePoint } from '../sim/route';
import { SLOPE_STEEP, SLOPE_WARN } from '../sim/route';

const OK = new THREE.Color(0x9ec5ff);
const WARN = new THREE.Color(0xf2a93b);
const BAD = new THREE.Color(0xff6b5e);

/**
 * The planned traverse drawn on the ground: a line draped over the terrain, coloured by slope,
 * and a beacon at every waypoint (the next one taller and brighter while out on EVA).
 */
export class RouteView {
  readonly group = new THREE.Group();
  private line: THREE.Line | null = null;
  private beacons: THREE.Group[] = [];
  private readonly poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 6);
  private readonly headGeo = new THREE.OctahedronGeometry(0.55, 0);
  private readonly poleMat = new THREE.MeshBasicMaterial({ color: 0x9ec5ff, transparent: true, opacity: 0.85, depthWrite: false });
  private readonly headMat = new THREE.MeshBasicMaterial({ color: 0x9ec5ff });
  private readonly doneMat = new THREE.MeshBasicMaterial({ color: 0x5e6873 });
  private readonly nextMat = new THREE.MeshBasicMaterial({ color: 0xf2c94c });

  constructor() {
    this.group.name = 'eva-route';
    this.group.renderOrder = 5;
  }

  /** Rebuild for a new set of points (start = the airlock the walk begins and ends at). */
  set(start: RoutePoint, points: RoutePoint[], ground: (x: number, z: number) => number): void {
    this.clear();
    if (!points.length) return;
    const path = [start, ...points, start];
    const pos: number[] = [];
    const col: number[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const dist = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(1, Math.ceil(dist / 3));
      let prev = ground(a.x, a.z);
      for (let k = i === 0 ? 0 : 1; k <= n; k++) {
        const x = a.x + ((b.x - a.x) * k) / n;
        const z = a.z + ((b.z - a.z) * k) / n;
        const y = ground(x, z);
        const slope = k === 0 ? 0 : (Math.atan2(Math.abs(y - prev), dist / n) * 180) / Math.PI;
        prev = y;
        pos.push(x, y + 0.35, z);
        // the way home is drawn dimmer
        const c = (slope > SLOPE_STEEP ? BAD : slope > SLOPE_WARN ? WARN : OK).clone().multiplyScalar(i === path.length - 2 ? 0.55 : 1);
        col.push(c.r, c.g, c.b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
    this.line.frustumCulled = false;
    this.group.add(this.line);
    points.forEach((p) => {
      const b = new THREE.Group();
      const pole = new THREE.Mesh(this.poleGeo, this.poleMat);
      pole.scale.y = 6;
      pole.position.y = 3;
      const head = new THREE.Mesh(this.headGeo, this.headMat);
      head.position.y = 6.4;
      b.add(pole, head);
      b.position.set(p.x, ground(p.x, p.z), p.z);
      this.group.add(b);
      this.beacons.push(b);
    });
  }

  /**
   * Waypoints before `next` are done; `next` stands out (pass -1 when not on EVA). `zoom` grows
   * the beacons with the camera distance so they stay visible from the command view.
   */
  setNext(next: number, time: number, zoom = 1): void {
    this.beacons.forEach((b, i) => {
      const pole = b.children[0] as THREE.Mesh;
      const head = b.children[1] as THREE.Mesh;
      head.material = i < next ? this.doneMat : i === next ? this.nextMat : this.headMat;
      // heads grow with the zoom; poles only a little, so from above they stay pins, not sticks
      const tall = 6 * (i === next ? 1.5 : 1) * Math.sqrt(zoom);
      pole.scale.set(Math.sqrt(zoom), tall, Math.sqrt(zoom));
      pole.position.y = tall / 2;
      head.scale.setScalar((i === next ? 1.6 + 0.25 * Math.sin(time * 4) : 1) * zoom);
      head.position.y = tall + 0.4 * zoom;
      head.rotation.y = time * 1.2 + i;
    });
  }

  clear(): void {
    if (this.line) {
      this.line.geometry.dispose();
      (this.line.material as THREE.Material).dispose();
      this.group.remove(this.line);
      this.line = null;
    }
    for (const b of this.beacons) this.group.remove(b);
    this.beacons = [];
  }
}
