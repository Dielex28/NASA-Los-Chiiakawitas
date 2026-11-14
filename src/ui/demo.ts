import { DEMO_MISSION } from '../sim/missions';
import type { App } from './app';
import { h } from './dom';
import { t } from './strings';
import { speak } from './voice';

/**
 * Demo mode: the game plays itself for about three minutes — cargo, construction, a walk outside,
 * a solar storm, an emergency and the debrief — with captions, for judges, fairs or a projector
 * while someone talks. Any key, click or touch hands control back to a person.
 */
export class Demo {
  private t = 0;
  private stage = 0;
  private evaAt = -1;
  private caption = h('div.demo-caption', h('span.tag', t('demo.tag')), h('p', ''), h('small', t('demo.skip')));
  private stopped = false;
  private readonly onInput = (e: Event): void => {
    // only a person's input stops it
    if (!e.isTrusted) return;
    this.stop(true);
  };

  constructor(
    private readonly app: App,
    /** Start again from the menu after the debrief (attract mode for a stand). */
    private readonly loop = false,
  ) {}

  start(): void {
    const g = this.app.game;
    this.app.root.append(this.caption);
    window.addEventListener('keydown', this.onInput, true);
    window.addEventListener('pointerdown', this.onInput, true);
    this.say('demo.1');
    void g.startMission(DEMO_MISSION.id, { ...DEMO_MISSION.recommended }, 2);
  }

  private say(key: string): void {
    const p = this.caption.querySelector('p');
    if (p) p.textContent = t(key);
    this.caption.classList.remove('flash');
    void this.caption.offsetWidth;
    this.caption.classList.add('flash');
    speak(t(key));
  }

  /** Called every frame by the app. */
  update(dt: number): void {
    if (this.stopped) return;
    const g = this.app.game;
    const s = g.sim;
    this.t += dt;
    if (g.phase === 'ended') {
      if (this.stage < 9) {
        this.stage = 9;
        this.t = 0;
        this.say('demo.7');
      } else if (this.t > 18) {
        this.stop(false);
        this.app.quit();
        if (this.loop) setTimeout(() => this.app.startDemo(true), 1500);
      }
      return;
    }
    if (g.phase !== 'playing' || !s || g.introPlaying) return;
    if (g.mode === 'command') g.demoOrbit(dt, 150);
    switch (this.stage) {
      case 0:
        // the base goes up: modules set out, time runs fast while the crew assembles them
        g.demoDeploy();
        g.setSpeed(3);
        this.say('demo.2');
        this.stage = 1;
        this.t = 0;
        break;
      case 1:
        if (g.demoBuild(dt, 1.4) && this.t > 12) {
          g.enterEva();
          this.say('demo.3');
          const hab = s.modules.find((m) => m.type === 'hab') ?? s.modules[0];
          g.demoTarget = { x: hab.x + 30, z: hab.z - 40 };
          this.evaAt = this.t;
          this.stage = 2;
        }
        break;
      case 2:
        if (this.t - this.evaAt > 9 && this.t - this.evaAt < 9.2) g.scan();
        if (this.t - this.evaAt > 16) {
          g.demoRelease();
          g.exitEva();
          g.setSpeed(3);
          this.stage = 3;
        }
        break;
      case 3: {
        const spe = s.schedule.find((e) => e.kind === 'spe' && e.warned && !e.ended);
        if (spe) {
          this.say('demo.4');
          g.orderShelter(true);
          this.stage = 4;
        }
        break;
      }
      case 4:
        if (!s.schedule.some((e) => e.kind === 'spe' && !e.ended)) {
          g.orderShelter(false);
          this.stage = 5;
        }
        break;
      case 5:
        if (s.emergency && !s.emergency.choice) {
          g.setSpeed(1);
          this.say('demo.5');
          this.t = 0;
          this.stage = 6;
        }
        break;
      case 6:
        if (this.t > 5 && s.emergency && !s.emergency.choice) {
          g.decideEmergency('patch');
          g.setSpeed(3);
          this.say('demo.6');
          this.stage = 7;
        }
        break;
      default:
        break;
    }
  }

  /** Hand control back (a person touched something) or wind the demo down. */
  stop(byPerson: boolean): void {
    if (this.stopped) return;
    this.stopped = true;
    window.removeEventListener('keydown', this.onInput, true);
    window.removeEventListener('pointerdown', this.onInput, true);
    this.app.game.demoRelease();
    this.caption.remove();
    this.app.demoEnded();
    if (byPerson && this.app.game.phase === 'playing') this.app.game.setSpeed(1);
  }
}
