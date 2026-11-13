import type { QualityLevel } from './render/renderer';
import { missionById } from './sim/missions';
import { step } from './sim/sim';
import { App, fatal } from './ui/app';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('view') as HTMLCanvasElement;
const root = document.getElementById('ui') as HTMLElement;

function hasWebGL2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  if (!hasWebGL2()) {
    await import('./ui/styles.css');
    fatal(root, 'Este simulador necesita WebGL 2. Prueba con una versión reciente de Chrome, Edge o Firefox. · This simulator needs WebGL 2. Try a recent Chrome, Edge or Firefox.');
    return;
  }
  const q = params.get('q') as QualityLevel | null;
  const app = new App(canvas, root, q && ['low', 'medium', 'high', 'ultra'].includes(q) ? q : undefined);
  // handles for automated play-testing
  (window as any).app = app;
  (window as any).game = app.game;
  (window as any).simStep = step;
  if (params.get('fixedres')) app.game.adaptive = false;
  await app.start();
  const m = params.get('m');
  if (m) await app.game.startMission(m, missionById(m).recommended);
  (window as any).__ready = true;
}

void main();
