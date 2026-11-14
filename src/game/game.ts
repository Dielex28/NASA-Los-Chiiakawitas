import * as THREE from 'three';
import { AudioEngine } from '../audio/audio';
import { Emitter } from '../core/events';
import { clamp01, damp } from '../core/math';
import { Orbi } from '../entities/astronaut';
import { Kit } from '../entities/kit';
import type { ViewContext } from '../entities/modules3d';
import { EnvProbe } from '../render/envprobe';
import { Particles } from '../render/particles';
import { Renderer, type QualityLevel } from '../render/renderer';
import type { OverlayKind } from '../render/shading';
import { MODULES } from '../sim/catalog';
import { missionById, type MissionDef } from '../sim/missions';
import {
  collectSample,
  recordExperiment,
  createMission,
  isBuilt,
  placeModule,
  playerBuild,
  playerClean,
  playerRepair,
  removeModule,
  setShelterOrder,
  step,
  SIM_VERSION,
} from '../sim/sim';
import { WORLDS } from '../sim/worlds';
import type { CargoItem, LogEntry, ModuleState, ModuleType, SimState, WorldId } from '../sim/types';
import { Footprints } from '../world/footprints';
import { World } from '../world/world';
import { BaseView } from './base';
import { BuildSystem, type ScanCircle } from './build';
import { CameraBlend, FollowCamera, TacticalCamera } from './cameras';
import { CargoLanders } from './cargo';
import { AIRLOCK } from './colliders';
import { Input } from './input';
import { AIR_DENSITY, metabolicWatts, type PhysEnv } from './physics';
import { Player } from './player';
import { Props } from './props';
import { Sites, type Site } from './sites';

export type GamePhase = 'boot' | 'menu' | 'loading' | 'playing' | 'ended';
export type GameMode = 'command' | 'eva';
export type PromptKind = 'assemble' | 'repair' | 'clean' | 'enter' | 'sample';

export interface Prompt {
  kind: PromptKind;
  /** Module type or mineral kind, for the label. */
  subject: string;
  hold: boolean;
  /** 0..1 progress for hold actions. */
  progress: number;
}

export interface Marker {
  id: string;
  kind: 'base' | 'site' | 'alert';
  x: number;
  y: number;
  z: number;
  label?: string;
}

export interface GameEvents extends Record<string, unknown> {
  phase: GamePhase;
  mode: GameMode;
  log: LogEntry;
  toast: { key: string; params?: Record<string, string | number>; sev: 'info' | 'good' | 'warn' | 'bad' };
  discovery: { id: string; kind: string };
  scan: { ice: number; illum: number; found: number };
  select: number | null;
  loading: { fraction: number; stage: string };
  placed: ModuleType;
  speed: number;
}

/** Game hours that pass per real second at each command-console speed. */
export const SPEEDS = [0, 0.1, 0.4, 1.2];
/** In a suit, one real second is one mission minute. */
const EVA_RATE = 1 / 60;
const SAVE_KEY = 'helios-outpost-save-v1';
const TERRAIN_SEED: Record<WorldId, number> = { moon: 19690720, mars: 20210218 };
const SUIT_SECONDS = 540;
/** Effort at which the suit lasts exactly SUIT_SECONDS: the steady loping walk of the game (3.1 m/s). */
const NOMINAL_WATTS = 345;
/** Touchdown speed above which a landing hurts, m/s (a 2 m drop on Earth is about 6 m/s). */
const HARD_LANDING = 6.5;
const INTRO_S = 6;

interface Stage {
  world: World;
  kit: Kit;
  base: BaseView;
  sites: Sites;
  player: Player;
  orbi: Orbi;
  dust: Particles;
  sparks: Particles;
  build: BuildSystem;
  cargo: CargoLanders;
  prints: Footprints;
  props: Props;
}

interface SaveFile {
  v: number;
  sim: SimState;
  scans: ScanCircle[];
  scannedSites: string[];
  savedAt: number;
}

/**
 * The game shell: owns the renderer, the active world and the mission
 * simulation, and translates player input into simulation actions.
 */
export class Game {
  readonly events = new Emitter<GameEvents>();
  readonly renderer: Renderer;
  readonly camera = new THREE.PerspectiveCamera(52, 1, 0.25, 16000);
  readonly input: Input;
  readonly audio = new AudioEngine();
  phase: GamePhase = 'boot';
  mode: GameMode = 'command';
  sim: SimState | null = null;
  mission: MissionDef | null = null;
  speed = 1;
  private lastSpeed = 1;
  selectedId: number | null = null;
  hoverId: number | null = null;
  scans: ScanCircle[] = [];
  prompt: Prompt | null = null;
  markers: Marker[] = [];
  /** Remaining suit consumables, 0..1. */
  suit = 1;
  /** Metabolic power of the commander on EVA, watts. */
  metabolic = 0;
  private throwCooldown = 0;
  private poseT = 0;
  overlay: OverlayKind = 'none';
  /** UI sets this while a modal screen is open so the world ignores input. */
  uiBlocking = false;
  fps = 60;
  /** Lower the render resolution automatically when the frame rate drops. */
  adaptive = true;
  private stage: Stage | null = null;
  private stages: Partial<Record<WorldId, Stage>> = {};
  private tactical: TacticalCamera | null = null;
  private follow: FollowCamera | null = null;
  private blend = new CameraBlend();
  private clock = new THREE.Clock();
  private time = 0;
  private logIndex = 0;
  private focus = new THREE.Vector3();
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private scanT = -1;
  private scanCooldown = 0;
  private scanOrigin = new THREE.Vector3();
  private saveTimer = 0;
  private holdProgress = 0;
  private intro = 0;
  private menuSim: SimState | null = null;
  private earthDir = new THREE.Vector3(0.34, 0.115, -0.93).normalize();
  private toolOn = false;
  private suitWarned = false;
  private boundsWarned = 0;
  private alarmT = 0;
  private windAcc = 0;
  private env: EnvProbe;
  private envWorld: WorldId | null = null;
  private introActive = false;
  private ctx: ViewContext;

  constructor(
    canvas: HTMLCanvasElement,
    quality: QualityLevel,
  ) {
    this.renderer = new Renderer(canvas, quality);
    this.env = new EnvProbe(this.renderer.renderer);
    this.input = new Input(canvas);
    this.ctx = {
      dt: 0,
      time: 0,
      sunDir: new THREE.Vector3(0, 1, 0),
      sunAz: 0,
      sunEl: 0,
      darkness: 0,
      world: 'moon',
      earthDir: this.earthDir,
      moduleById: (id) => this.activeSim?.modules.find((m) => m.id === id),
      ground: (x, z) => this.stage?.world.ground(x, z) ?? 0,
      simRate: 1,
    };
    this.fitViewport();
    window.addEventListener('resize', () => this.fitViewport());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save();
    });
    window.addEventListener('beforeunload', () => this.save());
  }

  get world(): World | null {
    return this.stage?.world ?? null;
  }

  get build(): BuildSystem | null {
    return this.stage?.build ?? null;
  }

  private get activeSim(): SimState | null {
    return this.phase === 'menu' || this.phase === 'boot' ? this.menuSim : this.sim;
  }

  private setPhase(p: GamePhase): void {
    this.phase = p;
    this.events.emit('phase', p);
  }

  /* ------------------------------------------------------------ worlds */

  private async ensureStage(id: WorldId, startLocalH: number): Promise<Stage> {
    let st = this.stages[id];
    if (!st) {
      const world = await World.create(id, TERRAIN_SEED[id], startLocalH, this.renderer.quality, (fraction, stage) => this.events.emit('loading', { fraction, stage }));
      const kit = new Kit(id, world.uniforms);
      const g = WORLDS[id].gravity;
      const q = this.renderer.quality.particles;
      const dust = new Particles(Math.floor(2600 * q), false, g, id === 'mars' ? 1.6 : 0);
      const sparks = new Particles(Math.floor(700 * q), true, g, id === 'mars' ? 0.4 : 0);
      world.scene.add(dust.points, sparks.points);
      const player = new Player(kit);
      player.astronaut.group.visible = false;
      player.astronaut.setLampShadows(this.renderer.quality.lampShadows);
      world.scene.add(player.astronaut.group);
      const prints = new Footprints(id === 'moon' ? 0.5 : 0.34);
      world.scene.add(prints.mesh);
      const orbi = new Orbi(kit);
      orbi.group.visible = false;
      world.scene.add(orbi.group);
      st = {
        world,
        kit,
        base: new BaseView(world, kit),
        sites: new Sites(world, kit),
        player,
        orbi,
        dust,
        sparks,
        build: new BuildSystem(world, kit, () => this.scans),
        cargo: new CargoLanders(world, kit, dust, sparks),
        prints,
        props: this.makeProps(world, kit, dust),
      };
      this.stages[id] = st;
    }
    this.stage = st;
    this.tactical = new TacticalCamera((x, z) => st!.world.ground(x, z));
    this.follow = new FollowCamera((x, z) => st!.world.ground(x, z));
    this.ctx.world = id;
    return st;
  }

  /** Load the backdrop world and a small showcase base for the title screen. */
  async boot(world: WorldId = 'moon'): Promise<void> {
    const mission = missionById(world === 'moon' ? 'moon-sandbox' : 'mars-sandbox');
    const st = await this.ensureStage(world, mission.startLocalH);
    this.menuSim = this.demoBase(st, mission);
    st.base.clear();
    st.cargo.clear();
    st.sites.restore([], []);
    st.build.cancel();
    st.base.sync(this.menuSim);
    this.tactical!.focus(8, 0, true);
    this.tactical!.setDistance(74, true);
    this.tactical!.yaw = 2.3;
    this.tactical!.pitch = 0.2;
    this.setPhase('menu');
  }

  private demoBase(st: Stage, mission: MissionDef): SimState {
    const hf = st.world.hf;
    const s = createMission(mission, mission.recommended, 7, hf, hf.padHeight(0, 0, 5).top);
    const layout: Array<[ModuleType, number, number, number]> = [
      ['hab', 26, -8, 0.35],
      ['solar', -20, -24, 0],
      ['solar', -32, -6, 0],
      ['solar', -26, 16, 0],
      ['eclss', 22, 14, 1.2],
      ['battery', -12, 18, 0.5],
      ['lab', 46, 18, 2.2],
      ['antenna', -4, -28, 0],
      ['greenhouse', 48, -26, 0.4],
      ['shelter', 6, 32, 0],
      ['rassor', 34, 4, 0.5],
      ['tank', 30, 34, 0.8],
      ['pylon', 12, -18, 0],
      ['pylon', 34, -18, 0],
    ];
    for (const [type, x, z, rot] of layout) {
      if ((s.inventory[type] ?? 0) <= 0) s.inventory[type] = 1;
      const y = hf.padHeight(x, z, MODULES[type].radius * 0.7).top;
      const m = placeModule(s, type, x, y, z, rot, hf);
      if (m) {
        m.built = 1;
        m.charge = MODULES[type].storageKwh * 0.7;
        if (type === 'hab') m.regolith = 150;
        if (type === 'greenhouse') m.growth = 0.6;
      }
    }
    s.inventory = {};
    step(s, 0.2);
    return s;
  }

  /* ----------------------------------------------------------- mission */

  async startMission(missionId: string, manifest: Partial<Record<CargoItem, number>>): Promise<void> {
    const mission = missionById(missionId);
    this.setPhase('loading');
    this.events.emit('loading', { fraction: 0, stage: 'terrain' });
    const st = await this.ensureStage(mission.world, mission.startLocalH);
    const hf = st.world.hf;
    const sim = createMission(mission, manifest, mission.seed, hf, hf.padHeight(0, 0, 5).top);
    this.beginPlay(st, mission, sim, [], [], true);
  }

  private beginPlay(st: Stage, mission: MissionDef, sim: SimState, scans: ScanCircle[], scannedSites: string[], fresh: boolean): void {
    this.mission = mission;
    this.sim = sim;
    this.scans = scans;
    this.logIndex = sim.log.length;
    this.selectedId = null;
    this.hoverId = null;
    this.mode = 'command';
    this.suit = 1;
    st.build.cancel();
    st.base.clear();
    st.base.sync(sim);
    st.sites.restore(scannedSites, sim.discoveries);
    st.cargo.clear();
    st.cargo.sync(sim, false);
    st.prints.clear();
    st.props.clear();
    st.player.astronaut.group.visible = false;
    st.orbi.group.visible = false;
    sim.playerOutside = false;
    this.setOverlay('none');
    this.tactical!.focus(0, 0, true);
    this.tactical!.yaw = 0.75;
    this.tactical!.pitch = 0.5;
    if (fresh) {
      // establishing shot: descend from altitude to the landing site
      this.tactical!.setDistance(562, true);
      this.intro = INTRO_S;
      this.introActive = true;
    } else this.tactical!.setDistance(92, true);
    this.speed = 1;
    this.lastSpeed = 1;
    this.setPhase('playing');
    this.events.emit('mode', 'command');
    this.events.emit('speed', this.speed);
  }

  hasSave(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const f = JSON.parse(raw) as SaveFile;
      return f.v === SIM_VERSION && !!f.sim && !f.sim.outcome;
    } catch {
      return false;
    }
  }

  saveInfo(): { missionId: string; timeH: number; world: WorldId } | null {
    try {
      const f = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as SaveFile | null;
      if (!f || f.v !== SIM_VERSION) return null;
      return { missionId: f.sim.missionId, timeH: f.sim.timeH, world: f.sim.world };
    } catch {
      return null;
    }
  }

  save(): void {
    if (this.phase !== 'playing' || !this.sim || !this.stage) return;
    try {
      const file: SaveFile = {
        v: SIM_VERSION,
        sim: this.sim,
        scans: this.scans,
        scannedSites: this.stage.sites.list.filter((s) => s.scanned).map((s) => s.poi.id),
        savedAt: Date.now(),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(file));
    } catch {
      /* storage full or unavailable: playing on is better than interrupting */
    }
  }

  clearSave(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  }

  async continueSaved(): Promise<boolean> {
    let file: SaveFile;
    try {
      file = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as SaveFile;
    } catch {
      return false;
    }
    if (!file || file.v !== SIM_VERSION || !file.sim) return false;
    const mission = missionById(file.sim.missionId);
    this.setPhase('loading');
    const st = await this.ensureStage(mission.world, mission.startLocalH);
    file.sim.playerOutside = false;
    this.beginPlay(st, mission, file.sim, file.scans ?? [], file.scannedSites ?? [], false);
    return true;
  }

  async quitToMenu(): Promise<void> {
    this.save();
    if (this.mode === 'eva') this.exitEva(true);
    this.stage?.build.cancel();
    this.sim = null;
    this.mission = null;
    this.audio.setAlarm(false);
    this.setPhase('loading');
    await this.boot(this.stage?.world.id ?? 'moon');
  }

  /* ------------------------------------------------------------ control */

  setSpeed(i: number): void {
    i = Math.max(0, Math.min(SPEEDS.length - 1, i));
    if (i === this.speed) return;
    if (i > 0) this.lastSpeed = i;
    this.speed = i;
    this.events.emit('speed', i);
  }

  togglePause(): void {
    this.setSpeed(this.speed === 0 ? this.lastSpeed : 0);
  }

  select(id: number | null): void {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.events.emit('select', id);
  }

  selected(): ModuleState | null {
    return this.sim?.modules.find((m) => m.id === this.selectedId) ?? null;
  }

  focusModule(id: number): void {
    const m = this.sim?.modules.find((x) => x.id === id);
    if (!m || !this.tactical) return;
    if (this.mode === 'command') {
      this.tactical.focus(m.x, m.z);
      this.tactical.setDistance(Math.min(this.tactical.distance, 70));
    }
    this.select(id);
  }

  startBuild(type: ModuleType): void {
    if (!this.sim || !this.stage) return;
    if ((this.sim.inventory[type] ?? 0) <= 0) {
      this.audio.ui('error');
      return;
    }
    this.select(null);
    this.stage.build.start(type);
    this.audio.ui('open');
  }

  cancelBuild(): void {
    if (this.stage?.build.active) {
      this.stage.build.cancel();
      this.audio.ui('close');
    }
  }

  dismantle(id: number): void {
    if (!this.sim) return;
    if (removeModule(this.sim, id)) {
      this.select(null);
      this.audio.ui('close');
    }
  }

  setOverlay(kind: OverlayKind): void {
    this.overlay = kind;
    const w = this.stage?.world;
    if (!w) return;
    w.setOverlay(kind, this.scans);
    w.uniforms.uOverlayMix.value.y = kind === 'none' ? 0 : 1;
  }

  orderShelter(on: boolean): void {
    if (!this.sim) return;
    setShelterOrder(this.sim, on);
    if (on && this.mode === 'eva') this.exitEva();
  }

  /** Step outside through the nearest airlock. */
  enterEva(): void {
    const sim = this.sim;
    const st = this.stage;
    if (!sim || !st || this.mode === 'eva' || this.phase !== 'playing') return;
    if (sim.shelterOrder) {
      this.events.emit('toast', { key: 'toast.evaSheltered', sev: 'warn' });
      this.audio.ui('error');
      return;
    }
    st.build.cancel();
    // leave by the airlock closest to where the commander is looking
    let door: ModuleState = sim.modules[0];
    let best = Infinity;
    for (const m of sim.modules) {
      if (!AIRLOCK[m.type] || !isBuilt(m)) continue;
      const d = (m.x - this.tactical!.target.x) ** 2 + (m.z - this.tactical!.target.z) ** 2;
      if (d < best) {
        best = d;
        door = m;
      }
    }
    const [lx, lz] = AIRLOCK[door.type] ?? [0, 6];
    const c = Math.cos(door.rot);
    const s = Math.sin(door.rot);
    const px = door.x + lx * c + lz * s;
    const pz = door.z - lx * s + lz * c;
    const yaw = Math.atan2(px - door.x, pz - door.z);
    st.player.place(px, pz, yaw, (x, z) => st.world.ground(x, z));
    st.player.astronaut.group.visible = true;
    st.orbi.group.visible = true;
    st.orbi.group.position.set(px + 1, st.player.pos.y + 2, pz + 1);
    this.follow!.reset(yaw + 2.2);
    this.blend.start(this.camera, 1.6);
    this.mode = 'eva';
    this.suit = 1;
    this.suitWarned = false;
    sim.playerOutside = true;
    this.select(null);
    this.input.lock();
    this.audio.ui('open');
    this.events.emit('mode', 'eva');
  }

  exitEva(silent = false): void {
    const sim = this.sim;
    const st = this.stage;
    if (!st || this.mode !== 'eva') return;
    this.mode = 'command';
    if (sim) sim.playerOutside = false;
    st.build.cancel();
    this.prompt = null;
    this.setTool(false);
    this.audio.setJet(false);
    this.tactical!.focus(st.player.pos.x, st.player.pos.z, true);
    this.tactical!.yaw = this.follow!.yaw;
    this.tactical!.setDistance(80, true);
    this.blend.start(this.camera, 1.4);
    st.player.astronaut.group.visible = false;
    st.orbi.group.visible = false;
    this.input.unlock();
    if (!silent) this.audio.ui('close');
    this.events.emit('mode', 'command');
  }

  /** Scanner pulse: reveals sample sites and surveys ice and sunlight where you stand. */
  scan(): void {
    const st = this.stage;
    if (!st || this.scanCooldown > 0 || this.mode !== 'eva') return;
    this.scanCooldown = 3.2;
    this.scanT = 0;
    this.scanOrigin.copy(st.player.pos);
    this.audio.scan();
    const found = st.sites.scan(st.player.pos.x, st.player.pos.z, 110);
    this.scans.push({ x: st.player.pos.x, z: st.player.pos.z, r: 110 });
    if (this.scans.length > 60) this.scans.shift();
    const ice = st.world.hf.iceRichness(st.player.pos.x, st.player.pos.z);
    const illum = st.world.hf.illumination(st.player.pos.x, st.player.pos.z);
    this.events.emit('scan', { ice, illum, found: found.length });
  }

  private setTool(on: boolean): void {
    if (on === this.toolOn) return;
    this.toolOn = on;
    this.audio.setTool(on);
  }

  /* -------------------------------------------------------------- loop */

  /**
   * Match the drawing surface to the window. Also checked every frame, because a window that
   * starts hidden or switches to full screen does not always announce its new size.
   */
  private fitViewport(): void {
    const w = Math.max(2, window.innerWidth);
    const h = Math.max(2, window.innerHeight);
    const size = this.renderer.size;
    if (size.width === w && size.height === h) return;
    this.renderer.resize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  run(): void {
    const loop = (): void => {
      requestAnimationFrame(loop);
      this.frame();
    };
    loop();
  }

  private frame(): void {
    const raw = this.clock.getDelta();
    const dt = Math.min(0.05, raw);
    this.time += dt;
    this.fps = damp(this.fps, 1 / Math.max(1e-3, raw), 2, dt);
    this.fitViewport();
    if (this.adaptive && !document.hidden) this.renderer.adapt(this.fps, dt);
    const st = this.stage;
    if (!st || (this.phase !== 'playing' && this.phase !== 'menu' && this.phase !== 'ended')) {
      this.input.endFrame();
      return;
    }
    const sim = this.activeSim;
    if (!sim) {
      this.input.endFrame();
      return;
    }
    const playing = this.phase === 'playing';
    const allowInput = playing && !this.uiBlocking && this.intro <= 0;
    this.intro = Math.max(0, this.intro - dt);

    // ---- simulate
    let rate = 0;
    if (playing) rate = this.mode === 'eva' ? EVA_RATE : SPEEDS[this.speed];
    else if (this.phase === 'menu') rate = 0.03;
    if (rate > 0) step(sim, rate * dt);
    if (playing) this.drainLog(sim);

    st.base.sync(sim);
    const env = sim.env;

    // ---- player / camera
    if (playing && this.mode === 'eva') this.updateEva(dt, st, sim, allowInput);
    else this.updateCommand(dt, st, sim, allowInput);
    this.blend.apply(this.camera, dt);

    // ---- scanner pulse
    this.scanCooldown = Math.max(0, this.scanCooldown - dt);
    const us = st.world.uniforms.uScan.value;
    if (this.scanT >= 0) {
      this.scanT += dt;
      const k = this.scanT / 2.4;
      us.set(this.scanOrigin.x, this.scanOrigin.z, 110 * (1 - Math.pow(1 - Math.min(1, k), 2)), 1 - clamp01((k - 0.7) / 0.6));
      if (k > 1.3) this.scanT = -1;
    } else us.w = 0;

    // ---- world + base visuals
    st.world.atmosphere.shadowRange = this.mode === 'eva' && playing ? 70 : Math.min(260, Math.max(70, (this.tactical?.distance ?? 80) * 1.15));
    st.world.update(dt, env, this.camera, this.focus, sim.timeH, this.time, this.phase === 'menu' ? 8 : 4.5);
    const atm = st.world.atmosphere;
    // reflections follow the light: rebuild the environment map when the sky or the Sun has changed
    const worldChanged = this.envWorld !== st.world.id;
    if (this.env.update(dt, atm.env, worldChanged) || worldChanged) {
      this.envWorld = st.world.id;
      st.kit.setEnvironment(this.env.texture);
    }
    const c = this.ctx;
    c.dt = dt;
    c.time = this.time;
    c.sunDir.copy(atm.sunDir);
    c.sunAz = env.sunAz;
    c.sunEl = env.sunEl;
    c.darkness = atm.darkness;
    c.simRate = rate * 3600;
    st.base.update(sim, c, this.focus);
    st.sites.update(this.time);
    if (playing) st.cargo.sync(sim, true);
    st.cargo.update(dt, this.time);
    if (st.cargo.touchdown) this.audio.land(1);

    // Mars has weather: on foot you see dust streaming past on the wind, thick in a storm
    if (st.world.id === 'mars' && playing && this.mode === 'eva') {
      const storm = env.storm;
      this.windAcc += dt * (8 + 150 * storm) * this.renderer.quality.particles;
      const reach = 30;
      while (this.windAcc >= 1) {
        this.windAcc -= 1;
        const x = this.focus.x + (Math.random() - 0.5) * 2 * reach - reach * 0.4;
        const z = this.focus.z + (Math.random() - 0.5) * 2 * reach;
        const y = st.world.ground(x, z) + 0.15 + Math.random() * (1.8 + 5 * storm);
        const v = 5 + 9 * storm + Math.random() * 4;
        st.dust.spawn(x, y, z, v, 0.1 + Math.random() * 0.4, v * 0.25, 2.2 + Math.random() * 1.6, 0.3 + 0.6 * storm, 0.8, 0.5, 0.3, 0.07 + 0.13 * storm);
      }
    }

    // dust is lit by whatever light reaches the ground here
    const light = 0.08 + 0.9 * (1 - atm.darkness);
    st.dust.material.uniforms.uLight.value.setScalar(light * (st.world.id === 'moon' ? 0.75 : 1.15));
    const h = this.renderer.size.height;
    st.dust.update(this.time, h, this.camera.fov);
    st.sparks.update(this.time, h, this.camera.fov);

    // selection ring (the build cursor owns the ring while placing)
    if (!st.build.active) {
      const u = st.world.uniforms;
      const sel = playing ? this.selected() : null;
      if (sel) {
        u.uRing.value.set(sel.x, sel.z, MODULES[sel.type].radius, 1);
        u.uRingColor.value.setRGB(0.25, 0.8, 1.0);
      } else u.uRing.value.w = 0;
      u.uRange.value.w = 0;
    }

    // ---- post effects
    const fin = this.renderer.final.uniforms;
    fin.uRad.value = damp(fin.uRad.value, clamp01(env.speMsvH / 6) * (this.mode === 'eva' ? 1 : 0.45), 2, dt);
    fin.uVisor.value = damp(fin.uVisor.value, this.mode === 'eva' && playing ? 1 : 0, 3, dt);
    this.renderer.bloom.strength = st.world.id === 'moon' ? 0.3 : 0.26;

    this.audio.update(dt, this.mode === 'eva' && playing, st.world.id === 'mars', env.storm, clamp01(st.player.vel.length() / 5) + st.player.working * 0.5, !playing);
    const emergency = playing && (env.speMsvH > 0.3 || sim.power.blackout);
    this.alarmT = emergency ? this.alarmT + dt : 0;
    this.audio.setAlarm(emergency && this.alarmT < 9 && (this.mode === 'eva' || this.speed > 0));

    this.renderer.setRays(this.camera, atm.sunDir, atm.shafts, atm.shaftTint);
    this.renderer.render(st.world.scene, this.camera, atm.exposure, this.time);

    // ---- housekeeping
    if (playing) {
      this.saveTimer += dt;
      if (this.saveTimer > 20) {
        this.saveTimer = 0;
        this.save();
      }
      if (sim.outcome) {
        if (this.mode === 'eva') this.exitEva(true);
        this.clearSave();
        this.audio.ui(sim.outcome.result === 'success' ? 'good' : 'bad');
        this.setPhase('ended');
      }
    }
    this.input.endFrame();
  }

  /** Forward new simulation log entries to the UI and react to the serious ones. */
  private drainLog(sim: SimState): void {
    // the log is capped, so the index can run ahead of a trimmed array
    if (this.logIndex > sim.log.length) this.logIndex = sim.log.length;
    while (this.logIndex < sim.log.length) {
      const e = sim.log[this.logIndex++];
      this.events.emit('log', e);
      if (e.sev === 'bad') {
        this.audio.ui('bad');
        if (this.speed > 1) this.setSpeed(1);
      } else if (e.sev === 'warn') {
        this.audio.ui('warn');
        if (this.speed > 2) this.setSpeed(2);
      } else if (e.sev === 'good') this.audio.ui('good');
      if (e.key === 'log.spe.warn' || e.key === 'log.storm.warn' || e.key === 'log.resupply.arrived') this.audio.radio();
    }
  }

  private cursorRay(center: boolean): THREE.Ray {
    if (center) this.ndc.set(0, 0);
    else this.ndc.set((this.input.mouseX / window.innerWidth) * 2 - 1, -(this.input.mouseY / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    return this.ray.ray;
  }

  private updateCommand(dt: number, st: Stage, sim: SimState, allowInput: boolean): void {
    const tac = this.tactical!;
    const input = this.input;
    if (this.phase === 'menu' || this.phase === 'ended') {
      tac.yaw += dt * 0.022;
      tac.update(input, dt, this.camera, false);
      this.focus.copy(tac.target);
      this.hoverId = null;
      return;
    }
    if (this.intro > 0 || this.introActive) {
      // any click or key hurries the establishing shot along
      if (this.intro > 0.7 && (input.buttonHit(0) || input.hit('Space') || input.hit('Escape') || input.hit('Enter'))) this.intro = 0.7;
      const k = this.intro / INTRO_S;
      const e = k * k * (3 - 2 * k);
      // drive the camera's goals (it eases toward them); one last pass at k = 0 lands exactly on the play view
      tac.setDistance(92 + 470 * e);
      tac.yaw = 0.75 + 1.1 * e;
      tac.pitch = 0.5 + 0.42 * e;
      this.introActive = this.intro > 0;
    }
    tac.update(input, dt, this.camera, allowInput);
    this.focus.copy(tac.target);
    if (!allowInput) return;

    const build = st.build;
    if (build.active) {
      if (input.hit('KeyR')) build.rot += Math.PI / 8;
      if (input.hit('KeyT')) build.rot -= Math.PI / 8;
      const ray = this.cursorRay(false);
      build.update(sim, ray.origin, ray.direction, this.time);
      if (input.click(0) && input.overView) this.confirmBuild(st, sim);
      if (input.hit('Escape') || input.click(2)) this.cancelBuild();
    } else {
      const ray = this.cursorRay(false);
      const hit = input.overView ? st.base.pick(ray.origin, ray.direction, sim) : null;
      this.hoverId = hit ? hit.id : null;
      if (input.click(0) && input.overView) {
        this.select(hit ? hit.id : null);
        if (hit) this.audio.ui('tick');
      }
      if (input.hit('Escape')) this.select(null);
    }
    if (input.hit('Space')) this.togglePause();
    if (input.hit('Digit1')) this.setSpeed(1);
    if (input.hit('Digit2')) this.setSpeed(2);
    if (input.hit('Digit3')) this.setSpeed(3);
    if (input.hit('Tab')) this.enterEva();
  }

  private confirmBuild(st: Stage, sim: SimState): void {
    const type = st.build.active;
    const m = st.build.confirm(sim);
    if (!m || !type) {
      this.audio.ui('error');
      return;
    }
    this.audio.ui('place');
    const [r, g, b] = this.dustColor(st);
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * 6.283;
      const v = 1 + Math.random() * 3;
      st.dust.spawn(m.x + Math.cos(a) * MODULES[type].radius * 0.6, m.y + 0.1, m.z + Math.sin(a) * MODULES[type].radius * 0.6, Math.cos(a) * v, 0.6 + Math.random() * 1.6, Math.sin(a) * v, 2.6, 0.7, r, g, b, 0.5);
    }
    this.events.emit('placed', type);
    // keep placing the same kind while stock lasts (handy for arrays and pylons)
    if ((sim.inventory[type] ?? 0) <= 0) st.build.cancel();
  }

  private dustColor(st: Stage): [number, number, number] {
    return st.world.id === 'moon' ? [0.62, 0.61, 0.6] : [0.78, 0.47, 0.28];
  }

  private updateEva(dt: number, st: Stage, sim: SimState, allowInput: boolean): void {
    const input = this.input;
    const player = st.player;
    const follow = this.follow!;
    const world = st.world;
    const colliders = st.base.colliders.concat(world.rocks.colliders);
    player.update(
      dt,
      allowInput ? input : null,
      follow.yaw,
      {
        ground: (x, z) => world.ground(x, z),
        normal: (x, z, out) => world.mesh.normal(x, z, out),
        gravity: WORLDS[world.id].gravity,
        colliders,
        dust: st.dust,
        dustColor: this.dustColor(st),
        hasAir: world.id === 'mars',
        limitRadius: 1180,
        onStep: (s) => this.audio.step(s, world.id === 'mars'),
        onPrint: (x, z, yaw) => st.prints.add(x, world.ground(x, z), z, yaw, world.mesh.normal(x, z, this.tmpN)),
        onLand: (s) => this.audio.land(s),
        onImpact: (v) => this.hardLanding(v, sim),
        onJet: (on) => this.audio.setJet(on),
      },
      world.atmosphere.darkness,
      this.time,
    );
    follow.update(input, dt, this.camera, player.pos, allowInput, colliders);
    this.focus.copy(player.pos);
    st.orbi.update(dt, player.pos, follow.yaw, (x, z) => world.ground(x, z), this.camera.position);

    // loose objects: thrown rocks, the hammer and the feather
    const wind = world.id === 'mars' ? 3 + 22 * sim.env.storm : 0;
    this.physEnv.gravity = WORLDS[world.id].gravity;
    this.physEnv.airDensity = AIR_DENSITY[world.id];
    this.physEnv.windX = wind * 0.94;
    this.physEnv.windZ = wind * 0.34;
    this.physEnv.ground = (x, z) => world.ground(x, z);
    this.physEnv.normal = (x, z) => {
      const n = world.mesh.normal(x, z, this.tmpN);
      return [n.x, n.y, n.z];
    };
    this.physEnv.colliders = colliders;
    st.props.update(dt, this.physEnv);
    this.throwCooldown = Math.max(0, this.throwCooldown - dt);
    if (allowInput && !st.build.active && player.grounded && player.working < 0.2) {
      if (input.hit('KeyG') && !st.props.dropping) {
        st.props.startDrop(player.pos.x, player.pos.z, player.yaw, (x, z) => world.ground(x, z));
        this.poseT = 0.7;
        this.audio.ui('tick');
      }
      if (input.hit('KeyR') && this.throwCooldown <= 0) {
        // aim with the camera: looking up lofts the throw, looking down flattens it
        const elevation = Math.min(1.05, Math.max(0.15, 0.75 - follow.pitch * 0.9));
        const speed = 11;
        const fx = -Math.sin(follow.yaw);
        const fz = -Math.cos(follow.yaw);
        const h = Math.cos(elevation) * speed;
        st.props.throwRock(
          player.pos.x + fx * 0.5,
          player.pos.y + 1.55,
          player.pos.z + fz * 0.5,
          fx * h + player.vel.x,
          Math.sin(elevation) * speed,
          fz * h + player.vel.z,
          (x, z) => world.ground(x, z),
        );
        this.throwCooldown = 1.1;
        this.poseT = 0.35;
        this.audio.ui('tick');
      }
    }
    if (this.poseT > 0) this.poseT -= dt;

    // suit consumables drain with effort: a resting astronaut uses far less oxygen and cooling
    // water than one who is running
    const speedNow = Math.hypot(player.vel.x, player.vel.z);
    this.metabolic = damp(this.metabolic, metabolicWatts(speedNow, player.thrust, player.working), 2.5, dt);
    this.suit = Math.max(0, this.suit - (dt / SUIT_SECONDS) * (this.metabolic / NOMINAL_WATTS));
    if (this.suit < 0.2 && !this.suitWarned) {
      this.suitWarned = true;
      this.events.emit('toast', { key: 'toast.suitLow', sev: 'warn' });
      this.audio.ui('warn');
    }
    if (this.suit <= 0) {
      this.events.emit('toast', { key: 'toast.suitEmpty', sev: 'bad' });
      for (const c of sim.crew) if (c.isPlayer) c.health = Math.max(5, c.health - 12);
      this.exitEva();
      return;
    }
    if (player.outOfBounds) {
      this.boundsWarned -= dt;
      if (this.boundsWarned <= 0) {
        this.boundsWarned = 12;
        this.events.emit('toast', { key: 'toast.bounds', sev: 'warn' });
      }
    }

    // ---- placing a module by hand
    const build = st.build;
    if (build.active && allowInput) {
      if (input.hit('KeyR')) build.rot += Math.PI / 8;
      const ray = this.cursorRay(true);
      build.update(sim, ray.origin, ray.direction, this.time);
      if (input.hit('KeyE') || (input.locked && input.buttonHit(0))) this.confirmBuild(st, sim);
      if (input.hit('Escape') || input.hit('KeyQ')) this.cancelBuild();
      this.prompt = null;
      this.setTool(false);
      player.working = 0;
    } else this.updateInteraction(dt, st, sim, allowInput);
    // arms out while releasing or throwing something
    if (this.poseT > 0) player.working = Math.max(player.working, 0.45);

    if (allowInput) {
      if (input.hit('KeyF')) this.scan();
      if (input.hit('Tab')) this.exitEva();
      if (!input.locked && input.buttonHit(0) && input.overView) input.lock();
    }

    // ---- waypoints
    this.markers.length = 0;
    const lander = sim.modules[0];
    this.markers.push({ id: 'base', kind: 'base', x: lander.x, y: lander.y + 9, z: lander.z });
    for (const s of st.sites.list) {
      if (s.scanned && !s.collected) this.markers.push({ id: s.poi.id, kind: 'site', x: s.poi.x, y: s.y + 2.5, z: s.poi.z, label: s.poi.kind });
    }
    for (const m of sim.modules) {
      if (m.down || (m.type === 'solar' && m.dust > 0.3)) this.markers.push({ id: `m${m.id}`, kind: 'alert', x: m.x, y: m.y + 5, z: m.z, label: m.type });
    }
  }

  /** Find what the commander can do right here and run hold-to-work actions. */
  private updateInteraction(dt: number, st: Stage, sim: SimState, allowInput: boolean): void {
    const p = st.player;
    let best: { kind: PromptKind; m?: ModuleState; site?: Site; d: number } | null = null;
    for (const m of sim.modules) {
      const reach = MODULES[m.type].radius * 0.78 + 2.6;
      const d = Math.hypot(m.x - p.pos.x, m.z - p.pos.z);
      if (d > reach) continue;
      let kind: PromptKind | null = null;
      if (!isBuilt(m)) kind = 'assemble';
      else if (m.down || m.condition < 88) kind = 'repair';
      else if (m.type === 'solar' && m.dust > 0.03) kind = 'clean';
      else if (AIRLOCK[m.type]) kind = 'enter';
      if (!kind) continue;
      // work beats walking back inside
      const score = d + (kind === 'enter' ? 6 : 0);
      if (!best || score < best.d) best = { kind, m, d: score };
    }
    const site = st.sites.nearest(p.pos.x, p.pos.z, 3.4);
    if (site && (!best || best.kind === 'enter')) best = { kind: 'sample', site, d: 0 };

    if (!best) {
      this.prompt = null;
      this.holdProgress = 0;
      p.working = damp(p.working, 0, 10, dt);
      this.setTool(false);
      return;
    }
    const hold = best.kind === 'assemble' || best.kind === 'repair' || best.kind === 'clean';
    const using = allowInput && hold && this.input.key('KeyE');
    let progress = 0;
    if (best.m) {
      const m = best.m;
      progress = best.kind === 'assemble' ? m.built : best.kind === 'repair' ? m.condition / 100 : 1 - m.dust;
      if (using) {
        if (best.kind === 'assemble') playerBuild(sim, m.id, dt * 0.7);
        else if (best.kind === 'repair') playerRepair(sim, m.id, dt * 13);
        else playerClean(sim, m.id, dt * 0.3);
        p.faceTarget = this.tmpV.set(m.x, m.y, m.z);
        // sparks or dust from the work
        if (Math.random() < dt * 40) {
          const ax = p.pos.x + Math.sin(p.yaw) * 0.9;
          const az = p.pos.z + Math.cos(p.yaw) * 0.9;
          if (best.kind === 'clean') {
            const [r, g, b] = this.dustColor(st);
            st.dust.spawn(ax, p.pos.y + 1.3, az, (Math.random() - 0.5) * 2, 0.5 + Math.random(), (Math.random() - 0.5) * 2, 1.6, 0.4, r, g, b, 0.45);
          } else {
            st.sparks.spawn(ax, p.pos.y + 1.25, az, (Math.random() - 0.5) * 3.5, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 3.5, 0.5 + Math.random() * 0.5, 0.07, 3.0, 1.9, 0.6, 1);
          }
        }
      }
    }
    p.working = damp(p.working, using ? 1 : 0, 10, dt);
    this.setTool(using && best.kind !== 'clean');
    this.holdProgress = progress;
    this.prompt = { kind: best.kind, subject: best.m ? best.m.type : (best.site?.poi.kind ?? ''), hold, progress };

    if (allowInput && this.input.hit('KeyE')) {
      if (best.kind === 'enter') this.exitEva();
      else if (best.kind === 'sample' && best.site) {
        if (collectSample(sim, best.site.poi.id)) {
          best.site.collected = true;
          this.audio.pickup();
          this.events.emit('discovery', { id: best.site.poi.id, kind: best.site.poi.kind });
        }
      }
    }
  }
  private tmpV = new THREE.Vector3();
  private tmpN = new THREE.Vector3();
  private physEnv: PhysEnv = { gravity: 1.62, airDensity: 0, windX: 0, windZ: 0, ground: () => 0, normal: () => [0, 1, 0] };

  /** Loose objects for one world, with their results reported to the player. */
  private makeProps(world: World, kit: Kit, dust: Particles): Props {
    const props = new Props(kit);
    world.scene.add(props.group);
    // numbers in the reader's own notation (decimal comma or point)
    const num = (v: number, digits: number): string => v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    const ms = (s: number): string => num(s * 1000, 0);
    props.onDrop = (r) => {
      const sim = this.sim;
      const params = { h: num(r.hammer, 2), f: num(r.feather, 2), d: ms(Math.abs(r.feather - r.hammer)), w: num(r.drift * 100, 0), e: ms(r.earthLag) };
      this.events.emit('toast', { key: world.id === 'moon' ? 'toast.drop.moon' : 'toast.drop.mars', params, sev: 'good' });
      if (sim && recordExperiment(sim, 'drop')) this.audio.ui('good');
    };
    props.onThrow = (r) => {
      const sim = this.sim;
      const params = { r: num(r.range, 0), t: num(r.time, 1), a: num(r.apex, 1), e: num(r.earthRange, 0) };
      this.events.emit('toast', { key: 'toast.throw', params, sev: 'info' });
      if (sim && recordExperiment(sim, 'throw')) this.audio.ui('good');
    };
    props.onImpact = (speed, kind) => {
      if (kind === 'feather') return;
      this.audio.land(Math.min(1, speed / 9) * 0.5);
      void dust;
    };
    return props;
  }

  /** Coming down too fast damages the suit and bruises the commander, whatever the gravity. */
  private hardLanding(speed: number, sim: SimState): void {
    if (speed < HARD_LANDING) return;
    const over = speed - HARD_LANDING;
    this.suit = Math.max(0.02, this.suit - 0.05 * over);
    for (const c of sim.crew) if (c.isPlayer) c.health = Math.max(5, c.health - 4 * over);
    this.events.emit('toast', { key: 'toast.hardLanding', params: { v: speed.toLocaleString(undefined, { maximumFractionDigits: 1 }) }, sev: 'warn' });
    this.audio.ui('warn');
  }

  /** Project a world position to screen pixels; returns null when behind the camera. */
  project(x: number, y: number, z: number): { x: number; y: number; dist: number } | null {
    const v = this.tmpP.set(x, y, z);
    const dist = v.distanceTo(this.camera.position);
    v.project(this.camera);
    if (v.z > 1) return null;
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight, dist };
  }
  private tmpP = new THREE.Vector3();

  /** Player position for the HUD compass and minimap. */
  playerPose(): { x: number; z: number; yaw: number } | null {
    if (this.mode !== 'eva' || !this.stage) return null;
    return { x: this.stage.player.pos.x, z: this.stage.player.pos.z, yaw: this.follow?.yaw ?? 0 };
  }

  cameraYaw(): number {
    return this.mode === 'eva' ? (this.follow?.yaw ?? 0) : (this.tactical?.yaw ?? 0);
  }

  jetFuel(): number {
    return this.stage?.player.fuel ?? 1;
  }
}
