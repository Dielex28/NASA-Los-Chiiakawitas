import * as THREE from 'three';

const VERT = /* glsl */ `
attribute vec3 aVel;
attribute vec4 aColor;
attribute vec3 aMeta; // start time, life, size
uniform float uTime;
uniform float uGravity;
uniform float uDrag;
uniform float uScale;
varying vec4 vColor;
void main() {
  float t = uTime - aMeta.x;
  float life = aMeta.y;
  if (t < 0.0 || t > life || life <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vColor = vec4(0.0);
    return;
  }
  vec3 p;
  if (uDrag < 0.001) {
    // vacuum: every grain flies a perfect parabola and nothing billows
    p = position + aVel * t + vec3(0.0, -0.5 * uGravity * t * t, 0.0);
  } else {
    float e = (1.0 - exp(-uDrag * t)) / uDrag;
    p = position + aVel * e;
    p.y += (uGravity / uDrag) * (e - t) * 0.35;
  }
  float k = t / life;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float grow = 1.0 + (uDrag > 0.001 ? 2.2 : 0.6) * k;
  gl_PointSize = aMeta.z * grow * uScale / max(0.1, -mv.z);
  vColor = aColor;
  vColor.a *= smoothstep(0.0, 0.08, k) * (1.0 - smoothstep(0.45, 1.0, k));
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec4 vColor;
uniform vec3 uLight;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  if (d > 1.0) discard;
  float a = (1.0 - d);
  gl_FragColor = vec4(vColor.rgb * uLight, vColor.a * a * a);
}
`;

/**
 * GPU particles with closed-form motion: the CPU only writes a particle when it
 * is born. With `drag = 0` (the Moon) dust follows ballistic arcs; with drag
 * (Mars) it slows, hangs and drifts.
 */
export class Particles {
  readonly points: THREE.Points;
  private geo = new THREE.BufferGeometry();
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private meta: Float32Array;
  private cursor = 0;
  private dirtyFrom = -1;
  private dirtyTo = -1;
  readonly material: THREE.ShaderMaterial;
  time = 0;

  constructor(
    readonly capacity: number,
    additive: boolean,
    gravity: number,
    drag: number,
  ) {
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 4);
    this.meta = new Float32Array(capacity * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aVel', new THREE.BufferAttribute(this.vel, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aMeta', new THREE.BufferAttribute(this.meta, 3).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uGravity: { value: gravity },
        uDrag: { value: drag },
        uScale: { value: 600 },
        uLight: { value: new THREE.Color(1, 1, 1) },
      },
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, r: number, g: number, b: number, a: number): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.col[i * 4] = r;
    this.col[i * 4 + 1] = g;
    this.col[i * 4 + 2] = b;
    this.col[i * 4 + 3] = a;
    this.meta[i * 3] = this.time;
    this.meta[i * 3 + 1] = life;
    this.meta[i * 3 + 2] = size;
    if (this.dirtyFrom < 0) this.dirtyFrom = this.dirtyTo = i;
    else {
      this.dirtyFrom = Math.min(this.dirtyFrom, i);
      this.dirtyTo = Math.max(this.dirtyTo, i);
    }
  }

  update(time: number, viewportHeight: number, fovDeg: number): void {
    this.time = time;
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uScale.value = viewportHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
    if (this.dirtyFrom >= 0) {
      for (const name of ['position', 'aVel', 'aColor', 'aMeta']) {
        const attr = this.geo.getAttribute(name) as THREE.BufferAttribute;
        attr.needsUpdate = true;
      }
      this.dirtyFrom = this.dirtyTo = -1;
    }
  }
}
