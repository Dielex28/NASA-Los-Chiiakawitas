import * as THREE from 'three';
import { Astronaut } from '../entities/astronaut';
import type { Kit } from '../entities/kit';
import { MODULES } from '../sim/catalog';
import type { CrewMember, ModuleState, SimState } from '../sim/types';
import { WORLDS } from '../sim/worlds';
import type { World } from '../world/world';

/** Stripe colour of each speciality (matches the portraits in the HUD). */
const STRIPE: Record<CrewMember['role'], number> = {
  commander: 0xe8552b,
  engineer: 0x2f8fd6,
  botanist: 0x3fae6a,
  geologist: 0xc98a4a,
  medic: 0xd9534f,
  pilot: 0x8e6fd6,
};

const WALK = 1.15;

interface Walker {
  crewId: number;
  astro: Astronaut;
  x: number;
  z: number;
  yaw: number;
  target: { x: number; z: number; id: number } | null;
  /** Seconds left working at the target. */
  work: number;
  /** Seconds left indoors before going out again. */
  rest: number;
}

/**
 * Two members of the crew working outside: they walk to whatever needs hands — a module to
 * assemble, a broken one, a dusty panel — work there a while, then move on. They go indoors
 * at night, during a solar storm and when ordered to shelter, which is what a real crew would do.
 */
export class Crewmates {
  readonly group = new THREE.Group();
  private walkers: Walker[] = [];
  private ids = '';

  constructor(private kit: Kit) {
    this.group.name = 'crewmates';
  }

  clear(): void {
    for (const w of this.walkers) this.group.remove(w.astro.group);
    this.walkers = [];
    this.ids = '';
  }

  private ensure(sim: SimState): void {
    const team = sim.crew.filter((c) => !c.isPlayer).slice(0, 2);
    const ids = team.map((c) => c.id).join(',');
    if (ids === this.ids) return;
    this.clear();
    this.ids = ids;
    team.forEach((c, i) => {
      const parts = c.name.split(' ');
      const tag = `${parts[0][0]}. ${parts.slice(1).join(' ').toUpperCase()}`;
      const astro = new Astronaut(this.kit, { tag, accent: this.kit.paint(STRIPE[c.role]) });
      astro.group.visible = false;
      this.group.add(astro.group);
      this.walkers.push({ crewId: c.id, astro, x: 4 + i * 2, z: 6, yaw: 0, target: null, work: 0, rest: 3 + i * 7 });
    });
  }

  /** Something that needs a pair of hands, preferring what nobody else is already doing. */
  private pickJob(sim: SimState, taken: Set<number>, rand: number): ModuleState | null {
    const jobs = sim.modules.filter((m) => m.type !== 'pylon' && (m.built < 1 || m.condition < 85 || (m.type === 'solar' && m.dust > 0.2)));
    const free = jobs.filter((m) => !taken.has(m.id));
    const list = free.length ? free : jobs;
    if (list.length) return list[Math.floor(rand * list.length) % list.length];
    // nothing broken: walk an inspection round
    const built = sim.modules.filter((m) => m.built >= 1 && m.type !== 'pylon' && !taken.has(m.id));
    return built.length && rand < 0.6 ? built[Math.floor(rand * 7919) % built.length] : null;
  }

  update(dt: number, sim: SimState | null, world: World, colliders: Array<[number, number, number]>, darkness: number, time: number): void {
    if (!sim) {
      for (const w of this.walkers) w.astro.group.visible = false;
      return;
    }
    this.ensure(sim);
    const outsideOk = !sim.shelterOrder && sim.env.speMsvH < 0.05 && darkness < 0.75 && !sim.outcome;
    const taken = new Set(this.walkers.map((w) => w.target?.id ?? -1));
    const g = WORLDS[sim.world].gravity;
    const lander = sim.modules[0];
    for (const w of this.walkers) {
      const c = sim.crew.find((x) => x.id === w.crewId);
      const a = w.astro;
      if (!c || c.health < 40 || !outsideOk) {
        // back inside through the lander's hatch
        a.group.visible = false;
        w.target = null;
        w.rest = Math.max(w.rest, 4);
        w.x = lander.x + 3.5;
        w.z = lander.z + 4;
        continue;
      }
      if (w.rest > 0) {
        w.rest -= dt;
        a.group.visible = false;
        continue;
      }
      a.group.visible = true;
      let speed = 0;
      let working = 0;
      if (!w.target) {
        const m = this.pickJob(sim, taken, Math.abs(Math.sin(time * 12.9898 + w.crewId * 78.233)) % 1);
        if (!m) {
          w.rest = 20;
          continue;
        }
        // stand at the edge of the module, on the side we are coming from
        const r = MODULES[m.type].radius * 0.75 + 1.4;
        const ang = Math.atan2(w.x - m.x, w.z - m.z);
        w.target = { x: m.x + Math.sin(ang) * r, z: m.z + Math.cos(ang) * r, id: m.id };
        taken.add(m.id);
      }
      const t = w.target;
      const dx = t.x - w.x;
      const dz = t.z - w.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.4) {
        speed = WALK;
        const step = Math.min(d, WALK * dt);
        w.x += (dx / d) * step;
        w.z += (dz / d) * step;
        w.yaw = Math.atan2(dx, dz);
        // step around anything in the way
        for (const [cx, cz, cr] of colliders) {
          const ox = w.x - cx;
          const oz = w.z - cz;
          const rr = cr + 0.5;
          const o2 = ox * ox + oz * oz;
          if (o2 < rr * rr && o2 > 1e-6) {
            const o = Math.sqrt(o2);
            w.x = cx + (ox / o) * rr;
            w.z = cz + (oz / o) * rr;
          }
        }
        w.work = 9 + (w.crewId % 3) * 3;
      } else {
        const m = sim.modules.find((x) => x.id === t.id);
        if (m) w.yaw = Math.atan2(m.x - w.x, m.z - w.z);
        working = 1;
        w.work -= dt;
        if (w.work <= 0) w.target = null;
      }
      a.group.position.set(w.x, world.ground(w.x, w.z), w.z);
      a.group.rotation.y = w.yaw;
      a.animate(dt, speed, true, 0, g, 0, working, darkness, time);
    }
  }
}
