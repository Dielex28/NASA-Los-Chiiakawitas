import type { CrewMember } from '../sim/types';

interface Look {
  skin: string;
  hair: string;
  style: 'short' | 'long' | 'bun' | 'curly' | 'crop' | 'bald';
}

/** One look per member of the roster, in roster order (see CREW_ROSTER in src/sim/sim.ts). */
const LOOKS: Look[] = [
  { skin: '#c68a5e', hair: '#1f1a17', style: 'bun' },
  { skin: '#7a4a2c', hair: '#151210', style: 'crop' },
  { skin: '#f0cdb1', hair: '#d9b77c', style: 'long' },
  { skin: '#b07850', hair: '#2a211c', style: 'short' },
  { skin: '#a8714c', hair: '#120f0d', style: 'curly' },
  { skin: '#9c6644', hair: '#0f0c0a', style: 'bald' },
];

/** Suit collar colour by speciality. */
export const ROLE_COLOR: Record<CrewMember['role'], string> = {
  commander: '#f2a93b',
  engineer: '#5bc8e8',
  botanist: '#7bd88f',
  geologist: '#e0a36b',
  medic: '#ff8a80',
  pilot: '#c9a6ff',
};

/**
 * A small flat portrait: face, hair, and a suit collar in the colour of the person's speciality.
 * Drawn as SVG so it stays sharp at any size and needs no image files.
 */
export function avatarSvg(c: Pick<CrewMember, 'id' | 'role'>, size = 40): string {
  const look = LOOKS[(c.id - 1) % LOOKS.length];
  const collar = ROLE_COLOR[c.role];
  const back = {
    short: '',
    long: `<path d="M9 19c0-8 4-13 11-13s11 5 11 13v12h-4V20H13v11H9z" fill="${look.hair}"/>`,
    bun: `<circle cx="20" cy="6.5" r="4" fill="${look.hair}"/>`,
    curly: `<circle cx="11" cy="15" r="4.5" fill="${look.hair}"/><circle cx="29" cy="15" r="4.5" fill="${look.hair}"/>`,
    crop: '',
    bald: '',
  }[look.style];
  const top = {
    short: `<path d="M11 18c0-7 4-10.5 9-10.5s9 3.5 9 10.5c-2-3-5-4.5-9-4.5s-7 1.5-9 4.5z" fill="${look.hair}"/>`,
    long: `<path d="M11 18c0-7 4-10.5 9-10.5s9 3.5 9 10.5c-3-4-6-5-9-5s-6 1-9 5z" fill="${look.hair}"/>`,
    bun: `<path d="M11 17.5c0-6.5 4-10 9-10s9 3.5 9 10c-2.5-3.5-5.5-4.5-9-4.5s-6.5 1-9 4.5z" fill="${look.hair}"/>`,
    curly: `<circle cx="14" cy="11" r="4" fill="${look.hair}"/><circle cx="20" cy="9" r="4.5" fill="${look.hair}"/><circle cx="26" cy="11" r="4" fill="${look.hair}"/>`,
    crop: `<path d="M11.5 16.5c0.5-6 4-8.5 8.5-8.5s8 2.5 8.5 8.5c-2.5-2-5-2.8-8.5-2.8s-6 0.8-8.5 2.8z" fill="${look.hair}"/>`,
    bald: '',
  }[look.style];
  return `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true">
<rect width="40" height="40" fill="#141920"/>
${back}
<path d="M6 40c1-7 6-10 14-10s13 3 14 10z" fill="#d9d7d1"/>
<path d="M13 31.5c2 2 4.5 3 7 3s5-1 7-3" stroke="${collar}" stroke-width="2.4" fill="none"/>
<rect x="17" y="24" width="6" height="6" fill="${look.skin}"/>
<ellipse cx="20" cy="18.5" rx="8.2" ry="9.3" fill="${look.skin}"/>
${top}
<circle cx="17" cy="19" r="1" fill="#1a1512"/><circle cx="23" cy="19" r="1" fill="#1a1512"/>
<path d="M17.5 23.2c1.6 1.2 3.4 1.2 5 0" stroke="#1a1512" stroke-width="0.9" fill="none" stroke-linecap="round"/>
</svg>`;
}
