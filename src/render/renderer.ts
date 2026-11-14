import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface QualitySettings {
  level: QualityLevel;
  pixelRatio: number;
  shadowSize: number;
  hfSteps: number;
  bloom: boolean;
  msaa: number;
  rocks: number;
  particles: number;
  /** Screen-space ambient occlusion: soft contact shadows where surfaces meet. */
  ao: boolean;
  /** Samples for the Sun's soft shadow (0 = fixed-width filter). */
  sunTaps: number;
  /** Side of the generated detail textures, pixels. */
  textureSize: number;
  /** Anisotropic filtering of ground and detail textures (sharper at grazing angles, costlier). */
  anisotropy: number;
  /** Samples for the light shafts through dusty air (0 = off). */
  rays: number;
  /** The helmet lamp casts shadows. */
  lampShadows: boolean;
  /** Side of the cube map photographed from the real scene for reflections and bounce light (0 = painted sky only). */
  probeSize: number;
  /** Ray-marched light and dust in the air (needs the depth buffer of the ambient-occlusion pass). */
  volumetric: number;
  /** One bounce of sunlight off the terrain, solved on the height map. */
  bounce: boolean;
}

export const QUALITY: Record<QualityLevel, Omit<QualitySettings, 'level'>> = {
  low: { pixelRatio: 0.75, shadowSize: 1024, hfSteps: 18, bloom: false, msaa: 0, rocks: 0.35, particles: 0.4, ao: false, sunTaps: 0, textureSize: 256, anisotropy: 1, rays: 0, lampShadows: false, probeSize: 0, volumetric: 0, bounce: false },
  medium: { pixelRatio: 1, shadowSize: 2048, hfSteps: 28, bloom: true, msaa: 2, rocks: 0.7, particles: 0.7, ao: false, sunTaps: 10, textureSize: 512, anisotropy: 2, rays: 20, lampShadows: false, probeSize: 0, volumetric: 0, bounce: true },
  high: { pixelRatio: 1.5, shadowSize: 4096, hfSteps: 40, bloom: true, msaa: 4, rocks: 1, particles: 1, ao: true, sunTaps: 16, textureSize: 1024, anisotropy: 8, rays: 32, lampShadows: true, probeSize: 128, volumetric: 16, bounce: true },
  ultra: { pixelRatio: 2, shadowSize: 4096, hfSteps: 48, bloom: true, msaa: 4, rocks: 1.5, particles: 1.4, ao: true, sunTaps: 24, textureSize: 1024, anisotropy: 16, rays: 48, lampShadows: true, probeSize: 256, volumetric: 28, bounce: true },
};

/** Final grade applied after tone mapping: vignette, grain, radiation speckle, dust tint. */
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uVignette: { value: 0.3 },
    uGrain: { value: 0.035 },
    /** Solar-particle-event intensity 0..1: energetic protons speckle the camera sensor. */
    uRad: { value: 0 },
    uTint: { value: new THREE.Vector4(0, 0, 0, 0) },
    uVisor: { value: 0 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uRad, uVisor, uAspect;
    uniform vec4 uTint;
    float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c * vec2(uAspect, 1.0), c * vec2(uAspect, 1.0));
      // very slight lens fringing toward the corners
      vec2 off = c * r2 * 0.0028;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col *= 1.0 - uVignette * smoothstep(0.12, 0.85, r2);
      // helmet visor: darker rim
      if (uVisor > 0.01) {
        float rim = smoothstep(0.42, 0.8, r2);
        col *= 1.0 - 0.28 * rim * uVisor;
      }
      float n = hash(gl_FragCoord.xy + fract(uTime) * 311.7) - 0.5;
      col += n * uGrain;
      if (uRad > 0.001) {
        float cell = hash(floor(gl_FragCoord.xy / 2.0) + floor(uTime * 30.0) * 17.13);
        float streak = hash(vec2(floor(gl_FragCoord.x / 2.0), floor(uTime * 30.0)) + floor(gl_FragCoord.y / 14.0));
        col += vec3(0.9, 0.95, 1.0) * step(1.0 - 0.012 * uRad, cell);
        col += vec3(0.7, 0.8, 1.0) * step(1.0 - 0.0015 * uRad, streak) * 0.7;
      }
      col = mix(col, col * uTint.rgb, uTint.a);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

/**
 * Light shafts ("crepuscular rays"): in dusty air the bright sky around the Sun lights up the
 * dust along every line of sight, except where something stands in the way. Marching from each
 * pixel toward the Sun on screen and summing the bright sky found on the way gives exactly that.
 */
const RaysShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSun: { value: new THREE.Vector2(0.5, 0.5) },
    uTint: { value: new THREE.Color(1, 1, 1) },
    /** x: strength · y: luminance above which a pixel counts as open sky · z: radius of the aureole (screen heights) · w: aspect */
    uRays: { value: new THREE.Vector4(0, 0.8, 0.5, 1) },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform vec2 uSun;
    uniform vec3 uTint;
    uniform vec4 uRays;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec2 toSun = uSun - vUv;
      vec2 stepv = toSun * (0.92 / float(RAY_STEPS));
      float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      vec2 uv = vUv + stepv * jitter;
      float acc = 0.0;
      float reach = 1.0;
      for (int i = 0; i < RAY_STEPS; i++) {
        vec3 s = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
        float sky = smoothstep(uRays.y, uRays.y * 1.7, dot(s, vec3(0.2126, 0.7152, 0.0722)));
        vec2 d = (uv - uSun) * vec2(uRays.w, 1.0);
        acc += sky * exp(-dot(d, d) / (uRays.z * uRays.z)) * reach;
        reach *= 0.975;
        uv += stepv;
      }
      gl_FragColor = vec4(base.rgb + uTint * (acc / float(RAY_STEPS)) * uRays.x, base.a);
    }
  `,
};

/**
 * Volumetric light. Dust hanging in the air is lit by the Sun wherever the Sun can reach it,
 * so the air itself shows the shadow of everything standing in the light: the lander, a crater
 * rim, the commander. For every pixel the shader walks from the eye to the surface it sees and,
 * at each step, asks the Sun's shadow map and the terrain height map whether that point of air
 * is lit; lit dust adds light according to how strongly it scatters toward the eye (forward, for
 * dust). Only worlds with air get this — on the Moon there is nothing to light.
 */
const VolumeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uShadowMap: { value: null as THREE.Texture | null },
    uHeightMap: { value: null as THREE.Texture | null },
    uNoise: { value: null as THREE.Texture | null },
    uShadowMatrix: { value: new THREE.Matrix4() },
    uProjInv: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uCamPos: { value: new THREE.Vector3() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uAmbient: { value: new THREE.Color(0, 0, 0) },
    uHf: { value: new THREE.Vector4() },
    /** x: scattering per metre · y: storm 0..1 · z: time · w: farthest distance marched, m */
    uAir: { value: new THREE.Vector4(0, 0, 0, 420) },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    precision highp float;
    #include <packing>
    varying vec2 vUv;
    uniform sampler2D tDiffuse, tDepth, uShadowMap, uHeightMap, uNoise;
    uniform mat4 uShadowMatrix, uProjInv, uCamWorld;
    uniform vec3 uCamPos, uSunDir, uSunColor, uAmbient;
    uniform vec4 uHf, uAir;
    float terrain(vec2 xz) { return texture2D(uHeightMap, xz * uHf.x + 0.5).r + uHf.y; }
    // is this point of air in sunlight?
    float lit(vec3 p) {
      vec4 sc = uShadowMatrix * vec4(p, 1.0);
      sc.xyz /= sc.w;
      float v = 1.0;
      if (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0) {
        v = step(sc.z - 0.0015, unpackRGBAToDepth(texture2D(uShadowMap, sc.xy)));
      }
      // hills and crater rims far outside the shadow map
      for (int j = 0; j < 3; j++) {
        float t = 45.0 * pow(3.6, float(j));
        vec3 q = p + uSunDir * t;
        v *= smoothstep(-2.0, 3.0 + 0.02 * t, q.y - terrain(q.xz));
      }
      return v;
    }
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      float depth = texture2D(tDepth, vUv).x;
      vec4 view = uProjInv * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
      view /= view.w;
      vec3 world = (uCamWorld * view).xyz;
      vec3 ray = world - uCamPos;
      bool sky = depth > 0.99995;
      float dist = sky ? uAir.w : min(length(ray), uAir.w);
      vec3 dir = normalize(ray);
      // dust scatters forward: brightest looking toward the Sun (Henyey–Greenstein, g = 0.62)
      float mu = dot(dir, uSunDir);
      float phase = 0.2365 / pow(1.3844 - 1.24 * mu, 1.5);
      phase = min(phase / 0.1452, 4.5);
      float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      vec2 wind = vec2(uAir.z * 2.2, uAir.z * 0.8);
      float ground = terrain(uCamPos.xz);
      vec3 sum = vec3(0.0);
      float prev = 0.0;
      for (int i = 0; i < VOL_STEPS; i++) {
        // steps grow with distance: detail where shadows are sharp, reach where they are not
        float f = (float(i) + jitter) / float(VOL_STEPS);
        float t = dist * f * f;
        float dt = t - prev;
        prev = t;
        vec3 p = uCamPos + dir * t;
        // storms raise a layer of dust that hugs the ground and drifts with the wind
        float n = texture2D(uNoise, (p.xz + wind) * 0.006).r * texture2D(uNoise, (p.xz - wind * 0.6) * 0.021 + p.y * 0.004).g;
        float layer = exp(-max(p.y - ground, 0.0) / 55.0);
        float dens = uAir.x * (1.0 + uAir.y * (0.4 + 9.0 * n) * layer * 3.0);
        sum += dens * dt * (uSunColor * phase * lit(p) + uAmbient);
      }
      // the sky dome already contains the light scattered by the whole atmosphere above the scene
      gl_FragColor = vec4(base.rgb + sum * (sky ? 0.4 : 1.0), base.a);
    }
  `,
};

/** WebGL renderer with an HDR pipeline: MSAA → ambient occlusion → volumetric light → light shafts → bloom → ACES tone map → grade. */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly ao: GTAOPass | null = null;
  readonly final: ShaderPass;
  readonly rays: ShaderPass | null = null;
  readonly volume: ShaderPass | null = null;
  private renderPass: RenderPass;
  private sunNdc = new THREE.Vector3();
  quality: QualitySettings;
  private width = 1;
  private height = 1;

  constructor(
    readonly canvas: HTMLCanvasElement,
    level: QualityLevel,
  ) {
    this.quality = { level, ...QUALITY[level] };
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = true;

    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.quality.msaa });
    this.composer = new EffectComposer(this.renderer, target);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.composer.addPass(this.renderPass);
    if (this.quality.ao) {
      const ao = new GTAOPass(new THREE.Scene(), new THREE.PerspectiveCamera(), 1, 1);
      ao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1.15, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1.5, rings: 2, samples: 12 });
      ao.blendIntensity = 0.9;
      // keep the sky, glows and holograms out of the occlusion pass: they are light, not surfaces
      const base = ao.overrideVisibility.bind(ao);
      ao.overrideVisibility = () => {
        base();
        ao.scene.traverse((o) => {
          if (o.userData.skipAO) o.visible = false;
        });
      };
      this.ao = ao;
      this.composer.addPass(ao);
    }
    if (this.quality.volumetric > 0 && this.ao) {
      this.volume = new ShaderPass({ ...VolumeShader, defines: { VOL_STEPS: this.quality.volumetric } });
      this.volume.enabled = false;
      this.composer.addPass(this.volume);
    }
    if (this.quality.rays > 0) {
      this.rays = new ShaderPass({ ...RaysShader, defines: { RAY_STEPS: this.quality.rays } });
      this.rays.enabled = false;
      this.composer.addPass(this.rays);
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.6, 1.75);
    this.bloom.enabled = this.quality.bloom;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
  }

  get pixelRatio(): number {
    return Math.min(window.devicePixelRatio || 1, 2) * Math.min(1, this.quality.pixelRatio) * (this.quality.pixelRatio > 1 ? 1 : 1);
  }

  /** Dynamic-resolution factor (0.5..1) applied on top of the quality preset. */
  scale = 1;
  private slowT = 0;
  private fastT = 0;

  /** Trade resolution for frame rate on slower GPUs; call once per frame with the measured FPS. */
  adapt(fps: number, dt: number): void {
    if (fps < 31) {
      this.slowT += dt;
      this.fastT = 0;
    } else if (fps > 56) {
      this.fastT += dt;
      this.slowT = 0;
    } else {
      this.slowT = Math.max(0, this.slowT - dt);
      this.fastT = 0;
    }
    if (this.slowT > 2.5 && this.scale > 0.5) {
      this.scale = Math.max(0.5, this.scale * 0.85);
      this.slowT = 0;
      this.resize(this.width, this.height);
    } else if (this.slowT > 4 && this.ao?.enabled) {
      // already at half resolution and still slow: ambient occlusion is the costliest extra, drop it
      this.ao.enabled = false;
      this.slowT = 0;
    } else if (this.fastT > 8 && this.scale < 1) {
      this.scale = Math.min(1, this.scale * 1.1);
      this.fastT = 0;
      this.resize(this.width, this.height);
    }
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    const dpr = Math.min(Math.min(window.devicePixelRatio || 1, 2), this.quality.pixelRatio) * this.scale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(width, height);
    this.final.uniforms.uAspect.value = width / Math.max(1, height);
  }

  /**
   * Light the air. `scatter` is how much each metre of air scatters (0 switches the pass off);
   * `sunColor` and `ambient` are the light that dust receives directly and from the sky.
   * Returns true when the volumetric pass is doing the job (so the cheaper screen-space shafts can rest).
   */
  setVolume(
    camera: THREE.PerspectiveCamera,
    sun: THREE.DirectionalLight,
    sunDir: THREE.Vector3,
    sunColor: THREE.Color,
    ambient: THREE.Color,
    scatter: number,
    storm: number,
    time: number,
    heightMap: THREE.Texture | null,
    hf: THREE.Vector4,
    noise: THREE.Texture | null,
  ): boolean {
    const pass = this.volume;
    if (!pass || !this.ao) return false;
    const shadow = sun.shadow.map;
    pass.enabled = scatter > 1e-6 && this.ao.enabled && !!shadow && !!heightMap;
    if (!pass.enabled) return false;
    const u = pass.uniforms;
    u.tDepth.value = this.ao.depthTexture;
    u.uShadowMap.value = shadow!.texture;
    u.uHeightMap.value = heightMap;
    u.uNoise.value = noise;
    (u.uShadowMatrix.value as THREE.Matrix4).copy(sun.shadow.matrix);
    (u.uProjInv.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
    (u.uCamWorld.value as THREE.Matrix4).copy(camera.matrixWorld);
    (u.uCamPos.value as THREE.Vector3).setFromMatrixPosition(camera.matrixWorld);
    (u.uSunDir.value as THREE.Vector3).copy(sunDir);
    (u.uSunColor.value as THREE.Color).copy(sunColor);
    (u.uAmbient.value as THREE.Color).copy(ambient);
    (u.uHf.value as THREE.Vector4).copy(hf);
    (u.uAir.value as THREE.Vector4).set(scatter, storm, time, 420);
    return true;
  }

  /**
   * Aim the light shafts. `strength` is how much dust is lit (0 on an airless world); the pass
   * switches itself off when the Sun is behind the camera or far outside the frame.
   */
  setRays(camera: THREE.Camera, sunDir: THREE.Vector3, strength: number, tint: THREE.Color): void {
    const pass = this.rays;
    if (!pass) return;
    const v = this.sunNdc.copy(sunDir).multiplyScalar(5000).add(camera.position).project(camera);
    const inFront = v.z < 1 && v.z > -1;
    // fade out as the Sun leaves the frame: shafts from an off-screen source smear across the image
    const off = Math.max(Math.abs(v.x), Math.abs(v.y));
    const k = inFront ? strength * Math.max(0, Math.min(1, (1.5 - off) / 0.5)) : 0;
    pass.enabled = k > 0.004;
    if (!pass.enabled) return;
    const u = pass.uniforms;
    (u.uSun.value as THREE.Vector2).set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
    (u.uTint.value as THREE.Color).copy(tint);
    (u.uRays.value as THREE.Vector4).set(k, 0.75, 0.42, this.width / Math.max(1, this.height));
  }

  render(scene: THREE.Scene, camera: THREE.Camera, exposure: number, time: number): void {
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    if (this.ao) {
      this.ao.scene = scene;
      this.ao.camera = camera;
    }
    this.renderer.toneMappingExposure = exposure;
    this.final.uniforms.uTime.value = time;
    this.composer.render();
  }

  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }
}
