import * as THREE from 'three';
import type { WorldUniforms } from './shading';

/** Side of the square the bounce map covers, m (the walkable area and a margin). */
export const BOUNCE_EXTENT = 2400;

const VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const COMMON = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uHeightMap;
uniform vec4 uHf;
uniform float uExtent;
float terrain(vec2 xz) { return texture2D(uHeightMap, xz * uHf.x + 0.5).r + uHf.y; }
`;

/**
 * Pass 1 — where does sunlight land? For each patch of ground: is the Sun above its local
 * horizon (a march over the height map toward the Sun), and how squarely does it face it.
 */
const SUNLIT = /* glsl */ `
${COMMON}
uniform vec3 uSunDir;
uniform float uTexel;
void main() {
  vec2 xz = (vUv - 0.5) * uExtent;
  float h = terrain(xz);
  float e = uTexel;
  vec3 n = normalize(vec3(terrain(xz - vec2(e, 0.0)) - terrain(xz + vec2(e, 0.0)), 2.0 * e, terrain(xz - vec2(0.0, e)) - terrain(xz + vec2(0.0, e))));
  float vis = step(-0.02, uSunDir.y);
  float t = 12.0;
  for (int i = 0; i < 26; i++) {
    vec3 q = vec3(xz.x, h + 1.5, xz.y) + uSunDir * t;
    vis = min(vis, clamp(60.0 * (q.y - terrain(q.xz)) / t + 0.5, 0.0, 1.0));
    t *= 1.27;
  }
  // regolith scatters back toward the light even at grazing incidence, so a lit plain is never dark
  float facing = 0.6 + 0.4 * clamp(dot(n, uSunDir) * 3.0, 0.0, 1.0);
  gl_FragColor = vec4(vis * facing, vis, 0.0, 1.0);
}
`;

/**
 * Pass 2 — what does each patch see around it? Looking out in sixteen directions it records
 * how much sky the surrounding relief leaves open, and how much sunlit ground is in view:
 * that ground is the lamp that fills the shadows.
 */
const GATHER = /* glsl */ `
${COMMON}
uniform sampler2D uSunlit;
void main() {
  vec2 xz = (vUv - 0.5) * uExtent;
  float h = terrain(xz) + 1.2;
  float sky = 0.0;
  float light = 0.0;
  float weight = 0.0;
  for (int d = 0; d < 16; d++) {
    float a = (float(d) + 0.5) * 0.3926991;
    vec2 dir = vec2(cos(a), sin(a));
    float horizon = -0.25;
    float r = 7.0;
    for (int s = 0; s < 7; s++) {
      vec2 q = xz + dir * r;
      float slope = (terrain(q) - h) / r;
      // ground counts if it is not hidden behind nearer ground; nearer patches fill more of the view
      float seen = smoothstep(horizon - 0.06, horizon + 0.02, slope);
      float w = 1.0 / (1.0 + r / 45.0);
      light += texture2D(uSunlit, q / uExtent + 0.5).r * seen * w;
      weight += w;
      horizon = max(horizon, slope);
      r *= 1.95;
    }
    float el = atan(max(horizon, 0.0));
    sky += 1.0 - sin(el) * sin(el) * 1.6;
  }
  gl_FragColor = vec4(clamp(sky / 16.0, 0.0, 1.0), light / weight, 0.0, 1.0);
}
`;

/**
 * One bounce of global illumination on the terrain, solved on the GPU from the height map.
 * The result is a small top-down texture: R = sky left open by the relief (large-scale ambient
 * occlusion: crater floors and the foot of cliffs receive less skylight), G = sunlit ground in
 * view (the fill light: next to a sunlit slope a shadow is bright, deep inside a large shadow it
 * is not). Every lit material reads it. It is redrawn only when the Sun has moved.
 */
export class BounceMap {
  private sunlit: THREE.WebGLRenderTarget;
  private gather: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private sunlitMat: THREE.ShaderMaterial;
  private gatherMat: THREE.ShaderMaterial;
  private lastSun = new THREE.Vector3(0, -2, 0);
  private timer = 0;

  constructor(
    private uniforms: WorldUniforms,
    size = 256,
  ) {
    const opts = { type: THREE.HalfFloatType, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, generateMipmaps: false };
    this.sunlit = new THREE.WebGLRenderTarget(size, size, opts);
    this.gather = new THREE.WebGLRenderTarget(size, size, opts);
    const shared = { uHeightMap: uniforms.uHeightMap, uHf: uniforms.uHf, uExtent: { value: BOUNCE_EXTENT } };
    this.sunlitMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: SUNLIT,
      uniforms: { ...shared, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uTexel: { value: BOUNCE_EXTENT / size } },
      depthTest: false,
      depthWrite: false,
    });
    this.gatherMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: GATHER,
      uniforms: { ...shared, uSunlit: { value: this.sunlit.texture } },
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.sunlitMat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    uniforms.uBounceMap.value = this.gather.texture;
    uniforms.uBounce.value.w = 1 / BOUNCE_EXTENT;
  }

  /** Redraw when the Sun has moved by about a third of a degree (at most a few times a second). */
  update(renderer: THREE.WebGLRenderer, sunDir: THREE.Vector3, dt: number): void {
    this.timer -= dt;
    if (this.timer > 0 || this.lastSun.distanceToSquared(sunDir) < 3e-5) return;
    this.timer = 0.25;
    this.lastSun.copy(sunDir);
    (this.sunlitMat.uniforms.uSunDir.value as THREE.Vector3).copy(sunDir);
    const target = renderer.getRenderTarget();
    const xr = renderer.xr.enabled;
    renderer.xr.enabled = false;
    this.quad.material = this.sunlitMat;
    renderer.setRenderTarget(this.sunlit);
    renderer.render(this.scene, this.camera);
    this.quad.material = this.gatherMat;
    renderer.setRenderTarget(this.gather);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(target);
    renderer.xr.enabled = xr;
  }

  dispose(): void {
    this.sunlit.dispose();
    this.gather.dispose();
    this.sunlitMat.dispose();
    this.gatherMat.dispose();
  }
}
