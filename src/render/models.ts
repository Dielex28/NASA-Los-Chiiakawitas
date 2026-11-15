import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import astronautUrl from '../assets/models/astronaut.glb?url';
import curiosityUrl from '../assets/models/curiosity.glb?url';

/**
 * The two hand-made 3D models of the game. Both were compressed with glTF-Transform
 * (meshopt geometry, WebP textures; see docs/MODELOS.md), so the loader needs the meshopt
 * decoder. In the single-file build Vite inlines them as data URLs, which `fetch` reads like
 * any other address, so the game still runs from a double-click with no server.
 *
 * Loading is lazy and shared: every caller gets the same promise. A model that cannot load
 * (an old browser without WebP, a broken file) resolves to null and the game keeps its
 * procedural stand-ins.
 */
const cache = new Map<string, Promise<GLTF | null>>();

function load(url: string): Promise<GLTF | null> {
  let p = cache.get(url);
  if (!p) {
    if (typeof window === 'undefined') return Promise.resolve(null);
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    p = loader.loadAsync(url).catch((e: unknown) => {
      console.warn('[models] could not load', url.slice(0, 60), e);
      return null;
    });
    cache.set(url, p);
  }
  return p;
}

/** Astronaut in a surface suit, one textured mesh 1 unit tall, facing +Z, centred on the origin. */
export function loadAstronautModel(): Promise<GLTF | null> {
  return load(astronautUrl);
}

/** NASA's Curiosity rover (NASA/JPL-Caltech), in metres, wheels on y = 0, facing +Z. */
export function loadCuriosityModel(): Promise<GLTF | null> {
  return load(curiosityUrl);
}
