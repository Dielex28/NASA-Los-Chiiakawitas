import * as THREE from 'three';
import { Renderer } from './render/renderer';
import { computeEnv } from './sim/environment';
import { World } from './world/world';
import { Kit } from './entities/kit';
import { ModuleView } from './entities/modules3d';
import { MODULE_ORDER } from './sim/catalog';
import { newModule } from './sim/sim';

// temporary viewer while the game shell is being built
const q = new URLSearchParams(location.search);
const canvas = document.getElementById('view') as HTMLCanvasElement;
document.body.style.cssText = 'margin:0;background:#000;overflow:hidden';
canvas.style.cssText = 'display:block;width:100vw;height:100vh';
const renderer = new Renderer(canvas, (q.get('q') as any) ?? 'high');
const worldId = (q.get('w') as any) ?? 'moon';
const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 16000);
const resize = (): void => {
  renderer.resize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
};
resize();
addEventListener('resize', resize);
World.create(worldId, Number(q.get('seed') ?? 19690720), worldId === 'moon' ? 30 : 8.5, renderer.quality, (f, s) => (document.title = `${s} ${(f * 100).toFixed(0)}%`)).then((world) => {
  const t = Number(q.get('t') ?? 0);
  const cx = Number(q.get('x') ?? 0);
  const cz = Number(q.get('z') ?? 40);
  const ch = Number(q.get('h') ?? 2);
  const yaw = Number(q.get('yaw') ?? 0);
  const pitch = Number(q.get('pitch') ?? 0);
  let env = computeEnv(worldId, t, worldId === 'moon' ? 30 : 8.5, [], null, null, 0);
  if (q.get('tau')) { env = { ...env, tau: Number(q.get('tau')), storm: Math.min(1, Number(q.get('tau')) / 4) }; }
  const focus = new THREE.Vector3(cx, world.ground(cx, cz), cz);
  camera.position.set(cx, world.ground(cx, cz) + ch, cz);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  const views: Array<[ModuleView, any]> = [];
  if (q.get('models')) {
    const kit = new Kit(worldId, world.uniforms);
    const types = ['lander', ...MODULE_ORDER] as any[];
    const only = q.get('only');
    let i = 0;
    for (const type of types) {
      if (only && only !== type) continue;
      const v = new ModuleView(type, kit, worldId);
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = only ? 0 : (col - 1.5) * 17;
      const z = only ? 0 : -row * 17;
      v.group.position.set(x, world.ground(x, z) + 0.4, z);
      world.scene.add(v.group);
      const st = newModule(i + 1, type, x, 0, z, 0);
      st.built = Number(q.get('built') ?? 1); st.mode = 'full'; st.charge = 50; st.growth = 0.7; st.regolith = Number(q.get('reg') ?? 0); st.output = 1;
      views.push([v, st]);
      i++;
    }
    world.rocks.setKeepouts([{ x: 0, z: -25, r: 60 }]);
  }
  const earthDir = new THREE.Vector3(0.3, 0.12, -0.95).normalize();
  let frames = 0;
  const clock = new THREE.Clock();
  const loop = (): void => {
    const dt = Math.min(0.1, clock.getDelta());
    world.atmosphere.shadowRange = 90;
    world.update(dt, env, camera, focus, t, clock.elapsedTime, 30);
    world.atmosphere.localSun = world.atmosphere.sunVisibleAt(focus.x, focus.y + 2, focus.z, env.sunAz, env.sunEl);
    for (const [v, st] of views) v.update(st, { dt, time: clock.elapsedTime, sunDir: world.atmosphere.sunDir, sunAz: env.sunAz, sunEl: env.sunEl, darkness: world.atmosphere.darkness, world: worldId, earthDir, moduleById: () => undefined, ground: (x: number, z: number) => world.ground(x, z), simRate: 1 });
    renderer.render(world.scene, camera, q.get('exp') ? Number(q.get('exp')) : world.atmosphere.exposure, clock.elapsedTime);
    frames++;
    (window as any).__frames = frames;
    requestAnimationFrame(loop);
  };
  loop();
  (window as any).__ready = true;
});
