import * as THREE from 'three';
import { Rng } from '../core/rng';
import type { WorldId } from '../sim/types';

const DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * mat4(mat3(modelViewMatrix)) * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const DOME_FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uGlow;
uniform vec3 uHalo;
uniform float uGlowPow;
uniform float uSunCos;
uniform float uHorizonPow;
uniform float uMilky;
uniform vec3 uGalaxyAxis;

float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float t = pow(1.0 - max(h, 0.0), uHorizonPow);
  vec3 col = mix(uZenith, uHorizon, t);
  col = mix(col, uGround, smoothstep(0.0, -0.1, h));
  float cs = dot(d, uSunDir);
  // forward scattering by dust: a broad glow plus a tight aureole around the disc
  col += uGlow * pow(max(cs, 0.0), uGlowPow);
  col += uHalo * pow(max(cs, 0.0), 900.0);
  // faint band of the galaxy
  if (uMilky > 0.001) {
    float band = exp(-pow(dot(d, uGalaxyAxis) * 4.2, 2.0));
    float n = vnoise(d * 9.0) * 0.5 + vnoise(d * 23.0) * 0.3 + vnoise(d * 61.0) * 0.2;
    float dustLane = smoothstep(0.38, 0.62, vnoise(d * 13.0 + 4.0)) * exp(-pow(dot(d, uGalaxyAxis) * 11.0, 2.0));
    col += vec3(0.5, 0.58, 0.82) * band * (0.08 + 0.5 * n * n * n) * (1.0 - 0.8 * dustLane) * uMilky * 0.6;
  }
  float edge = (1.0 - uSunCos) * 0.25 + 1e-6;
  col += uSunColor * smoothstep(uSunCos - edge, uSunCos + edge, cs);
  gl_FragColor = vec4(col, 1.0);
}
`;

const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute vec3 aColor;
uniform float uPixelRatio;
uniform float uTime;
uniform float uTwinkle;
uniform float uVis;
varying vec3 vColor;
void main() {
  float tw = 1.0 - uTwinkle * 0.45 * (0.5 + 0.5 * sin(uTime * (2.0 + aPhase * 5.0) + aPhase * 40.0));
  vColor = aColor * tw * uVis;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPixelRatio;
}
`;

const STAR_FRAG = /* glsl */ `
precision highp float;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  float a = exp(-d * 5.0);
  gl_FragColor = vec4(vColor * a, 1.0);
}
`;

const GLARE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor;
uniform float uStrength;
void main() {
  vec2 c = vUv - 0.5;
  float r = length(c) * 2.0;
  float core = exp(-r * r * 60.0);
  float halo = exp(-r * 5.5) * 0.22;
  // diffraction spikes
  float ang = atan(c.y, c.x);
  float spikes = pow(abs(cos(ang * 2.0)), 60.0) * exp(-r * 4.0) * 0.5 + pow(abs(cos(ang * 2.0 + 0.785)), 90.0) * exp(-r * 7.0) * 0.25;
  float a = (core * 3.0 + halo + spikes) * smoothstep(1.0, 0.6, r);
  gl_FragColor = vec4(uColor * a * uStrength, 1.0);
}
`;

const EARTH_FRAG = /* glsl */ `
precision highp float;
varying vec3 vN;
varying vec3 vLocal;
varying vec3 vView;
uniform vec3 uSunDir;
uniform float uSpin;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5; float s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
void main() {
  vec3 n = normalize(vN);
  float c = cos(uSpin); float s = sin(uSpin);
  vec3 p = normalize(vLocal);
  p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  float land = fbm(p * 2.2 + 3.0);
  float isLand = smoothstep(0.5, 0.54, land);
  float lat = abs(p.y);
  vec3 ocean = mix(vec3(0.015, 0.07, 0.22), vec3(0.03, 0.2, 0.42), smoothstep(0.35, 0.5, land));
  vec3 ground = mix(vec3(0.09, 0.2, 0.06), vec3(0.42, 0.32, 0.17), smoothstep(0.55, 0.72, land + (0.25 - lat) * 0.25));
  vec3 col = mix(ocean, ground, isLand);
  col = mix(col, vec3(0.9, 0.93, 0.97), smoothstep(0.78, 0.9, lat + land * 0.12));
  float clouds = smoothstep(0.5, 0.75, fbm(p * 4.0 + vec3(uSpin * 0.3, 0.0, 7.0)));
  col = mix(col, vec3(0.95), clouds * 0.85);
  float ndl = dot(n, uSunDir);
  float day = smoothstep(-0.08, 0.25, ndl);
  vec3 lit = col * day * 1.6;
  // ocean glint
  vec3 hv = normalize(uSunDir + normalize(vView));
  lit += vec3(1.0, 0.9, 0.7) * pow(max(dot(n, hv), 0.0), 60.0) * (1.0 - isLand) * (1.0 - clouds) * day * 0.8;
  // city lights on the night side
  float cities = smoothstep(0.72, 0.8, vnoise(p * 40.0)) * isLand * (1.0 - day) * (1.0 - smoothstep(0.6, 0.8, lat));
  lit += vec3(1.0, 0.75, 0.4) * cities * 0.25;
  // atmosphere
  float rim = pow(1.0 - max(dot(n, normalize(vView)), 0.0), 2.5);
  lit += vec3(0.25, 0.5, 1.0) * rim * (0.15 + 0.85 * smoothstep(-0.3, 0.4, ndl)) * 1.3;
  gl_FragColor = vec4(lit, 1.0);
}
`;

const BODY_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vLocal;
varying vec3 vView;
varying vec2 vUv;
void main() {
  vUv = uv;
  vLocal = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vView = cameraPosition - wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export interface SkyPalette {
  zenith: THREE.Color;
  horizon: THREE.Color;
  ground: THREE.Color;
  sunDisc: THREE.Color;
  glow: THREE.Color;
  halo: THREE.Color;
  glowPow: number;
  horizonPow: number;
  starVis: number;
  milky: number;
  glare: number;
}

/**
 * Everything above the horizon: gradient dome with a physically-placed Sun,
 * point stars, a glare billboard that terrain can occlude, and — on the Moon —
 * a procedurally shaded Earth whose phase follows the real Sun direction.
 */
export class Sky {
  readonly group = new THREE.Group();
  readonly palette: SkyPalette = {
    zenith: new THREE.Color(),
    horizon: new THREE.Color(),
    ground: new THREE.Color(),
    sunDisc: new THREE.Color(),
    glow: new THREE.Color(),
    halo: new THREE.Color(),
    glowPow: 8,
    horizonPow: 3,
    starVis: 1,
    milky: 1,
    glare: 1,
  };
  private dome: THREE.Mesh;
  private domeMat: THREE.ShaderMaterial;
  private stars: THREE.Points;
  private starMat: THREE.ShaderMaterial;
  private glare: THREE.Mesh;
  private glareMat: THREE.ShaderMaterial;
  private earth: THREE.Mesh | null = null;
  private earthMat: THREE.ShaderMaterial | null = null;
  private moons: THREE.Mesh[] = [];
  private starGroup = new THREE.Group();
  private sunDir = new THREE.Vector3(0, 1, 0);

  constructor(
    readonly world: WorldId,
    seed: number,
    pixelRatio: number,
  ) {
    this.group.name = 'sky';
    this.domeMat = new THREE.ShaderMaterial({
      vertexShader: DOME_VERT,
      fragmentShader: DOME_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        uZenith: { value: this.palette.zenith },
        uHorizon: { value: this.palette.horizon },
        uGround: { value: this.palette.ground },
        uSunDir: { value: this.sunDir },
        uSunColor: { value: this.palette.sunDisc },
        uGlow: { value: this.palette.glow },
        uHalo: { value: this.palette.halo },
        uGlowPow: { value: 8 },
        uSunCos: { value: Math.cos(world === 'moon' ? 0.0062 : 0.0048) },
        uHorizonPow: { value: 3 },
        uMilky: { value: 1 },
        uGalaxyAxis: { value: new THREE.Vector3(0.35, 0.5, 0.79).normalize() },
      },
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.domeMat);
    this.dome.renderOrder = -100;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    // ---- stars
    const rng = new Rng(seed ^ 0x57a25);
    const count = 5200;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
    const axis = new THREE.Vector3(0.35, 0.5, 0.79).normalize();
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      // uniform on the sphere, with extra density along the galactic plane
      let guard = 0;
      do {
        const u = rng.range(-1, 1);
        const a = rng.range(0, Math.PI * 2);
        const s = Math.sqrt(1 - u * u);
        v.set(s * Math.cos(a), u, s * Math.sin(a));
      } while (rng.next() > 0.35 + 0.65 * Math.exp(-((v.dot(axis) * 3) ** 2)) && guard++ < 8);
      pos[i * 3] = v.x;
      pos[i * 3 + 1] = v.y;
      pos[i * 3 + 2] = v.z;
      const mag = Math.pow(rng.next(), 5.5); // few bright, many faint
      const temp = rng.next();
      // blue-white → white → yellow → orange
      const r = temp < 0.3 ? 0.7 + temp : 1;
      const g = temp < 0.3 ? 0.8 + temp * 0.5 : 1 - (temp - 0.3) * 0.35;
      const b = temp < 0.3 ? 1 : 1 - (temp - 0.3) * 0.9;
      const lum = 0.25 + 2.6 * mag;
      col[i * 3] = r * lum;
      col[i * 3 + 1] = g * lum;
      col[i * 3 + 2] = b * lum;
      size[i] = 1.4 + 3.4 * mag;
      phase[i] = rng.next();
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    sg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    sg.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    this.starMat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      transparent: true,
      fog: false,
      uniforms: {
        uPixelRatio: { value: pixelRatio },
        uTime: { value: 0 },
        uTwinkle: { value: world === 'mars' ? 1 : 0 },
        uVis: { value: 1 },
      },
    });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -90;
    this.starGroup.add(this.stars);
    this.starGroup.scale.setScalar(11000);
    this.group.add(this.starGroup);

    // ---- sun glare
    this.glareMat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: GLARE_FRAG,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      transparent: true,
      fog: false,
      uniforms: { uColor: { value: new THREE.Color(1, 0.96, 0.9) }, uStrength: { value: 1 } },
    });
    this.glare = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.glareMat);
    this.glare.renderOrder = -80;
    this.glare.frustumCulled = false;
    this.group.add(this.glare);

    if (world === 'moon') {
      this.earthMat = new THREE.ShaderMaterial({
        vertexShader: BODY_VERT,
        fragmentShader: EARTH_FRAG,
        depthWrite: false,
        fog: false,
        uniforms: { uSunDir: { value: this.sunDir }, uSpin: { value: 0 } },
      });
      this.earth = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), this.earthMat);
      this.earth.renderOrder = -85;
      this.earth.frustumCulled = false;
      this.group.add(this.earth);
    } else {
      // Phobos and Deimos: tiny, irregular, lit by the same Sun
      for (let i = 0; i < 2; i++) {
        const geo = new THREE.IcosahedronGeometry(1, 2);
        const p = geo.attributes.position;
        for (let k = 0; k < p.count; k++) {
          v.fromBufferAttribute(p, k);
          const bump = 1 + 0.22 * Math.sin(v.x * 3.1 + i) * Math.cos(v.y * 2.3) + 0.12 * Math.sin(v.z * 5.2);
          v.multiplyScalar(bump);
          p.setXYZ(k, v.x * (i === 0 ? 1.25 : 1), v.y * 0.85, v.z);
        }
        geo.computeVertexNormals();
        const mat = new THREE.ShaderMaterial({
          vertexShader: BODY_VERT,
          fragmentShader: /* glsl */ `precision highp float; varying vec3 vN; uniform vec3 uSunDir; void main(){ float l = max(dot(normalize(vN), uSunDir), 0.0); gl_FragColor = vec4(vec3(0.55,0.5,0.45) * (l * 1.6 + 0.02), 1.0); }`,
          depthWrite: false,
          fog: false,
          uniforms: { uSunDir: { value: this.sunDir } },
        });
        const m = new THREE.Mesh(geo, mat);
        m.renderOrder = -85;
        m.frustumCulled = false;
        this.moons.push(m);
        this.group.add(m);
      }
    }
  }

  setPixelRatio(pr: number): void {
    this.starMat.uniforms.uPixelRatio.value = pr;
  }

  /**
   * @param timeH mission clock in hours (drives sky rotation and moon orbits)
   */
  update(camera: THREE.Camera, sunDir: THREE.Vector3, timeH: number, realTime: number): void {
    const p = this.palette;
    this.sunDir.copy(sunDir);
    this.group.position.copy(camera.position);
    this.dome.scale.setScalar(1);
    const u = this.domeMat.uniforms;
    u.uGlowPow.value = p.glowPow;
    u.uHorizonPow.value = p.horizonPow;
    u.uMilky.value = p.milky;
    this.starMat.uniforms.uVis.value = p.starVis;
    this.starMat.uniforms.uTime.value = realTime;
    this.stars.visible = p.starVis > 0.01;

    // the sky turns: once per sol on Mars, once per sidereal month on the Moon
    const period = this.world === 'mars' ? 24.6229 : 655.7;
    this.starGroup.rotation.set(0.5, (-timeH / period) * Math.PI * 2, 0.2);

    const D = 9000;
    this.glare.position.copy(sunDir).multiplyScalar(D);
    this.glare.scale.setScalar(D * (this.world === 'moon' ? 0.42 : 0.34));
    this.glare.quaternion.copy(camera.quaternion);
    this.glareMat.uniforms.uStrength.value = p.glare;
    this.glare.visible = p.glare > 0.01;

    if (this.earth && this.earthMat) {
      // Earth hovers low in the northern sky, bobbing a few degrees with libration
      const el = 0.115 + 0.03 * Math.sin((timeH / 655.7) * Math.PI * 2);
      const az = 0.35 + 0.07 * Math.cos((timeH / 655.7) * Math.PI * 2);
      this.earth.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(D);
      this.earth.scale.setScalar(D * 0.0305);
      this.earth.rotation.set(0.4, 0, 2.6);
      this.earthMat.uniforms.uSpin.value = (timeH / 24) * Math.PI * 2;
    }
    if (this.moons.length) {
      // Phobos rises in the west and crosses the sky in ~4 h; Deimos drifts for days
      const ph = (timeH / 11.1) * Math.PI * 2;
      this.moons[0].position.set(-Math.cos(ph) * 0.9, Math.sin(ph) * 0.9, 0.32).normalize().multiplyScalar(D);
      this.moons[0].scale.setScalar(D * 0.0034);
      this.moons[0].rotation.set(0.3, ph, 0.2);
      const de = (timeH / 131) * Math.PI * 2;
      this.moons[1].position.set(Math.cos(de) * 0.9, Math.sin(de) * 0.9, -0.3).normalize().multiplyScalar(D);
      this.moons[1].scale.setScalar(D * 0.0013);
    }
  }
}
