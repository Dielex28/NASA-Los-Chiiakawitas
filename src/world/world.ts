import * as THREE from 'three';
import { createTerrainMaterial } from '../render/terrainMaterial';
import {
  createWorldUniforms,
  makeHeightTexture,
  makeNoiseTexture,
  makeOverlayTexture,
  setHeightfieldQuality,
  setSunShadowQuality,
  type OverlayKind,
  type WorldUniforms,
} from '../render/shading';
import type { QualitySettings } from '../render/renderer';
import { setSurfaceQuality, surfaceTexture } from '../render/surface';
import type { EnvState, WorldId } from '../sim/types';
import { Atmosphere } from './atmosphere';
import { HF_SIZE, Heightfield, SURVEY_SIZE } from './heightfield';
import { Rocks } from './rocks';
import { Sky } from './sky';
import { createTerrain, type Terrain } from './terrain';
import { TerrainMesh } from './terrainMesh';

const nextFrame = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** The planetary surface: terrain, sky and light for one landing site. */
export class World {
  readonly scene = new THREE.Scene();
  readonly uniforms: WorldUniforms = createWorldUniforms();
  terrain!: Terrain;
  hf!: Heightfield;
  mesh!: TerrainMesh;
  sky!: Sky;
  atmosphere!: Atmosphere;
  rocks!: Rocks;
  terrainMaterial!: THREE.MeshStandardMaterial;
  private overlayTex: THREE.DataTexture | null = null;
  overlay: OverlayKind = 'none';

  private constructor(
    readonly id: WorldId,
    readonly seed: number,
  ) {}

  static async create(
    id: WorldId,
    seed: number,
    startLocalH: number,
    quality: QualitySettings,
    onProgress: (fraction: number, stage: string) => void,
  ): Promise<World> {
    const w = new World(id, seed);
    setHeightfieldQuality(quality.hfSteps);
    setSunShadowQuality(quality.sunTaps);
    setSurfaceQuality(quality.textureSize, quality.anisotropy);
    w.terrain = createTerrain(id, seed);
    w.hf = new Heightfield(w.terrain, id);

    onProgress(0, 'terrain');
    const rowsPer = 48;
    for (let r = 0; r < HF_SIZE; r += rowsPer) {
      w.hf.bakeRows(r, Math.min(HF_SIZE, r + rowsPer));
      onProgress(0.5 * (r / HF_SIZE), 'terrain');
      await nextFrame();
    }
    onProgress(0.5, 'survey');
    for (let r = 0; r < SURVEY_SIZE; r += 6) {
      w.hf.surveyRows(r, Math.min(SURVEY_SIZE, r + 6), startLocalH);
      onProgress(0.5 + 0.3 * (r / SURVEY_SIZE), 'survey');
      await nextFrame();
    }

    onProgress(0.8, 'surface');
    w.uniforms.uNoise.value = makeNoiseTexture(seed, quality.textureSize >= 1024 ? 512 : 256, quality.anisotropy);
    w.uniforms.uGroundN.value = surfaceTexture('ground');
    makeHeightTexture(w.hf, w.uniforms);
    w.overlayTex = makeOverlayTexture(w.hf, 'none', id);
    w.uniforms.uOverlay.value = w.overlayTex;
    w.terrainMaterial = createTerrainMaterial(id, w.uniforms);
    w.mesh = new TerrainMesh(w.terrain, w.terrainMaterial);
    w.scene.add(w.mesh.group);
    await nextFrame();

    w.rocks = new Rocks(id, seed, (x, z) => w.mesh.ground(x, z), w.uniforms, quality.rocks);
    w.scene.add(w.rocks.group);

    w.sky = new Sky(id, seed, Math.min(window.devicePixelRatio || 1, quality.pixelRatio));
    w.scene.add(w.sky.group);
    w.atmosphere = new Atmosphere(id, w.scene, w.sky, w.hf, w.uniforms, quality.shadowSize, quality.sunTaps > 0);

    // refine the terrain around the landing site before the first frame
    const eye = new THREE.Vector3(0, w.terrain.height(0, 0, 1) + 30, 60);
    for (let i = 0; i < 400; i++) {
      const done = w.mesh.update(eye, 12);
      if (i % 4 === 0) {
        onProgress(0.86 + 0.14 * Math.min(1, i / 60), 'surface');
        await nextFrame();
      }
      if (done) break;
    }
    onProgress(1, 'ready');
    return w;
  }

  /** Height of the walkable surface. */
  ground(x: number, z: number): number {
    return this.mesh.ground(x, z);
  }

  setOverlay(kind: OverlayKind, scans?: Array<{ x: number; z: number; r: number }>): void {
    this.overlay = kind;
    if (kind !== 'none') makeOverlayTexture(this.hf, kind, this.id, this.overlayTex, scans);
  }

  update(dt: number, env: EnvState, camera: THREE.Camera, focus: THREE.Vector3, timeH: number, realTime: number, budgetMs = 5): void {
    this.uniforms.uTime.value = realTime;
    const om = this.uniforms.uOverlayMix.value;
    om.x += ((this.overlay === 'none' ? 0 : 1) - om.x) * Math.min(1, dt * 6);
    this.atmosphere.update(env, focus, dt, timeH);
    this.sky.update(camera, this.atmosphere.sunDir, timeH, realTime);
    this.mesh.update(camera.position, budgetMs);
    this.rocks.update(focus.x, focus.z);
  }

  dispose(): void {
    this.mesh.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}
