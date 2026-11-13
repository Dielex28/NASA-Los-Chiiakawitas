import { Game } from '../game/game';
import type { QualityLevel } from '../render/renderer';
import type { CargoItem } from '../sim/types';
import './codexData';
import { h } from './dom';
import { Hud } from './hud';
import { codexScreen, debriefScreen, helpScreen, loadingScreen, menuScreen, missionsScreen, pauseScreen, planningScreen, settingsScreen } from './screens';
import { initLang, setLang, type Lang } from './strings';
import './styles.css';

export interface Settings {
  quality: QualityLevel;
  volume: number;
  music: number;
}

const SETTINGS_KEY = 'helios-settings';
const MINERALS_KEY = 'helios-minerals';

function loadSettings(): Settings {
  const def: Settings = { quality: 'high', volume: 0.8, music: 0.55 };
  try {
    return { ...def, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>) };
  } catch {
    return def;
  }
}

/** Glue between the game and the DOM: owns the screens, the HUD and the player's settings. */
export class App {
  readonly root: HTMLElement;
  readonly game: Game;
  readonly settings: Settings;
  readonly activeQuality: QualityLevel;
  overlayOpen: HTMLElement | null = null;
  private screen: HTMLElement | null = null;
  private hud: Hud | null = null;
  private loader: ReturnType<typeof loadingScreen> | null = null;
  private current: (() => void) | null = null;
  private overlayThunk: (() => void) | null = null;
  private resumeSpeed = 1;
  private last = performance.now();

  constructor(canvas: HTMLCanvasElement, root: HTMLElement, qualityOverride?: QualityLevel) {
    this.root = root;
    initLang();
    this.settings = loadSettings();
    this.activeQuality = qualityOverride ?? this.settings.quality;
    this.game = new Game(canvas, this.activeQuality);

    const startAudio = (): void => {
      this.game.audio.start();
      this.game.audio.setVolume(this.settings.volume);
      this.game.audio.setMusicVolume(this.settings.music);
    };
    window.addEventListener('pointerdown', startAudio, { once: true });
    window.addEventListener('keydown', startAudio, { once: true });
    root.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest('button, .mcard, .tipcard.click');
      if (el && !(el as HTMLButtonElement).disabled) this.game.audio.ui('click');
    });

    this.game.events.on('loading', ({ fraction, stage }) => this.loader?.set(fraction, stage));
    this.game.events.on('phase', (p) => {
      if (p === 'loading') this.showLoading();
      else if (p === 'menu') {
        this.dropHud();
        this.openMenu();
      } else if (p === 'playing') {
        this.setScreen(null);
        this.current = null;
        this.dropHud();
        this.hud = new Hud(this);
        this.root.append(this.hud.el);
        if (this.game.sim && this.game.sim.timeH < 0.05) this.hud.showTitleCard();
      } else if (p === 'ended') {
        const sim = this.game.sim;
        if (this.overlayOpen) this.closeOverlay();
        if (this.hud) this.hud.el.classList.add('hidden');
        if (sim) this.setScreen(debriefScreen(this, sim));
      }
    });

    const tick = (): void => {
      requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (this.game.phase === 'playing') this.hud?.update(dt);
    };
    tick();
  }

  async start(): Promise<void> {
    this.showLoading();
    this.game.run();
    await this.game.boot('moon');
  }

  /* --------------------------------------------------------- screens */

  private setScreen(el: HTMLElement | null): void {
    this.screen?.remove();
    this.screen = el;
    if (el) this.root.append(el);
  }

  private dropHud(): void {
    this.hud?.dispose();
    this.hud = null;
  }

  private showLoading(): void {
    this.loader = loadingScreen();
    this.current = null;
    this.setScreen(this.loader.el);
  }

  /** Re-create whatever is on screen (after a language or settings change). */
  rerender(): void {
    if (this.overlayOpen && this.overlayThunk) this.overlayThunk();
    else this.current?.();
  }

  private inMission(): boolean {
    return this.game.phase === 'playing';
  }

  openMenu(): void {
    this.current = () => this.setScreen(menuScreen(this));
    this.current();
  }

  openMissions(): void {
    this.current = () => this.setScreen(missionsScreen(this));
    this.current();
  }

  openPlanning(missionId: string): void {
    this.current = () => this.setScreen(planningScreen(this, missionId));
    this.current();
  }

  /** Show a modal: over the mission (pausing it) or as a menu screen. */
  private modal(make: (close: () => void) => HTMLElement): void {
    if (this.inMission()) {
      this.overlayThunk = () => this.showOverlay(make(() => this.openPause()));
      this.overlayThunk();
    } else {
      this.current = () => this.setScreen(make(() => this.openMenu()));
      this.current();
    }
  }

  openCodex(id?: string): void {
    this.modal((close) => codexScreen(this, close, id));
  }

  openHelp(): void {
    this.modal((close) => helpScreen(this, close));
  }

  openSettings(): void {
    this.modal((close) => settingsScreen(this, close));
  }

  openPause(): void {
    if (!this.inMission()) return;
    this.overlayThunk = () => this.showOverlay(pauseScreen(this));
    this.overlayThunk();
  }

  private showOverlay(el: HTMLElement): void {
    const g = this.game;
    if (!this.overlayOpen) {
      this.resumeSpeed = g.speed;
      g.setSpeed(0);
      g.uiBlocking = true;
      g.input.unlock();
    }
    this.overlayOpen?.remove();
    this.overlayOpen = el;
    this.root.append(el);
  }

  closeOverlay(): void {
    if (!this.overlayOpen) return;
    this.overlayOpen.remove();
    this.overlayOpen = null;
    this.overlayThunk = null;
    const g = this.game;
    g.uiBlocking = false;
    if (g.phase === 'playing') g.setSpeed(this.resumeSpeed || 1);
  }

  /* --------------------------------------------------------- actions */

  launch(missionId: string, manifest: Partial<Record<CargoItem, number>>): void {
    this.game.clearSave();
    void this.game.startMission(missionId, { ...manifest });
  }

  continueGame(): void {
    void this.game.continueSaved();
  }

  quit(): void {
    if (this.overlayOpen) {
      this.overlayOpen.remove();
      this.overlayOpen = null;
      this.overlayThunk = null;
      this.game.uiBlocking = false;
    }
    void this.game.quitToMenu();
  }

  setLanguage(l: Lang): void {
    setLang(l);
    if (this.hud && this.game.phase === 'playing') {
      this.dropHud();
      this.hud = new Hud(this);
      this.root.append(this.hud.el);
    }
    this.rerender();
  }

  saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* ignore */
    }
  }

  /** Mineral kinds the player has ever collected (persists across missions). */
  discovered(): string[] {
    try {
      const v = JSON.parse(localStorage.getItem(MINERALS_KEY) ?? '[]');
      return Array.isArray(v) ? (v as string[]) : [];
    } catch {
      return [];
    }
  }

  rememberDiscovery(kind: string): void {
    const list = this.discovered();
    if (list.includes(kind)) return;
    list.push(kind);
    try {
      localStorage.setItem(MINERALS_KEY, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  }
}

export function fatal(root: HTMLElement, message: string): void {
  root.append(h('div.screen.loading', h('div.logo', h('h1', 'HELIOS OUTPOST')), h('div.fact', message)));
}
