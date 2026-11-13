import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uGlow;
uniform float uHorizonPow;
void main() {
  vec3 d = normalize(vDir);
  float t = pow(1.0 - max(d.y, 0.0), uHorizonPow);
  vec3 col = mix(uZenith, uHorizon, t);
  // below the horizon: the sunlit (or dark) ground, slightly brighter toward the horizon
  vec3 ground = uGround * (0.75 + 0.5 * smoothstep(-0.6, 0.0, d.y));
  col = mix(col, ground, smoothstep(0.015, -0.03, d.y));
  // a broad glow around the Sun: the disc itself is the directional light's job
  float cs = max(dot(d, uSunDir), 0.0);
  col += uGlow * (pow(cs, 24.0) + 0.25 * pow(cs, 4.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

export interface EnvInputs {
  zenith: THREE.Color;
  horizon: THREE.Color;
  ground: THREE.Color;
  glow: THREE.Color;
  sunDir: THREE.Vector3;
  horizonPow: number;
}

/**
 * Image-based lighting. Renders the current sky and ground into a small cube map,
 * pre-filters it (PMREM) and hands it to the materials, so that metal, gold foil,
 * glass and the helmet visor reflect the world they are standing in — black sky and
 * bright regolith on the Moon, butterscotch haze on Mars, a dim blue dusk at sunset.
 * The map is only rebuilt when the light has changed enough to notice.
 */
export class EnvProbe {
  private pmrem: THREE.PMREMGenerator;
  private scene = new THREE.Scene();
  private mat: THREE.ShaderMaterial;
  private target: THREE.WebGLRenderTarget | null = null;
  private timer = 0;
  private signature = '';
  texture: THREE.Texture | null = null;
  /** Bumped every time a new map is generated. */
  version = 0;

  constructor(private renderer: THREE.WebGLRenderer) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uZenith: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uGround: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uGlow: { value: new THREE.Color() },
        uHorizonPow: { value: 3 },
      },
    });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.mat));
  }

  /** Call every frame; regenerates at most a few times a second, and only on change. */
  update(dt: number, e: EnvInputs, force = false): boolean {
    this.timer -= dt;
    if (!force && this.timer > 0) return false;
    this.timer = 0.6;
    const q = (v: number): number => Math.round(v * 40);
    const sig = [
      q(e.sunDir.x), q(e.sunDir.y), q(e.sunDir.z),
      q(e.zenith.r + e.zenith.g + e.zenith.b), q(e.horizon.r + e.horizon.g + e.horizon.b),
      q(e.ground.r + e.ground.g + e.ground.b), q(e.glow.r + e.glow.g + e.glow.b),
    ].join(',');
    if (!force && sig === this.signature) return false;
    this.signature = sig;
    const u = this.mat.uniforms;
    u.uZenith.value.copy(e.zenith);
    u.uHorizon.value.copy(e.horizon);
    u.uGround.value.copy(e.ground);
    u.uGlow.value.copy(e.glow);
    u.uSunDir.value.copy(e.sunDir);
    u.uHorizonPow.value = e.horizonPow;
    const old = this.target;
    this.target = this.pmrem.fromScene(this.scene, 0, 0.1, 100);
    this.texture = this.target.texture;
    this.version++;
    old?.dispose();
    return true;
  }

  dispose(): void {
    this.target?.dispose();
    this.pmrem.dispose();
  }
}
