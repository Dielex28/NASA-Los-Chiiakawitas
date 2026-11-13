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
}

export const QUALITY: Record<QualityLevel, Omit<QualitySettings, 'level'>> = {
  low: { pixelRatio: 0.75, shadowSize: 1024, hfSteps: 18, bloom: false, msaa: 0, rocks: 0.35, particles: 0.4, ao: false },
  medium: { pixelRatio: 1, shadowSize: 2048, hfSteps: 28, bloom: true, msaa: 2, rocks: 0.7, particles: 0.7, ao: false },
  high: { pixelRatio: 1.5, shadowSize: 4096, hfSteps: 40, bloom: true, msaa: 4, rocks: 1, particles: 1, ao: true },
  ultra: { pixelRatio: 2, shadowSize: 4096, hfSteps: 48, bloom: true, msaa: 4, rocks: 1.5, particles: 1.4, ao: true },
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
      // helmet visor: darker rim and a faint curved reflection band
      if (uVisor > 0.01) {
        float rim = smoothstep(0.42, 0.8, r2);
        col *= 1.0 - 0.28 * rim * uVisor;
        col += vec3(0.5, 0.75, 1.0) * 0.03 * uVisor * smoothstep(0.02, 0.0, abs(c.y + 0.4 - c.x * c.x * 0.5));
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

/** WebGL renderer with an HDR pipeline: MSAA → bloom → ACES tone map → grade. */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly ao: GTAOPass | null = null;
  readonly final: ShaderPass;
  private renderPass: RenderPass;
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
