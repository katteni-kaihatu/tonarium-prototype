import type { CSSProperties, ReactNode } from 'react';
import { FANTASY_TERRAIN_PALETTES, type FantasyTerrainFrame, type FantasyTerrainMood } from './fantasy-terrain-theme.ts';
import './fantasy-terrain-ambience.css';

const LEAF = 'M0 12C-13 7-12-4 0-14C13-4 13 7 0 12ZM0 12V-8';
const MAPLE = 'M0 14 1 5 10 8 8 2 16-3 8-5 10-12 4-9 0-18-4-9-10-12-8-5-16-3-8 2-10 8-1 5-1 14Z';
const BRANCHES = 'M8 352C27 288 8 248 34 192C47 151 29 108 10 76M26 260C55 233 73 205 76 164M32 209C70 178 86 143 113 130M34 176C15 148 9 121-3 113M28 125C53 95 56 68 51 35M75 174C100 170 121 156 137 139M85 156C84 125 94 99 106 85M17 305C45 292 58 271 62 250M51 96C80 83 89 60 91 43';
const TREE_LEAVES = [[15, 77, -45], [49, 43, -18], [83, 57, 40], [51, 98, 60], [106, 89, 14], [127, 141, 70], [91, 143, -20], [73, 182, -55], [47, 225, 35]];
const PARTICLE_POSITIONS = [3, 94, 7, 89, 2, 97, 11, 85, 5, 92, 15, 82, 1, 98, 9, 87, 4, 96];
const ART_COLORS: Record<FantasyTerrainMood['terrain'], readonly [number, number, number, number]> = {
  city: [4, 3, 2, 1], forest: [1, 0, 2, 4], mountain: [4, 3, 0, 2],
  cave: [8, 5, 1, 3], ruin: [0, 1, 2, 3], coast: [0, 1, 2, 4],
  swamp: [0, 4, 3, 2], desert: [0, 5, 3, 9], volcano: [0, 3, 2, 4],
  island: [3, 2, 1, 0], tower: [0, 4, 3, 2], snow: [6, 5, 0, 3], sea: [0, 1, 3, 2],
};

function EdgeArt({ children, className = '', viewBox = '0 0 160 360' }: { children: ReactNode; className?: string; viewBox?: string }) {
  return <svg className={`fr-terrain-ambience__art ${className}`} viewBox={viewBox} preserveAspectRatio="none" fill="none" focusable="false">{children}</svg>;
}

function Trees({ mood }: { mood: FantasyTerrainMood }) {
  const winter = mood.season === 'winter';
  const autumn = mood.season === 'autumn';
  return <>{['left', 'right'].map(side => <EdgeArt key={side} className={`fr-terrain-ambience__tree fr-terrain-ambience__${side}`}>
    <g data-motif={winter ? 'bare-branches' : 'branches'} stroke="var(--fta-ink)" strokeLinecap="round" strokeLinejoin="round">
      <path d={BRANCHES} strokeWidth="3.5"/>
      <path d="M10 350C26 306 20 281 25 253M33 191 38 176M34 191 27 180M76 166 69 155M113 130 121 118M51 37 43 27M106 87 117 79" strokeWidth="1.4"/>
    </g>
    {!winter && <g data-motif={autumn ? 'maple' : 'leaf'} fill={autumn ? 'var(--fta-warm)' : 'var(--fta-leaf)'} stroke="var(--fta-ink)" strokeWidth=".45">{TREE_LEAVES.map(([x, y, rotation], i) => <path key={i} d={autumn ? MAPLE : LEAF} transform={`translate(${x} ${y}) rotate(${rotation}) scale(${autumn ? .73 : 1.04})`} opacity={.55 + i % 3 * .14}/>)}</g>}
    {winter && <g data-motif="settled-snow" stroke="var(--fta-snow)" strokeLinecap="round" strokeWidth="4"><path d="M38 185Q57 175 67 162M78 168 96 162M50 94 64 85M18 299 34 289M103 138 115 130"/></g>}
  </EdgeArt>)}</>;
}

function Waves({ island = false }: { island?: boolean }) {
  return <EdgeArt className={`fr-terrain-ambience__bottom fr-terrain-ambience__water ${island ? 'fr-terrain-ambience__island-water' : ''}`} viewBox="0 0 1000 100">
    <g data-motif="waves" className="fr-terrain-ambience__waves" stroke="var(--fta-light)" strokeWidth="1.3">
      <path d="M-60 55C30 24 91 85 180 55S332 25 420 55 572 85 660 55 812 25 900 55 1052 85 1140 55"/>
      <path d="M-100 72C-10 42 51 102 140 72S292 42 380 72 532 102 620 72 772 42 860 72 1012 102 1100 72" opacity=".52"/>
      <path d="M-60 91C30 65 91 117 180 91S332 65 420 91 572 117 660 91 812 65 900 91 1052 117 1140 91" opacity=".28"/>
    </g>
    <path d="M0 87Q85 55 165 89M835 89Q920 60 1000 87" stroke="var(--fta-ink)" opacity=".55"/>
  </EdgeArt>;
}

function Snow({ mood }: { mood: FantasyTerrainMood }) {
  const thin = mood.season === 'summer';
  return <><EdgeArt className="fr-terrain-ambience__bottom fr-terrain-ambience__snowbank" viewBox="0 0 1000 100">
    <g data-snow-cover={thin ? 'thin' : 'deep'} fill="var(--fta-snow)" opacity={thin ? .25 : .65}>
      <path d={thin ? 'M0 96Q38 82 96 96L146 100H0ZM860 100Q950 81 1000 91V100Z' : 'M0 74Q45 44 98 76T206 98L250 100H0ZM760 100Q850 92 905 64T1000 73V100Z'}/>
    </g>
    <path d="M0 93Q63 64 128 94M875 96Q955 73 1000 88" stroke="var(--fta-light)"/>
  </EdgeArt>{['left', 'right'].map(side => <EdgeArt key={side} className={`fr-terrain-ambience__frost fr-terrain-ambience__${side}`} viewBox="0 0 160 100">
    <g data-motif="frost" stroke="var(--fta-light)" strokeWidth=".8" opacity={thin ? .32 : .75}><path d="M0 5 71 5M9 4 12 40 18 5M36 5 39 25 45 5M62 5 66 53 72 5M91 5 94 24 100 5M0 64 14 52 7 82M4 72 25 73M10 62 9 48"/></g>
  </EdgeArt>)}</>;
}

function TerrainArt({ mood }: { mood: FantasyTerrainMood }) {
  const { terrain } = mood;
  if (terrain === 'forest') return <Trees mood={mood}/>;
  if (terrain === 'sea' || terrain === 'coast') return <Waves/>;
  if (terrain === 'snow') return <Snow mood={mood}/>;
  if (terrain === 'island') return <><Waves island/>{['left', 'right'].map(side => <EdgeArt key={side} className={`fr-terrain-ambience__palm fr-terrain-ambience__${side}`}>
    <g data-motif="palms" stroke="var(--fta-ink)" strokeLinecap="round"><path d="M12 360Q37 284 27 231" strokeWidth="5"/><path d="M27 234Q-1 216-20 243M27 234Q4 190-16 202M27 234Q34 191 65 197M27 234Q68 203 87 227M27 234Q61 230 76 254" strokeWidth="3"/><path d="M28 234 66 211M27 234 48 200M27 234 6 208M27 234 58 239" stroke="var(--fta-leaf)" strokeWidth="4"/></g>
  </EdgeArt>)}</>;
  if (terrain === 'desert') return <EdgeArt className="fr-terrain-ambience__bottom fr-terrain-ambience__dunes" viewBox="0 0 1000 130"><g data-motif="dunes"><path d="M0 50Q75 13 167 89T360 130H0ZM630 130Q817 111 902 54T1000 53V130Z" fill="var(--fta-leaf)" opacity=".22"/><path d="M0 50Q75 13 167 89M756 111Q847 96 902 54T1000 53M0 91Q68 57 122 95M877 124Q949 71 1000 91" stroke="var(--fta-light)" strokeWidth="1.3"/></g></EdgeArt>;
  if (terrain === 'mountain' || terrain === 'volcano') return <EdgeArt className="fr-terrain-ambience__bottom fr-terrain-ambience__ridge" viewBox="0 0 1000 150"><g data-motif={terrain === 'volcano' ? 'volcanic-ridge' : 'mountain-ridge'} stroke="var(--fta-ink)" strokeLinejoin="round"><path d="M0 148V71L42 29 68 75 101 64 162 140M847 147 898 61 930 74 962 17 1000 79V150" fill="var(--fta-leaf)" fillOpacity=".16"/><path d="M8 77 41 37 57 67 69 79M899 70 930 83 960 27 976 57" stroke="var(--fta-light)"/><path d="M43 38 30 119M963 24 947 135" opacity=".35"/></g></EdgeArt>;
  if (terrain === 'cave') return <>{['left', 'right'].map(side => <EdgeArt key={side} className={`fr-terrain-ambience__stone fr-terrain-ambience__${side}`}><g data-motif="cave-crystals" stroke="var(--fta-light)" strokeWidth=".8" fill="var(--fta-leaf)" fillOpacity=".12"><path d="M0 0H91L78 42 68 12 42 20 32 82 22 29 9 36 0 100ZM0 360 14 295 25 307 42 269 55 314 71 295 85 360Z"/><path d="M14 295 22 359M42 269 42 359M71 295 62 360M32 82 30 22M78 42 76 9" opacity=".6"/></g></EdgeArt>)}</>;
  if (terrain === 'swamp') return <>{['left', 'right'].map(side => <EdgeArt key={side} className={`fr-terrain-ambience__reeds fr-terrain-ambience__${side}`}><g data-motif="reeds" stroke="var(--fta-ink)" strokeWidth="1.5" strokeLinecap="round"><path d="M20 360Q34 319 28 270M20 360Q10 314-4 302M20 360Q46 319 63 312M45 360Q56 301 49 242M52 351Q76 317 87 310M5 359Q11 339 2 326"/><path d="M28 271 27 257M49 244 47 230" stroke="var(--fta-leaf)" strokeWidth="5"/></g></EdgeArt>)}<div data-motif="marsh-mist" className="fr-terrain-ambience__mist"/></>;
  if (terrain === 'ruin') return <>{['left', 'right'].map(side => <EdgeArt key={side} className={`fr-terrain-ambience__ruins fr-terrain-ambience__${side}`}><g data-motif="broken-arch" stroke="var(--fta-ink)" strokeWidth="1.1" strokeLinejoin="round" fill="var(--fta-leaf)" fillOpacity=".1"><path d="M0 360V148Q0 98 44 87L53 104 37 110Q17 120 17 151V360ZM61 88 78 102 68 114 53 104ZM0 313H20M0 261H17M0 206H17M0 161H17M8 122 26 132M0 360 35 343 53 360M73 360 87 345 97 360"/></g></EdgeArt>)}</>;
  if (terrain === 'tower') return <>{['left', 'right'].map(side => <EdgeArt key={side} className={`fr-terrain-ambience__tower fr-terrain-ambience__${side}`}><g data-motif="tower-runes" stroke="var(--fta-light)" strokeWidth=".8"><path d="M8 0V360M15 0V360M12 42 27 61 12 80M12 140 29 158 12 176M12 243 28 261 12 279M38 62H49M44 56V68M38 159H49M44 153V165M38 261H49M44 255V267"/><circle cx="12" cy="61" r="25"/><circle cx="12" cy="158" r="25"/><circle cx="12" cy="261" r="25"/></g></EdgeArt>)}</>;
  return <>{['left', 'right'].map(side => <EdgeArt key={side} className={`fr-terrain-ambience__town fr-terrain-ambience__${side}`}><g data-motif="town-architecture" stroke="var(--fta-ink)" strokeWidth="1" opacity=".65"><path d="M0 357H65M9 357V268L30 248 51 268V357M4 269H56M20 357V321Q30 308 40 321V357M24 284V299H36V284ZM10 307H51M30 249V232M17 240H43M0 346H9M51 346H72"/></g></EdgeArt>)}</>;
}

function Particles({ mood }: { mood: FantasyTerrainMood }) {
  const underground = mood.terrain === 'cave' || mood.terrain === 'tower';
  const leafy = mood.terrain === 'forest' && mood.season !== 'winter';
  const naturalSnow = (mood.terrain === 'forest' && mood.season === 'winter') || (mood.terrain === 'snow' && mood.season !== 'summer');
  const precipitation = !underground && (mood.weather === 'rain' || mood.weather === 'snow') ? mood.weather : naturalSnow ? 'snow' : null;
  const ambient = leafy ? mood.season === 'autumn' ? 'maple' : 'leaf' : mood.terrain === 'desert' ? 'sand' : mood.terrain === 'volcano' ? 'ember' : null;
  const kinds = [...Array.from({ length: ambient ? 8 : 0 }, () => ambient!), ...Array.from({ length: precipitation ? mood.terrain === 'city' ? 4 : 8 : 0 }, () => precipitation!)];
  return <div className="fr-terrain-ambience__particles">{kinds.map((kind, index) => <span key={`${kind}-${index}`} data-particle={kind} className={`fr-terrain-ambience__particle fr-terrain-ambience__particle--${kind}`} style={{ left: `${PARTICLE_POSITIONS[index]}%`, top: `${(index * 29 + 7) % 88}%`, '--fta-delay': `${-index * 2.7}s`, '--fta-duration': `${kind === 'rain' ? 3.4 + index % 3 : 15 + index % 5 * 2}s`, '--fta-turn': `${index * 49}deg` } as CSSProperties}>
    {(kind === 'leaf' || kind === 'maple') && <svg viewBox="-18 -20 36 40" fill="currentColor" focusable="false"><path d={kind === 'maple' ? MAPLE : LEAF}/></svg>}
  </span>)}</div>;
}

function Scene({ mood, opacity }: { mood: FantasyTerrainMood; opacity: number }) {
  const colors = FANTASY_TERRAIN_PALETTES[mood.terrain].colors;
  const [ink, leaf, light, warm] = ART_COLORS[mood.terrain].map(index => colors[index] ?? colors[0]);
  const style = { opacity, '--fta-ink': ink, '--fta-leaf': leaf, '--fta-light': light, '--fta-warm': warm, '--fta-snow': `color-mix(in srgb, ${light} 18%, white)` } as CSSProperties;
  return <div className="fr-terrain-ambience__scene" data-terrain={mood.terrain} data-season={mood.season} data-night={mood.night} data-weather-muted={mood.terrain === 'city' || undefined} style={style}><TerrainArt mood={mood}/><Particles mood={mood}/></div>;
}

export function FantasyTerrainAmbience({ frame }: { frame: FantasyTerrainFrame }) {
  const progress = Number.isFinite(frame.progress) ? Math.max(0, Math.min(1, frame.progress)) : 1;
  const scenes = new Map<string, { mood: FantasyTerrainMood; opacity: number }>();
  for (const [mood, opacity] of [[frame.from, 1 - progress], [frame.to, progress]] as const) {
    const key = `${mood.location}:${mood.terrain}:${mood.season}:${mood.weather}:${mood.night}`;
    const previous = scenes.get(key);
    scenes.set(key, { mood, opacity: opacity + (previous?.opacity ?? 0) });
  }
  return <div className="fr-terrain-ambience" aria-hidden="true" style={{ pointerEvents: 'none' }}>{[...scenes].map(([key, scene]) => <Scene key={key} mood={scene.mood} opacity={scene.opacity}/>)}</div>;
}
