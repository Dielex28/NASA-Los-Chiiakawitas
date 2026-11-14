import * as THREE from 'three';

const CAPACITY = 420;

/** Boot-sole print: a rounded outline crossed by tread lugs, as an alpha mask. */
function treadTexture(): THREE.CanvasTexture {
  const w = 64;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, w, h);
  const outline = (): void => {
    g.beginPath();
    g.moveTo(14, 20);
    g.bezierCurveTo(14, 2, 50, 2, 50, 20);
    g.lineTo(52, 74);
    g.bezierCurveTo(54, 92, 50, 124, 32, 124);
    g.bezierCurveTo(14, 124, 10, 92, 12, 74);
    g.closePath();
  };
  outline();
  g.fillStyle = 'rgba(255,255,255,0.42)';
  g.fill();
  g.save();
  outline();
  g.clip();
  g.fillStyle = 'rgba(255,255,255,0.95)';
  for (let y = 8; y < h; y += 13) g.fillRect(0, y, w, 6);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

/** Tyre print: the chevron cleats of a wire-mesh wheel, as an alpha mask (tiles end to end). */
function tyreTexture(): THREE.CanvasTexture {
  const w = 64;
  const h = 64;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.3)';
  g.fillRect(3, 0, w - 6, h);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 5;
  for (let y = -8; y < h + 16; y += 16) {
    g.beginPath();
    g.moveTo(5, y + 12);
    g.lineTo(w / 2, y);
    g.lineTo(w - 5, y + 12);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

/**
 * Bootprints pressed into the regolith. On the Moon nothing ever erases them —
 * the Apollo prints are still there — so they simply accumulate (oldest recycled).
 */
export class Footprints {
  readonly mesh: THREE.InstancedMesh;
  private cursor = 0;
  private count = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private qy = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);
  private pos = new THREE.Vector3();
  private scale = new THREE.Vector3(1, 1, 1);

  private capacity: number;

  /** `kind` picks the mark: a boot sole, or one length of tyre track. */
  constructor(strength: number, kind: 'boot' | 'tyre' = 'boot', capacity = CAPACITY) {
    this.capacity = capacity;
    const geo = kind === 'boot' ? new THREE.PlaneGeometry(0.19, 0.36) : new THREE.PlaneGeometry(0.3, 0.46);
    geo.rotateX(-Math.PI / 2); // lie flat, toe toward +z after the yaw below
    geo.rotateY(Math.PI);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      alphaMap: kind === 'boot' ? treadTexture() : tyreTexture(),
      transparent: true,
      opacity: strength,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      fog: true,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.userData.skipAO = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  clear(): void {
    this.cursor = 0;
    this.count = 0;
    this.mesh.count = 0;
  }

  /** Press one print at (x, z) heading `yaw`, lying on a surface with the given normal. */
  add(x: number, y: number, z: number, yaw: number, normal: THREE.Vector3): void {
    this.q.setFromUnitVectors(this.up, normal);
    this.qy.setFromAxisAngle(this.up, yaw);
    this.q.multiply(this.qy);
    this.pos.set(x, y + 0.012, z);
    this.m.compose(this.pos, this.q, this.scale);
    this.mesh.setMatrixAt(this.cursor, this.m);
    this.cursor = (this.cursor + 1) % this.capacity;
    this.count = Math.min(this.capacity, this.count + 1);
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
