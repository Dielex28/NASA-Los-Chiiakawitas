import * as THREE from 'three';
import { clamp01, damp, lerp, smoothstep } from '../core/math';
import { sunDirection, sunVisibility } from '../sim/environment';
import { WORLDS } from '../sim/worlds';
import type { EnvState, WorldId } from '../sim/types';
import type { Heightfield } from './heightfield';
import type { Sky } from './sky';
import type { WorldUniforms } from '../render/shading';

const c = (r: number, g: number, b: number): THREE.Color => new THREE.Color(r, g, b);
const mix = (out: THREE.Color, a: THREE.Color, b: THREE.Color, t: number): THREE.Color => out.copy(a).lerp(b, t);

const MARS = {
  zenithDay: c(0.36, 0.25, 0.17),
  horizonDay: c(0.78, 0.56, 0.36),
  zenithDusk: c(0.07, 0.065, 0.075),
  horizonDusk: c(0.2, 0.17, 0.17),
  zenithNight: c(0.0025, 0.003, 0.006),
  horizonNight: c(0.012, 0.01, 0.011),
  storm: c(0.3, 0.185, 0.095),
  glowDay: c(0.75, 0.58, 0.4),
  glowDusk: c(0.3, 0.5, 0.95), // Martian sunsets are blue: fine dust scatters blue light forward
  sunDay: c(1.0, 0.88, 0.72),
  sunDusk: c(0.62, 0.74, 1.0),
};

/**
 * Lighting rig and sky colours, driven by the simulated environment: Sun
 * position, dust optical depth, and whether the camera's surroundings are in
 * terrain shadow. Also owns the shadow-map camera that follows the view.
 */
export class Atmosphere {
  readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
  readonly fill = new THREE.AmbientLight(0x6f7fa8, 0.05);
  readonly sunDir = new THREE.Vector3(0, 1, 0);
  readonly fog = new THREE.FogExp2(0x000000, 0);
  /** Smoothed tone-mapping exposure target. */
  exposure = 1;
  /** 0 = camera surroundings in full Sun · 1 = in terrain shadow / night. */
  darkness = 0;
  /** Direct sunlight reaching the ground near the camera, 0..1. */
  localSun = 1;
  shadowRange = 80;
  private tmp = new THREE.Color();
  private tmp2 = new THREE.Color();
  private probeTimer = 0;
  private localSunTarget = 1;

  constructor(
    readonly world: WorldId,
    private scene: THREE.Scene,
    private sky: Sky,
    private hf: Heightfield,
    private uniforms: WorldUniforms,
    shadowSize: number,
  ) {
    this.sun.castShadow = shadowSize > 0;
    if (shadowSize > 0) {
      this.sun.shadow.mapSize.set(shadowSize, shadowSize);
      // the lunar Sun grazes the ground, so shadow lookups need a generous offset along the normal
      this.sun.shadow.bias = world === 'moon' ? -0.0009 : -0.0004;
      this.sun.shadow.normalBias = world === 'moon' ? 0.4 : 0.12;
      this.sun.shadow.radius = 2.5;
    }
    scene.add(this.sun, this.sun.target, this.hemi, this.fill);
    scene.fog = world === 'mars' ? this.fog : null;
    uniforms.uHf.value.z = world === 'moon' ? 85 : 45;
  }

  /** Is the Sun visible from a point, marching the baked terrain toward it? 0..1 */
  sunVisibleAt(x: number, y: number, z: number, az: number, el: number): number {
    const dx = Math.sin(az);
    const dz = -Math.cos(az);
    let best = -0.5;
    for (let d = 8; d < 3400; d *= 1.1) {
      const a = Math.atan2(this.hf.sample(x + dx * d, z + dz * d) - y, d);
      if (a > best) best = a;
    }
    return sunVisibility(el, best, WORLDS[this.world].sunAngularRadius * 2);
  }

  update(env: EnvState, focus: THREE.Vector3, dt: number, timeH: number): void {
    const [sx, sy, sz] = sunDirection(env.sunAz, env.sunEl);
    this.sunDir.set(sx, sy, sz);
    this.uniforms.uSunDir.value.copy(this.sunDir);

    this.probeTimer -= dt;
    if (this.probeTimer <= 0) {
      this.probeTimer = 0.2;
      this.localSunTarget = this.sunVisibleAt(focus.x, focus.y + 2, focus.z, env.sunAz, env.sunEl);
    }
    this.localSun = damp(this.localSun, this.localSunTarget, 3, dt);

    const p = this.sky.palette;
    if (this.world === 'moon') {
      const lit = this.localSun;
      p.zenith.setRGB(0, 0, 0);
      p.horizon.setRGB(0, 0, 0);
      p.ground.setRGB(0, 0, 0);
      p.sunDisc.setRGB(60, 58, 54);
      p.glow.setRGB(0.012, 0.012, 0.013);
      p.halo.setRGB(1.2, 1.15, 1.05);
      p.glowPow = 24;
      p.horizonPow = 3;
      p.starVis = lerp(0.55, 1.15, 1 - lit);
      p.milky = lerp(0.35, 0.9, 1 - lit);
      p.glare = 1.0;
      this.sun.color.setRGB(1, 0.985, 0.955);
      this.sun.intensity = 4.4;
      // light bounced off sunlit regolith fills the shadows a little; in a dark crater only earthshine remains
      this.hemi.color.setRGB(0.02, 0.02, 0.025);
      this.hemi.groundColor.setRGB(0.5, 0.49, 0.47);
      this.hemi.intensity = 0.42 * lit + 0.02;
      this.fill.color.setRGB(0.42, 0.52, 0.8);
      this.fill.intensity = 0.07;
      this.darkness = 1 - lit;
      this.exposure = damp(this.exposure, lerp(0.92, 2.4, this.darkness), 1.2, dt);
    } else {
      const mu = Math.sin(env.sunEl);
      const day = smoothstep(-0.1, 0.16, mu);
      const dusk = smoothstep(-0.2, 0.0, mu) * (1 - smoothstep(0.0, 0.34, mu));
      const storm = env.storm;
      const direct = mu > 0 ? Math.exp((-0.55 * env.tau) / Math.max(mu, 0.16)) : 0;

      mix(this.tmp, MARS.zenithNight, MARS.zenithDusk, smoothstep(-0.22, 0.0, mu));
      mix(p.zenith, this.tmp, MARS.zenithDay, smoothstep(0.0, 0.3, mu));
      mix(this.tmp, MARS.horizonNight, MARS.horizonDusk, smoothstep(-0.22, 0.0, mu));
      mix(p.horizon, this.tmp, MARS.horizonDay, smoothstep(0.0, 0.3, mu));
      // dust storm: the whole sky turns a dim, uniform brown
      const stormLum = (0.25 + 0.75 * day) * (1 - 0.45 * storm);
      this.tmp.copy(MARS.storm).multiplyScalar(stormLum);
      p.zenith.lerp(this.tmp, storm * 0.92);
      p.horizon.lerp(this.tmp2.copy(this.tmp).multiplyScalar(1.25), storm * 0.85);
      p.ground.copy(p.horizon).multiplyScalar(0.55);

      mix(p.glow, MARS.glowDay, MARS.glowDusk, dusk).multiplyScalar((0.35 + 0.9 * dusk) * smoothstep(-0.16, 0.02, mu) * (1 - 0.7 * storm));
      p.glowPow = lerp(5, 14, dusk);
      p.halo.copy(p.glow).multiplyScalar(4 * direct + 0.6);
      mix(p.sunDisc, MARS.sunDay, MARS.sunDusk, dusk).multiplyScalar(46 * Math.max(direct, 0.02) * smoothstep(-0.03, 0.02, mu));
      p.horizonPow = lerp(2.2, 4.5, day);
      p.starVis = (1 - smoothstep(-0.18, 0.02, mu)) * (1 - 0.9 * storm);
      p.milky = p.starVis * 0.8;
      p.glare = (0.25 + 0.5 * direct) * smoothstep(-0.02, 0.05, mu) * (1 - 0.8 * storm);

      mix(this.sun.color, MARS.sunDay, MARS.sunDusk, dusk * 0.75);
      this.sun.intensity = 3.9 * direct * smoothstep(-0.01, 0.1, mu);
      // scattered skylight carries most of the energy when the air is dusty
      const skylight = day * (0.55 + 0.9 * (1 - direct) * (1 - 0.5 * storm));
      this.hemi.color.copy(p.horizon).lerp(p.zenith, 0.4);
      this.hemi.groundColor.setRGB(0.32, 0.18, 0.1).multiplyScalar(0.6 + 0.4 * day);
      this.hemi.intensity = 1.6 * skylight + 0.05;
      this.fill.color.setRGB(0.3, 0.36, 0.55);
      this.fill.intensity = 0.05 + 0.03 * (1 - day);
      this.darkness = 1 - clamp01(day * (0.35 + 0.65 * Math.max(direct, 0.35)));
      this.exposure = damp(this.exposure, lerp(1.0, 2.6, 1 - day) * (1 + 0.25 * storm), 1.2, dt);

      this.fog.color.copy(p.horizon).multiplyScalar(0.92);
      this.fog.density = 0.00016 + 0.0028 * storm * storm + 0.00012 * dusk;
      void timeH;
    }

    // shadow camera follows the focus point, snapped to texels to avoid shimmer
    const range = this.shadowRange;
    const sc = this.sun.shadow.camera;
    if (sc.right !== range) {
      sc.left = -range;
      sc.right = range;
      sc.top = range;
      sc.bottom = -range;
      sc.near = 10;
      sc.far = 1400;
      sc.updateProjectionMatrix();
    }
    const texel = (2 * range) / Math.max(1, this.sun.shadow.mapSize.x);
    const fx = Math.round(focus.x / texel) * texel;
    const fy = Math.round(focus.y / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    // keep the light above the horizon plane so the frustum always contains the casters
    const ld = this.tmpV.copy(this.sunDir);
    if (ld.y < 0.03) {
      ld.y = 0.03;
      ld.normalize();
    }
    this.sun.target.position.set(fx, fy, fz);
    this.sun.position.set(fx + ld.x * 700, fy + ld.y * 700, fz + ld.z * 700);
    this.sun.target.updateMatrixWorld();
  }
  private tmpV = new THREE.Vector3();
}
