import { useId, type CSSProperties } from 'react';
import './fantasy-element-miracle-effects.css';

export interface FantasyEffectPoint { x: number; y: number }
export interface FantasyEffectProps {
  source: FantasyEffectPoint; target: FantasyEffectPoint; tier: number; durationMs: number; seed: string;
}
type ElementKind = 'fire' | 'frost' | 'storm' | 'poison' | 'alchemy' | 'water' | 'earth' | 'wind' | 'star';
type Particle = { a: number; b: number; c: number; d: number };
const boundedTier = (tier: number) => Math.max(1, Math.min(6, Number.isFinite(tier) ? Math.round(tier) : 1));
const duration = (value: number) => Number.isFinite(value) ? Math.max(160, value) : 900;
const vars = (values: Record<string, string | number>) => values as CSSProperties;
const at = (point: FantasyEffectPoint) => `${point.x},${point.y}`;
const star = 'M0,-9 L2.5,-2.5 L9,0 L2.5,2.5 L0,9 L-2.5,2.5 L-9,0 L-2.5,-2.5 Z';
const feather = 'M0,13 Q-12,-5 1,-20 Q13,-10 0,13 M0,9 L1,-14 M0,0 L-5,-5 M1,-6 L6,-11';

function particles(seed: string, count: number): Particle[] {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index++) state = Math.imul(state ^ seed.charCodeAt(index), 16777619);
  const sample = () => {
    state = Math.imul(state ^ state >>> 16, 2246822507);
    state = Math.imul(state ^ state >>> 13, 3266489909);
    state ^= state >>> 16;
    return (state >>> 0) / 4294967296;
  };
  return Array.from({ length: Math.max(0, Math.min(48, count)) }, () => ({ a: sample(), b: sample(), c: sample(), d: sample() }));
}

function EffectDefs({ prefix }: { prefix: string }) {
  return <defs>
    <radialGradient id={`${prefix}-fire`}><stop stopColor="#fffde0" /><stop offset=".25" stopColor="#ffd577" /><stop offset=".65" stopColor="#f47b39" stopOpacity=".7" /><stop offset="1" stopColor="#bd4427" stopOpacity="0" /></radialGradient>
    <linearGradient id={`${prefix}-flame`} x1="0" y1="1" x2=".25" y2="0"><stop stopColor="#f48436" stopOpacity=".15" /><stop offset=".4" stopColor="#ffb65f" /><stop offset=".75" stopColor="#fff4b5" /><stop offset="1" stopColor="#fffbed" stopOpacity=".1" /></linearGradient>
    <linearGradient id={`${prefix}-ice`} x1="0" y1="1" x2="1" y2="0"><stop stopColor="#7b99c2" stopOpacity=".16" /><stop offset=".4" stopColor="#9be3f6" stopOpacity=".75" /><stop offset=".75" stopColor="#f5feff" /><stop offset="1" stopColor="#b4e8ff" stopOpacity=".4" /></linearGradient>
    <linearGradient id={`${prefix}-water`} x1="0" y1="1" x2=".8" y2="0"><stop stopColor="#639da9" stopOpacity=".12" /><stop offset=".45" stopColor="#83cbd8" stopOpacity=".65" /><stop offset=".8" stopColor="#c6eeed" /><stop offset="1" stopColor="#f3fcf4" stopOpacity=".8" /></linearGradient>
    <linearGradient id={`${prefix}-earth`} x1="0" y1="1" x2=".75" y2="0"><stop stopColor="#605e50" /><stop offset=".5" stopColor="#9e957b" /><stop offset="1" stopColor="#d0c7a0" /></linearGradient>
    <linearGradient id={`${prefix}-wind`}><stop stopColor="#b4d9ca" stopOpacity="0" /><stop offset=".4" stopColor="#c6e8db" stopOpacity=".5" /><stop offset=".7" stopColor="#edfff3" stopOpacity=".85" /><stop offset="1" stopColor="#afdbce" stopOpacity="0" /></linearGradient>
    <radialGradient id={`${prefix}-star`}><stop stopColor="#fffce9" /><stop offset=".3" stopColor="#dcd2f5" stopOpacity=".6" /><stop offset="1" stopColor="#9eafdc" stopOpacity="0" /></radialGradient>
    <radialGradient id={`${prefix}-vapor`}><stop stopColor="#dcf1ac" stopOpacity=".45" /><stop offset=".55" stopColor="#99c57e" stopOpacity=".2" /><stop offset="1" stopColor="#547c68" stopOpacity="0" /></radialGradient>
    <linearGradient id={`${prefix}-gold`} x1="0" y1="1" x2=".65" y2="0"><stop stopColor="#b99a58" stopOpacity=".35" /><stop offset=".4" stopColor="#f0d59c" /><stop offset=".75" stopColor="#fffbe1" /><stop offset="1" stopColor="#e2c68d" stopOpacity=".5" /></linearGradient>
    <linearGradient id={`${prefix}-mana`} x1="0" y1="1" x2="1" y2="0"><stop stopColor="#83c7d1" stopOpacity=".2" /><stop offset=".5" stopColor="#a8e1e7" /><stop offset="1" stopColor="#fff9d5" /></linearGradient>
    <linearGradient id={`${prefix}-ruby`}><stop stopColor="#e3b59c" /><stop offset=".5" stopColor="#b95e74" /><stop offset="1" stopColor="#f2c7ad" /></linearGradient>
    <linearGradient id={`${prefix}-pillar`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#f5e8bd" stopOpacity="0" /><stop offset=".4" stopColor="#fff4ce" stopOpacity=".12" /><stop offset=".85" stopColor="#ffefbc" stopOpacity=".5" /><stop offset="1" stopColor="#fff8de" stopOpacity="0" /></linearGradient>
    <linearGradient id={`${prefix}-aurora`}><stop stopColor="#8fc4c3" stopOpacity="0" /><stop offset=".2" stopColor="#b2dcce" stopOpacity=".35" /><stop offset=".5" stopColor="#eee2c0" stopOpacity=".5" /><stop offset=".8" stopColor="#c6bfe5" stopOpacity=".25" /><stop offset="1" stopColor="#b4c7e1" stopOpacity="0" /></linearGradient>
    <radialGradient id={`${prefix}-dawn`}><stop stopColor="#fff9dc" stopOpacity=".12" /><stop offset=".35" stopColor="#f5db9c" stopOpacity=".12" /><stop offset="1" stopColor="#b7d8d7" stopOpacity="0" /></radialGradient>
    <filter id={`${prefix}-glow`} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="2.4" result="soft" /><feMerge><feMergeNode in="soft" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
  </defs>;
}

function Specks({ seed, count, spread, color, kind = 'spark' }: { seed: string; count: number; spread: number; color: string; kind?: 'spark' | 'shard' | 'bubble' | 'ember' | 'droplet' }) {
  return <g className={`fr-em-specks fr-em-specks-${kind}`} fill={color}>{particles(seed, count).map((particle, index) => {
    const angle = particle.a * Math.PI * 2, distance = spread * (.35 + particle.b * .65);
    const endX = Math.cos(angle) * distance, endY = kind === 'ember' || kind === 'bubble' || kind === 'droplet' ? -spread * (.5 + particle.c) : Math.sin(angle) * distance;
    const style = vars({ '--fr-em-dx': `${endX}px`, '--fr-em-dy': `${endY}px`, '--fr-em-turn': `${(particle.d - .5) * 160}deg`, '--fr-em-delay': particle.c * .13 });
    return <g key={index} transform={`translate(${(particle.d - .5) * spread * .3} ${(particle.b - .5) * 14})`}>
      {kind === 'shard' ? <path className="fr-em-speck" d={`M0,-${4 + particle.c * 7} L${2 + particle.d * 3},0 L0,5 L-2,0 Z`} style={style} />
        : kind === 'droplet' ? <path className="fr-em-speck" d="M0,-6 Q-6,1 -2,4 Q0,6 3,3 Q6,0 0,-6 Z" style={style} />
        : <circle className="fr-em-speck" r={kind === 'bubble' ? 3 + particle.d * 5 : 1.5 + particle.d * 2.5} style={style} fill={kind === 'bubble' ? 'none' : undefined} stroke={kind === 'bubble' ? color : undefined} strokeWidth="1.4" />}
    </g>;
  })}</g>;
}

export function FantasyElementEffects({ kind, source, target, tier: requestedTier, durationMs, seed }: FantasyEffectProps & { kind: ElementKind }) {
  const instance = useId().replace(/[^a-zA-Z0-9_-]/g, ''), prefix = `fr-element-${instance}`, tier = boundedTier(requestedTier), scale = .65 + tier * .115;
  const samples = particles(`${seed}-branches`, 5 + tier), travel = `M${at(source)} Q${(source.x + target.x) / 2},${Math.min(source.y, target.y) - 42 - tier * 5} ${at(target)}`;
  const lightning = [source, ...samples.map((sample, index) => {
    const progress = (index + 1) / (samples.length + 1);
    return { x: source.x + (target.x - source.x) * progress + (sample.a - .5) * 43, y: source.y + (target.y - source.y) * progress + (sample.b - .5) * 43 };
  }), target];
  return <g className={`fr-em-effect fr-em-element fr-em-${kind}`} data-tier={tier} style={vars({ '--fr-fx-duration': `${duration(durationMs)}ms` })}>
    <EffectDefs prefix={prefix} />
    {!['storm', 'earth', 'wind', 'star'].includes(kind) && <path className="fr-em-travel" d={travel} fill="none" pathLength="1" />}
    {kind === 'wind' && <g className="fr-em-wind-flight" fill="none" stroke={`url(#${prefix}-wind)`}><path d={`M${at(source)} C${source.x + 55},${source.y - 65} ${target.x - 70},${target.y + 55} ${at(target)}`} strokeWidth="8" pathLength="1" /><path d={`M${source.x},${source.y + 11} C${source.x + 75},${source.y - 40} ${target.x - 45},${target.y + 75} ${target.x + 10},${target.y + 8}`} strokeWidth="2" pathLength="1" /></g>}
    {kind === 'storm' && <g className="fr-em-lightning">
      <path className="fr-em-lightning-halo" d={`M${lightning.map(at).join(' L')}`} />
      <path className="fr-em-lightning-core" d={`M${lightning.map(at).join(' L')}`} pathLength="1" />
      {tier > 1 && lightning.slice(1, -1).filter((_, index) => index % 2 === 0).map((point, index) => <path key={index} className="fr-em-lightning-branch" d={`M${at(point)} l${(index % 2 ? -1 : 1) * (15 + tier * 5)},-18 l-10,-18 l17,-21`} pathLength="1" />)}
    </g>}
    {kind === 'alchemy' && <g className="fr-em-flight-object">
      <animateMotion dur={`${duration(durationMs) * .3}ms`} path={travel} fill="freeze" />
      <g className="fr-em-flask-spin"><path d="M-6,-20 L6,-20 L6,-8 Q25,13 10,21 L-10,21 Q-25,13 -6,-8 Z" fill={`url(#${prefix}-mana)`} stroke="#eaf7ee" strokeWidth="2" /><path d="M-7,-20 L7,-20 M-9,7 Q0,1 13,8 M-11,10 L-9,14" fill="none" stroke="#f7f4d1" strokeWidth="2.5" /><path d="M-7,-24 L7,-24 L7,-19 L-7,-19 Z" fill="#b69d6c" /></g>
    </g>}
    <g transform={`translate(${target.x} ${target.y}) scale(${scale})`}>
      {kind === 'water' && <>
        <g className="fr-em-water-ripples" fill="none" stroke="#b8e4e5" strokeWidth="1.7">{Array.from({ length: 2 + Math.ceil(tier / 2) }, (_, index) => <ellipse key={index} cy="20" rx={37 + index * 15} ry={12 + index * 6} className="fr-em-water-ripple" style={vars({ '--fr-em-delay': index * .04 })} />)}</g>
        <g className="fr-em-water-crest" fill={`url(#${prefix}-water)`}><path d="M-72,22 C-62,-19 -35,-38 -10,-18 C9,-2 19,-12 11,-29 C39,-28 46,-2 27,12 C45,18 60,4 71,-12 Q75,15 54,28 Q-10,46 -72,22 Z" /><path d="M-54,13 Q-31,-20 -11,-7 T20,-3 M-37,25 Q-5,5 21,20 T60,18" fill="none" stroke="#e3f7ee" strokeWidth="2.2" /></g>
        <Specks seed={seed} count={7 + tier * 5} spread={55 + tier * 10} color="#b7e2e7" kind="droplet" />
        {tier >= 3 && <path className="fr-em-water-surge" d="M-88,10 C-62,-18 -59,-47 -30,-47 Q-45,-15 -12,-3 M31,8 Q72,-48 90,-22" fill="none" stroke={`url(#${prefix}-water)`} strokeWidth="5" />}
      </>}
      {kind === 'earth' && <>
        <g className="fr-em-earth-cracks" fill="none" stroke="#8c8268" strokeWidth="2">{Array.from({ length: 3 + tier }, (_, index) => <path key={index} transform={`rotate(${index * 360 / (3 + tier)})`} d="M8,0 L25,-8 L36,3 L55,-5 L74,4 M36,3 L39,17 L55,26" pathLength="1" />)}</g>
        <g fill={`url(#${prefix}-earth)`} stroke="#d9d0ac" strokeWidth="1.2">{Array.from({ length: 2 + tier }, (_, index) => <g key={index} transform={`translate(${(index - (1 + tier) / 2) * 19} ${Math.abs(index - (1 + tier) / 2) * 5})`}><g className="fr-em-earth-spire" style={vars({ '--fr-em-delay': index * .018 })}><path d={`M-14,24 L-17,-12 L-5,${-32 - index % 3 * 13} L11,-24 L18,12 L7,27 Z`} /><path d={`M-5,${-32 - index % 3 * 13} L-2,8 L7,27 M-2,8 L18,12`} fill="none" stroke="#ede0b4" opacity=".6" /></g></g>)}</g>
        <ellipse className="fr-em-earth-dust" cy="21" rx="72" ry="22" fill="#b5a47d33" />
        <Specks seed={seed} count={6 + tier * 4} spread={60 + tier * 10} color="#b8ab89" kind="shard" />
      </>}
      {kind === 'wind' && <>
        <g className="fr-em-wind-vortex" fill="none" stroke={`url(#${prefix}-wind)`} strokeWidth="3.5"><path d="M-71,23 C-18,56 75,24 66,-9 C59,-39 -33,-38 -48,-8 C-63,21 35,29 39,2 C41,-15 -14,-18 -18,-1" /><path d="M-58,35 C-6,59 73,36 77,6 M-58,-22 C-9,-56 64,-33 56,-3" strokeWidth="1.7" /></g>
        <g className="fr-em-wind-blades" fill={`url(#${prefix}-wind)`}>{Array.from({ length: 2 + tier }, (_, index) => <g key={index} transform={`rotate(${index * 360 / (2 + tier)})`}><path className="fr-em-wind-blade" d="M-12,-29 Q31,-79 66,-44 Q31,-60 -12,-29 Z" style={vars({ '--fr-em-delay': index * .016 })} /></g>)}</g>
        <Specks seed={seed} count={6 + tier * 4} spread={64 + tier * 10} color="#cde9d9" />
      </>}
      {kind === 'star' && <>
        <circle className="fr-em-star-aura" r="65" fill={`url(#${prefix}-star)`} />
        <g className="fr-em-constellation" fill="#f1e9ff" stroke="#c6c9ef" strokeWidth="1.2">{particles(`${seed}-constellation`, 3 + tier).map((particle, index, points) => {
          const angle = index * Math.PI * 2 / points.length, radius = 40 + particle.a * 27;
          const nextAngle = (index + 1) * Math.PI * 2 / points.length, nextRadius = 40 + points[(index + 1) % points.length].a * 27;
          return <g key={index}><path d={`M${Math.cos(angle) * radius},${Math.sin(angle) * radius} L${Math.cos(nextAngle) * nextRadius},${Math.sin(nextAngle) * nextRadius}`} fill="none" pathLength="1" /><circle cx={Math.cos(angle) * radius} cy={Math.sin(angle) * radius} r={2.2 + particle.b * 1.5} /></g>;
        })}</g>
        <g className="fr-em-star-strike" fill="#fff5d9" stroke="#bfc5ef" strokeWidth=".6"><path d={star} transform="scale(2.4)" /><path d="M0,-112 Q20,-52 0,-16 M-8,-102 Q4,-59 -6,-36" fill="none" strokeWidth="1.7" /></g>
        <g fill="#e3dcf5">{particles(seed, 7 + tier * 4).map((particle, index) => <circle key={index} className="fr-em-star-mote" r={1.3 + particle.d * 1.8} style={vars({ '--fr-em-dx': `${(particle.a - .5) * 180}px`, '--fr-em-dy': `${-45 - particle.b * 125}px`, '--fr-em-delay': particle.c * .14 })} />)}</g>
      </>}
      {kind === 'fire' && <>
        <circle className="fr-em-ground-bloom" r={49 + tier * 3} fill={`url(#${prefix}-fire)`} />
        <g className="fr-em-flames" fill={`url(#${prefix}-flame)`}>{Array.from({ length: 2 + tier }, (_, index) => <g key={index} transform={`translate(${(index - (1 + tier) / 2) * 15} ${Math.abs(index - (1 + tier) / 2) * 5}) scale(${.65 + (index % 3) * .15})`}><path className="fr-em-flame" style={vars({ '--fr-em-delay': index * .018 })} d="M0,26 C-38,12 -31,-13 -16,-29 Q-18,-8 -7,-10 C-18,-37 10,-52 6,-76 Q38,-45 24,-20 C47,-25 38,12 0,26 Z" /><path className="fr-em-flame-core" d="M0,22 Q-17,0 0,-29 Q20,-7 0,22" fill="#fff4c5" /></g>)}</g>
        <Specks seed={seed} count={8 + tier * 5} spread={75 + tier * 12} color="#ffca7b" kind="ember" />
        {tier >= 4 && <ellipse className="fr-em-pressure-ring" rx="79" ry="29" cy="13" fill="none" stroke="#f7cc8a" strokeWidth="2" />}
      </>}
      {kind === 'frost' && <>
        <ellipse className="fr-em-frost-ground" rx="67" ry="28" cy="18" fill="#b8e9f222" stroke="#c1edf5" strokeWidth="1.5" />
        <g fill={`url(#${prefix}-ice)`} stroke="#e2faff" strokeWidth="1.4">{Array.from({ length: 2 + tier }, (_, index) => <g key={index} transform={`translate(${(index - (1 + tier) / 2) * 17} ${Math.abs(index - (1 + tier) / 2) * 5}) rotate(${(index - (1 + tier) / 2) * 11})`}><g className="fr-em-ice-spear" style={vars({ '--fr-em-delay': index * .018 })}><path d={`M0,23 L-9,-18 L0,${-47 - (index % 3) * 14} L9,-18 Z`} /><path d={`M0,23 L0,${-47 - (index % 3) * 14} M-9,-18 L0,-10 L9,-18`} fill="none" strokeWidth=".8" /></g></g>)}</g>
        <Specks seed={seed} count={8 + tier * 5} spread={62 + tier * 12} color="#c5f5ff" kind="shard" />
        {tier >= 3 && <g className="fr-em-frost-sigil" stroke="#c4e4ff" fill="none">{Array.from({ length: 6 }, (_, index) => <path key={index} transform={`rotate(${index * 60})`} d="M0,-38 L0,-67 M-7,-55 L0,-48 L7,-55" />)}</g>}
      </>}
      {kind === 'storm' && <>
        <g className="fr-em-storm-arcs" fill="none" stroke="#e0dcff" strokeWidth="2.2">{Array.from({ length: 3 + tier }, (_, index) => <path key={index} transform={`rotate(${index * 360 / (3 + tier)})`} d={`M16,-5 L30,-12 L26,-23 L${47 + tier * 3},-13 L42,-35`} />)}<ellipse rx="58" ry="24" strokeDasharray="19 11 8 15" /><ellipse rx="72" ry="36" stroke="#a7b7ea" strokeDasharray="8 19" /></g>
        <circle className="fr-em-storm-heart" r="16" fill="#f4f2ff" opacity=".7" />
        <Specks seed={seed} count={6 + tier * 4} spread={50 + tier * 10} color="#d9d7ff" />
      </>}
      {kind === 'poison' && <>
        <g className="fr-em-vapor">{Array.from({ length: 3 + tier }, (_, index) => <ellipse key={index} cx={Math.cos(index * 2.4) * (15 + tier * 3)} cy={-8 - index * 4} rx={35 + index * 2} ry={30 + index * 3} fill={`url(#${prefix}-vapor)`} style={vars({ '--fr-em-delay': index * .022 })} />)}</g>
        <ellipse className="fr-em-poison-pool" rx="56" ry="19" cy="17" fill="#829f6340" stroke="#c5d99b" strokeWidth="1" strokeDasharray="12 5" />
        <Specks seed={seed} count={6 + tier * 5} spread={65 + tier * 9} color="#d5e8a6" kind="bubble" />
        {tier >= 3 && <path className="fr-em-vapor-curl" d="M-35,-10 C-70,-40 9,-29 -8,-65 C-20,-84 10,-89 17,-70 M18,4 C65,-20 20,-41 45,-58" fill="none" stroke="#b9d6a4" strokeWidth="2" />}
      </>}
      {kind === 'alchemy' && <>
        <g className="fr-em-reaction" fill="none" stroke="#b4ded1" strokeWidth="1.7"><ellipse rx="58" ry="29" cy="10" /><ellipse rx="73" ry="38" cy="10" strokeDasharray="6 11" /><path d="M0,-48 L42,-24 L42,24 L0,48 L-42,24 L-42,-24 Z" />{Array.from({ length: tier + 2 }, (_, index) => <g key={index} transform={`rotate(${index * 360 / (tier + 2)})`}><path d="M0,-32 L0,-61" /><circle cy="-66" r="5" fill="#e9f2d0" /></g>)}</g>
        <g className="fr-em-alchemy-mix"><ellipse cy="5" rx="38" ry="22" fill="#a2d8ca30" /><path d="M-32,4 Q-9,-25 16,-2 T38,7 M-24,12 Q4,36 30,7" fill="none" stroke="#dfd7ed" strokeWidth="4" /></g>
        <Specks seed={`${seed}-glass`} count={4 + tier * 2} spread={57 + tier * 6} color="#dbedf2" kind="shard" />
        <Specks seed={`${seed}-reaction`} count={5 + tier * 3} spread={61 + tier * 9} color="#c4e4bd" kind="bubble" />
      </>}
    </g>
  </g>;
}

function TetherLights({ prefix, seed, source, target, durationMs, count = 8, ruby = false }: { prefix: string; seed: string; source: FantasyEffectPoint; target: FantasyEffectPoint; durationMs: number; count?: number; ruby?: boolean }) {
  const curve = `M${at(source)} Q${(source.x + target.x) / 2},${Math.min(source.y, target.y) - 65} ${at(target)}`;
  return <g className="fr-em-tether-lights">
    <path className="fr-em-tether" d={curve} fill="none" stroke={`url(#${prefix}-${ruby ? 'ruby' : 'mana'})`} strokeWidth="2" pathLength="1" />
    {particles(seed, count).map((particle, index) => <g key={index} className="fr-em-thread-light" style={vars({ '--fr-em-delay': particle.a * .18 })}><animateMotion dur={`${duration(durationMs) * .58}ms`} begin={`${duration(durationMs) * particle.a * .16}ms`} path={curve} fill="freeze" /><circle r={1.7 + particle.c * 2} fill={ruby ? '#f3c0b3' : '#f8efc8'} /></g>)}
  </g>;
}

function LastDawn({ prefix, tier, seed }: { prefix: string; tier: number; seed: string }) {
  const feathers = particles(seed, 10 + tier * 4);
  return <g className="fr-em-last-dawn">
    <ellipse className="fr-em-dawn-atmosphere" cx="500" cy="395" rx="620" ry="470" fill={`url(#${prefix}-dawn)`} />
    <g transform="translate(500 390)"><g className="fr-em-dawn-rays" fill={`url(#${prefix}-pillar)`}>{Array.from({ length: 12 + tier }, (_, index) => <path key={index} transform={`rotate(${index * 360 / (12 + tier)})`} d={`M-2,25 L${-11 - tier * 2},-620 L${11 + tier * 2},-620 L2,25 Z`} />)}</g></g>
    <g className="fr-em-aurora" fill="none" stroke={`url(#${prefix}-aurora)`} strokeLinecap="round"><path d="M-100,240 C130,-40 370,380 570,100 S970,160 1120,-40" strokeWidth="48" /><path d="M-100,315 C140,40 390,415 625,185 S995,250 1120,50" strokeWidth="23" /><path d="M-100,75 C220,310 405,-90 660,165 S940,-10 1100,180" strokeWidth="13" /></g>
    <g className="fr-em-field-pillars">{Array.from({ length: Math.min(20, 8 + tier * 2) }, (_, index) => {
      const x = 80 + index % 5 * 210, y = 200 + Math.floor(index / 5) * 190;
      return <g key={index} transform={`translate(${x} ${y})`}><g className="fr-em-dawn-pillar" style={vars({ '--fr-em-delay': (index % 5) * .018 + Math.floor(index / 5) * .025 })}>
        <path d="M-28,-530 L-14,-16 Q0,10 14,-16 L28,-530 Z" fill={`url(#${prefix}-pillar)`} /><path d="M-4,-480 L-2,0 L2,0 L4,-480 Z" fill={`url(#${prefix}-pillar)`} opacity=".65" />
        <ellipse rx="39" ry="14" fill="none" stroke="#f5e5b3" strokeWidth="1.5" opacity=".65" /><ellipse rx="27" ry="9" fill="none" stroke="#fff6d7" strokeWidth=".8" />
      </g></g>;
    })}</g>
    <g transform="translate(500 400) rotate(-8)"><g className="fr-em-celestial-ring" fill="none" stroke={`url(#${prefix}-gold)`}>
      <ellipse rx="365" ry="205" strokeWidth="2" /><ellipse rx="352" ry="194" strokeWidth=".8" /><ellipse rx="382" ry="214" strokeDasharray="2 21" strokeWidth="3" />
      {Array.from({ length: 12 }, (_, index) => {
        const angle = index * Math.PI / 6;
        return <g key={index} transform={`translate(${Math.cos(angle) * 365} ${Math.sin(angle) * 205}) rotate(${index * 30})`}><path d={star} fill="#fff4d1" strokeWidth=".6" /><path d="M0,-17 L0,-26 M0,17 L0,26" strokeWidth="1" /></g>;
      })}
    </g></g>
    <g transform="translate(500 390)" className="fr-em-dawn-sun" fill="none" stroke="#f9e9b9"><path d="M-60,8 A60,60 0 0 1 60,8 M-45,8 A45,45 0 0 1 45,8 M-83,8 L83,8" strokeWidth="2" /><path d="M0,-70 L0,-84 M-48,-49 L-59,-61 M48,-49 L59,-61" strokeWidth="1.5" /></g>
    <g className="fr-em-dawn-feathers" stroke="#fff4d1" strokeWidth="1.3" fill="#f9e6b34d">{feathers.map((particle, index) => <g key={index} transform={`translate(${35 + particle.a * 930} ${150 + particle.b * 620}) rotate(${(particle.c - .5) * 70}) scale(${.45 + particle.d * .7})`}><path className="fr-em-feather" d={feather} style={vars({ '--fr-em-dx': `${(particle.c - .5) * 100}px`, '--fr-em-dy': `${-100 - particle.d * 130}px`, '--fr-em-turn': `${(particle.a - .5) * 70}deg`, '--fr-em-delay': particle.c * .18 })} /></g>)}</g>
  </g>;
}

export function FantasyMiracleEffects({ id, source, target, tier: requestedTier, durationMs, seed }: FantasyEffectProps & { id: string }) {
  const instance = useId().replace(/[^a-zA-Z0-9_-]/g, ''), prefix = `fr-miracle-${instance}`, tier = boundedTier(requestedTier), scale = .75 + tier * .075;
  const lastDawn = id === 'miracle-last-dawn', awakening = id === 'miracle-last-dawn-awakening';
  const variant = lastDawn ? 'last-dawn' : awakening ? 'awakening' : id.startsWith('priest-') ? 'priest-light' : id.replace(/^miracle-/, '');
  return <g className={`fr-em-effect fr-em-miracle fr-em-${variant}`} data-tier={tier} style={vars({ '--fr-fx-duration': `${duration(durationMs)}ms` })}>
    <EffectDefs prefix={prefix} />
    {lastDawn ? <LastDawn prefix={prefix} tier={tier} seed={seed} /> : <>
      {['soul-anchor', 'return-lantern', 'unfailing-cup'].includes(variant) && <TetherLights prefix={prefix} seed={seed} source={source} target={target} durationMs={durationMs} count={4 + tier * 2} />}
      {variant === 'burden-wounds' && <TetherLights prefix={prefix} seed={seed} source={target} target={source} durationMs={durationMs} count={4 + tier * 2} ruby />}
      {variant === 'soul-anchor' && <g transform={`translate(${target.x} ${target.y}) scale(${scale})`}>
        <g className="fr-em-anchor-aegis" fill="none" stroke={`url(#${prefix}-mana)`} strokeWidth="2"><path d="M0,-60 Q54,-50 44,12 Q40,46 0,63 Q-40,46 -44,12 Q-54,-50 0,-60 Z" /><ellipse cy="25" rx="53" ry="19" strokeDasharray="3 9" /></g>
        <g className="fr-em-soul-anchor" fill="none" stroke={`url(#${prefix}-gold)`} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><circle cy="-36" r="10" /><path d="M0,-25 L0,38 M-15,-9 L15,-9 M-34,4 Q-33,31 0,42 Q33,31 34,4 M-34,4 L-22,12 M-34,4 L-39,17 M34,4 L22,12 M34,4 L39,17" /></g>
        <Specks seed={`${seed}-soul`} count={5 + tier * 2} spread={68} color="#d8edf1" />
      </g>}
      {variant === 'sacred-severance' && <g transform={`translate(${target.x} ${target.y}) scale(${scale})`}>
        <g className="fr-em-cleaving-seal" fill="none" stroke={`url(#${prefix}-gold)`}><circle r="54" strokeWidth="1" strokeDasharray="15 6 2 6" /><path d="M-42,24 L0,-48 L42,24 Z" strokeWidth="1.3" /></g>
        <g className="fr-em-broken-chains" fill="none" stroke="#d9caaa" strokeWidth="4">{Array.from({ length: 4 }, (_, index) => <g key={index} transform={`rotate(${index * 90 + 25}) translate(43 0)`}><g className="fr-em-chain-half" style={vars({ '--fr-em-dx': '18px', '--fr-em-dy': '-24px', '--fr-em-turn': '26deg' })}><path d="M-8,-13 L-8,-24 Q0,-34 8,-24 L8,-14" /></g><g className="fr-em-chain-half" style={vars({ '--fr-em-dx': '11px', '--fr-em-dy': '26px', '--fr-em-turn': '-32deg' })}><path d="M-7,15 L-7,28 Q0,36 7,28 L7,15" /></g></g>)}</g>
        <g className="fr-em-sacred-cleave"><path d="M-72,78 L59,-88 L76,-100 L70,-77 L-63,84 Z" fill={`url(#${prefix}-gold)`} /><path d="M-77,82 L73,-101" fill="none" stroke="#fffbe8" strokeWidth="2" /></g>
        <Specks seed={seed} count={6 + tier * 3} spread={73 + tier * 5} color="#eee0b6" kind="shard" />
      </g>}
      {variant === 'return-lantern' && <g transform={`translate(${target.x} ${target.y}) scale(${scale})`}>
        <g className="fr-em-lantern-portal" fill="none" stroke={`url(#${prefix}-mana)`}><ellipse rx="48" ry="70" strokeWidth="2.4" /><ellipse rx="41" ry="62" strokeWidth=".8" strokeDasharray="3 11" /><path d="M-54,65 Q0,90 54,65" strokeWidth="1.2" /></g>
        <g className="fr-em-lantern-body" stroke={`url(#${prefix}-gold)`} strokeWidth="2.5" strokeLinejoin="round"><path d="M-20,-27 L0,-43 L20,-27 L15,20 L0,32 L-15,20 Z" fill="#c3d9cc24" /><path d="M-20,-27 L20,-27 M-15,20 L15,20 M0,-43 L0,-52 Q12,-60 15,-49" fill="none" /><path d="M0,15 C-16,8 -7,-8 0,-18 C10,-5 15,9 0,15 Z" fill={`url(#${prefix}-gold)`} stroke="none" /><path d="M-19,34 L19,34" /></g>
        <Specks seed={`${seed}-lantern`} count={6 + tier * 3} spread={68 + tier * 4} color="#e8e5c0" kind="ember" />
      </g>}
      {variant === 'divide-calamity' && <>
        <path className="fr-em-calamity-approach" d={`M${at(source)} L${target.x - 37},${target.y}`} fill="none" stroke="#c4b9a6" strokeWidth="7" pathLength="1" />
        <g transform={`translate(${target.x} ${target.y}) scale(${scale})`}>
          <g className="fr-em-split-waves" fill="none" stroke={`url(#${prefix}-mana)`} strokeWidth="4"><path d="M-120,0 C-70,0 -56,-48 -8,-51 S60,-40 94,-65" pathLength="1" /><path d="M-120,0 C-70,0 -56,48 -8,51 S60,40 94,65" pathLength="1" /></g>
          <path className="fr-em-protected-tile" d="M0,28 L52,46 L0,65 L-52,46 Z" fill="#b1d2cb24" stroke="#b9d8cf" strokeWidth="1.4" />
          <g className="fr-em-calamity-shield" stroke={`url(#${prefix}-gold)`} strokeWidth="2.5"><path d="M0,-40 L29,-24 L24,12 Q15,31 0,40 Q-15,31 -24,12 L-29,-24 Z" fill="#e5e9d52b" /><path d="M0,-28 L18,-18 L15,8 L0,24 L-15,8 L-18,-18 Z" fill="none" strokeWidth="1" /></g>
          <Specks seed={seed} count={5 + tier * 2} spread={76} color="#d6e8e1" />
        </g>
      </>}
      {variant === 'burden-wounds' && <>
        <g transform={`translate(${source.x} ${source.y})`} className="fr-em-burden-receiver" fill="none" stroke={`url(#${prefix}-ruby)`} strokeWidth="2"><path d="M-28,-20 L-12,17 M-12,-29 L3,14 M8,-26 L23,11" /><ellipse cy="22" rx="35" ry="12" strokeWidth="1" /></g>
        <g transform={`translate(${target.x} ${target.y}) scale(${scale})`}>
          <g className="fr-em-wounds-close" fill="none" stroke="#ba7e81" strokeWidth="3"><path d="M-26,-18 L-9,22 M-7,-25 L9,17 M12,-20 L29,18" /></g>
          <g className="fr-em-mending-thread" fill="none" stroke={`url(#${prefix}-gold)`} strokeWidth="2" pathLength="1"><path d="M-35,-10 L-17,-17 L-29,1 L-11,-6 L-22,13 L-3,5 M-14,-20 L3,-26 L-8,-8 L10,-14 L0,5 L18,-2 M8,-14 L25,-20 L14,-1 L32,-8 L21,11 L39,4" /><ellipse rx="47" ry="22" cy="17" strokeWidth="1" /></g>
          <Specks seed={seed} count={4 + tier * 2} spread={58} color="#efd8be" />
        </g>
      </>}
      {variant === 'unfailing-cup' && <g transform={`translate(${target.x} ${target.y}) scale(${scale})`}>
        <g className="fr-em-cup-streams" fill="none" stroke={`url(#${prefix}-mana)`} strokeWidth="2">{Array.from({ length: 2 + tier }, (_, index) => <path key={index} d={`M0,0 C${(index % 2 ? -1 : 1) * (20 + index * 8)},-20 ${(index % 2 ? -1 : 1) * (24 + index * 9)},-70 ${(index % 2 ? -1 : 1) * (12 + index * 12)},-100`} />)}</g>
        <g className="fr-em-unfailing-cup" stroke={`url(#${prefix}-gold)`} strokeWidth="2.7" strokeLinejoin="round"><path d="M-30,-23 L30,-23 Q28,16 0,23 Q-28,16 -30,-23 Z" fill="#d0e7e42e" /><path d="M0,23 L0,44 M-18,45 L18,45 M-30,-19 Q0,-8 30,-19 M-36,-18 Q-53,5 -21,12 M36,-18 Q53,5 21,12" fill="none" /><ellipse cy="-23" rx="30" ry="8" fill={`url(#${prefix}-mana)`} strokeWidth="1.3" /></g>
        <Specks seed={seed} count={6 + tier * 3} spread={65 + tier * 6} color="#c9edf0" kind="bubble" />
      </g>}
      {(variant === 'rekindle' || variant.includes('rekindle')) && <g transform={`translate(${target.x} ${target.y}) scale(${scale})`}>
        <ellipse className="fr-em-rekindle-nest" cy="25" rx="43" ry="16" fill="none" stroke="#e4c08f" strokeWidth="1.2" />
        <g className="fr-em-phoenix" fill={`url(#${prefix}-gold)`} stroke="#f8e3b8" strokeWidth="1"><path d="M0,13 Q-8,-5 -15,-13 Q-48,-6 -73,-45 Q-42,-29 -25,-38 Q-13,-40 -4,-19 L0,-34 L6,-20 Q17,-43 31,-35 Q51,-30 75,-48 Q53,-10 16,-12 Q8,6 0,13 Z" /><path d="M-8,7 Q-22,34 -34,47 Q-10,36 0,20 Q11,40 32,46 Q18,24 8,7" /><path d="M-7,-27 L0,-37 L11,-30 L5,-24 Z" /></g>
        <path className="fr-em-life-flame" d="M0,22 Q-22,3 -4,-18 Q0,-3 8,-30 Q30,7 0,22 Z" fill={`url(#${prefix}-flame)`} />
        <Specks seed={seed} count={6 + tier * 3} spread={73 + tier * 4} color="#f4d89e" kind="ember" />
      </g>}
      {awakening && <g transform={`translate(${target.x} ${target.y})`}>
        <g className="fr-em-promise-halo" fill="none" stroke={`url(#${prefix}-gold)`}><ellipse cy="-30" rx="33" ry="12" strokeWidth="2" /><path d="M-40,23 Q0,42 40,23 M-18,-34 Q0,-47 18,-34" strokeWidth="1" /></g>
        <g transform="translate(0 -48) scale(.65)" fill="#fff0c5"><path className="fr-em-promise-star" d={star} /></g>
        <Specks seed={seed} count={4 + tier} spread={40} color="#f3dfae" kind="ember" />
      </g>}
      {!awakening && !['soul-anchor', 'sacred-severance', 'return-lantern', 'divide-calamity', 'burden-wounds', 'unfailing-cup'].includes(variant) && !variant.includes('rekindle') && <g transform={`translate(${target.x} ${target.y}) scale(${scale})`}>
        <g className="fr-em-priest-rays" stroke={`url(#${prefix}-gold)`} fill="none" strokeWidth="1.8">{Array.from({ length: 4 + tier }, (_, index) => <path key={index} transform={`rotate(${index * 360 / (4 + tier)})`} d="M0,-22 L0,-47 M-3,-40 L0,-47 L3,-40" />)}<circle r="15" strokeWidth="1.2" /><path d="M-33,18 Q0,39 33,18" strokeWidth="1" /></g>
        <Specks seed={seed} count={5 + tier * 2} spread={62} color="#f0dfb8" />
      </g>}
    </>}
  </g>;
}
