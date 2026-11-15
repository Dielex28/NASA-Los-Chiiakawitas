import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Turns the team's astronaut model (one rigid, textured mesh) into a skinned mesh that the
 * procedural astronaut can drive. The model has no skeleton, so one is fitted here: the
 * joints sit where the suit bends (measured from the mesh: hip, knees, shoulders, elbows,
 * waist and neck ring) and every vertex is weighted to the nearest bones by its distance to
 * each bone measured in bone radii, with a few anatomical rules (a left boot never follows
 * the right leg, the backpack stays on the back). The procedural rig keeps doing the walking,
 * loping, jumping, kneeling at work and sitting in the rover; its joint angles are copied onto
 * these bones every frame.
 */

/** Height of the suited astronaut, metres (helmet top to sole). */
export const SKIN_HEIGHT = 1.9;

export type JointName = 'body' | 'torso' | 'head' | 'armL' | 'foreL' | 'armR' | 'foreR' | 'legL' | 'shinL' | 'legR' | 'shinR';

interface JointDef {
  name: JointName;
  parent: JointName | null;
  /** Rest position in model space, metres (feet on y = 0, facing +Z). */
  at: [number, number, number];
}

/** Measured on the model scaled to SKIN_HEIGHT: crotch at 0.63 m, neck ring at 1.41 m, hands at the hips. */
const JOINTS: JointDef[] = [
  { name: 'body', parent: null, at: [0, 0.722, 0.02] },
  { name: 'torso', parent: 'body', at: [0, 0.874, 0.02] },
  { name: 'head', parent: 'torso', at: [0, 1.406, 0] },
  { name: 'armL', parent: 'torso', at: [-0.371, 1.254, 0] },
  { name: 'foreL', parent: 'armL', at: [-0.433, 1.007, 0.019] },
  { name: 'armR', parent: 'torso', at: [0.371, 1.254, 0] },
  { name: 'foreR', parent: 'armR', at: [0.433, 1.007, 0.019] },
  { name: 'legL', parent: 'body', at: [-0.162, 0.722, 0] },
  { name: 'shinL', parent: 'legL', at: [-0.18, 0.399, 0] },
  { name: 'legR', parent: 'body', at: [0.162, 0.722, 0] },
  { name: 'shinR', parent: 'legR', at: [0.18, 0.399, 0] },
];

/** Each bone as a capsule (segment + radius) for the weighting; the segment runs from the joint to the next one. */
const CAPSULES: Array<{ joint: JointName; a: [number, number, number]; b: [number, number, number]; r: number; side: -1 | 0 | 1 }> = [
  { joint: 'body', a: [0, 0.6, 0.02], b: [0, 0.874, 0.02], r: 0.2, side: 0 },
  { joint: 'torso', a: [0, 0.874, 0], b: [0, 1.38, -0.05], r: 0.24, side: 0 },
  { joint: 'head', a: [0, 1.43, 0], b: [0, 1.85, 0], r: 0.3, side: 0 },
  { joint: 'armL', a: [-0.371, 1.254, 0], b: [-0.433, 1.007, 0.019], r: 0.1, side: -1 },
  { joint: 'foreL', a: [-0.433, 1.007, 0.019], b: [-0.422, 0.703, 0.038], r: 0.085, side: -1 },
  { joint: 'armR', a: [0.371, 1.254, 0], b: [0.433, 1.007, 0.019], r: 0.1, side: 1 },
  { joint: 'foreR', a: [0.433, 1.007, 0.019], b: [0.422, 0.703, 0.038], r: 0.085, side: 1 },
  { joint: 'legL', a: [-0.162, 0.722, 0], b: [-0.18, 0.399, 0], r: 0.12, side: -1 },
  { joint: 'shinL', a: [-0.18, 0.399, 0], b: [-0.2, 0, 0.03], r: 0.11, side: -1 },
  { joint: 'legR', a: [0.162, 0.722, 0], b: [0.18, 0.399, 0], r: 0.12, side: 1 },
  { joint: 'shinR', a: [0.18, 0.399, 0], b: [0.2, 0, 0.03], r: 0.11, side: 1 },
];

export interface SkinTemplate {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
}

export interface SkinInstance {
  mesh: THREE.SkinnedMesh;
  bones: Record<JointName, THREE.Bone>;
  /** Rest position of the root bone (the hips). */
  rest: THREE.Vector3;
}

function segDist(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, tmp: THREE.Vector3): number {
  const ab = tmp.subVectors(b, a);
  const t = Math.max(0, Math.min(1, ab.dot(p.clone().sub(a)) / Math.max(1e-9, ab.lengthSq())));
  return p.distanceTo(ab.multiplyScalar(t).add(a));
}

/** Build the shared skinned geometry once from the loaded model. Returns null if the model is not what we expect. */
export function buildSkinTemplate(gltf: GLTF): SkinTemplate | null {
  let src: THREE.Mesh | null = null;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh;
  });
  if (!src) return null;
  const mesh = src as THREE.Mesh;
  const g = mesh.geometry;
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  if (!pos) return null;
  const n = pos.count;
  const m = mesh.matrixWorld;
  const nm = new THREE.Matrix3().getNormalMatrix(m);

  // dequantize into metres, feet on the ground
  const v = new THREE.Vector3();
  let minY = Infinity;
  let maxY = -Infinity;
  const raw = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(m);
    raw[i * 3] = v.x;
    raw[i * 3 + 1] = v.y;
    raw[i * 3 + 2] = v.z;
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
  }
  const s = SKIN_HEIGHT / Math.max(1e-6, maxY - minY);
  const p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    p[i * 3] = raw[i * 3] * s;
    p[i * 3 + 1] = (raw[i * 3 + 1] - minY) * s;
    p[i * 3 + 2] = raw[i * 3 + 2] * s;
  }
  const nn = new Float32Array(n * 3);
  if (nor) {
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      nn[i * 3] = v.x;
      nn[i * 3 + 1] = v.y;
      nn[i * 3 + 2] = v.z;
    }
  }

  // weights: inverse distance in bone radii, the three nearest bones, with anatomical limits
  const index = JOINTS.map((j) => j.name);
  const caps = CAPSULES.map((c) => ({ ...c, A: new THREE.Vector3(...c.a), B: new THREE.Vector3(...c.b), bone: index.indexOf(c.joint) }));
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const q = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const cand: Array<{ bone: number; w: number }> = [];
  for (let i = 0; i < n; i++) {
    q.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    cand.length = 0;
    const backpack = q.z < -0.25 && q.y > 0.85;
    for (const c of caps) {
      if (c.side === -1 && q.x > 0.03) continue;
      if (c.side === 1 && q.x < -0.03) continue;
      const isLeg = c.joint.startsWith('leg') || c.joint.startsWith('shin');
      const isArm = c.joint.startsWith('arm') || c.joint.startsWith('fore');
      if (isLeg && q.y > 0.7) continue;
      if (isArm && (Math.abs(q.x) < 0.22 || q.y < 0.62)) continue;
      if (c.joint === 'head' && q.y < 1.36) continue;
      if (backpack && c.joint !== 'torso') continue;
      const d = segDist(q, c.A, c.B, tmp) / c.r;
      cand.push({ bone: c.bone, w: Math.pow(d + 0.05, -6) });
    }
    if (!cand.length) cand.push({ bone: q.y > 0.874 ? 1 : 0, w: 1 });
    cand.sort((a, b) => b.w - a.w);
    const k = Math.min(3, cand.length);
    let sum = 0;
    for (let j = 0; j < k; j++) sum += cand[j].w;
    for (let j = 0; j < 4; j++) {
      skinIndex[i * 4 + j] = j < k ? cand[j].bone : 0;
      skinWeight[i * 4 + j] = j < k ? cand[j].w / sum : 0;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  if (nor) geo.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
  const uv = g.getAttribute('uv');
  if (uv) geo.setAttribute('uv', uv);
  if (g.index) geo.setIndex(g.index);
  if (!nor) geo.computeVertexNormals();
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  const mat = mesh.material;
  // the suit is cloth and painted shells: keep it out of mirror-like metal whatever the file says
  for (const mm of Array.isArray(mat) ? mat : [mat]) {
    const sm = mm as THREE.MeshStandardMaterial;
    if (sm.isMeshStandardMaterial) {
      sm.metalness = Math.min(sm.metalness, 0.35);
      sm.roughness = Math.max(sm.roughness, 0.55);
    }
  }
  return { geometry: geo, material: mat };
}

/** A new skinned astronaut sharing the template's geometry and material, with its own skeleton. */
export function createSkin(t: SkinTemplate): SkinInstance {
  const mesh = new THREE.SkinnedMesh(t.geometry, t.material);
  mesh.name = 'astronaut-skin';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // the bounding sphere of the rest pose is too small once a leg swings forward
  mesh.frustumCulled = false;
  const bones = {} as Record<JointName, THREE.Bone>;
  const list: THREE.Bone[] = [];
  for (const j of JOINTS) {
    const b = new THREE.Bone();
    b.name = j.name;
    const parent = j.parent ? JOINTS.find((x) => x.name === j.parent)! : null;
    b.position.set(j.at[0] - (parent ? parent.at[0] : 0), j.at[1] - (parent ? parent.at[1] : 0), j.at[2] - (parent ? parent.at[2] : 0));
    if (j.parent) bones[j.parent].add(b);
    else mesh.add(b);
    bones[j.name] = b;
    list.push(b);
  }
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(list));
  return { mesh, bones, rest: bones.body.position.clone() };
}

/** Where things bolt on to the model, in the local space of a bone (metres). */
export const SKIN_MOUNTS = {
  /** helmet lamp, on the head bone */
  lamp: new THREE.Vector3(0, 0.22, 0.3),
  /** suit running light, on the torso bone */
  glow: new THREE.Vector3(0, 0.55, 0.7),
  /** jet-pack nozzles under the backpack, on the torso bone (x is mirrored) */
  nozzle: new THREE.Vector3(0.17, 0.03, -0.38),
  /** colour band around the upper arm, on the arm bones (x mirrored) */
  armBand: new THREE.Vector3(-0.03, -0.12, 0.01),
  /** colour band around the thigh, on the leg bones */
  legBand: new THREE.Vector3(-0.008, -0.16, 0),
};
