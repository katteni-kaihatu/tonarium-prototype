import type { CSSProperties } from 'react';
import type { FantasyUltimateAnimation } from '../../../shared/fantasy-ultimate-skills.ts';
import './fantasy-ultimate-effects.css';

type Point = { x: number; y: number };
type Vars = CSSProperties & Record<`--fue-${string}`, string | number>;
export interface FantasyUltimateEffectsProps {
  id: string;
  ultimate: FantasyUltimateAnimation;
  source: Point;
  target: Point;
  tier: number;
  durationMs: number;
  seed: string | number;
}

function Star({ x = 0, y = 0, r = 12 }: { x?: number; y?: number; r?: number }) {
  return <path className="fue-star" d={`M${x},${y - r} L${x + r * .24},${y - r * .24} L${x + r},${y} L${x + r * .24},${y + r * .24} L${x},${y + r} L${x - r * .24},${y + r * .24} L${x - r},${y} L${x - r * .24},${y - r * .24} Z`} />;
}

function Sigil({ job }: { job: string }) {
  switch (job) {
    case 'adventurer': return <>
      <path className="fue-bold" d="M-61,39 L-61,-17 Q0,-94 61,-17 L61,39 M-46,38 L-16,3 L8,27 L30,-7 L57,38" />
      <path d="M-32,54 Q-54,14 -19,-11 Q15,-33 27,-62 M18,-56 L27,-62 L30,-51" strokeDasharray="4 7" />
      <path className="fue-fill" d="M-7,-37 L0,-62 L7,-37 L4,-8 L12,-2 L-12,-2 L-4,-8 Z" /><Star x={49} y={-45} r={10} />
    </>;
    case 'warrior': return <>
      <path className="fue-bold fue-fill" d="M-10,-64 L0,-82 L10,-64 L6,15 L24,25 L20,34 L5,29 L5,56 L-5,56 L-5,29 L-20,34 L-24,25 L-6,15 Z" />
      <path d="M0,-64 L0,13 M-49,-45 Q-100,10 -44,60 M-62,-61 Q-116,8 -62,80 M-44,-48 L-56,-20 L-45,-12 M39,-42 L64,-20 L51,1 L70,22 L41,57" />
      <path className="fue-heavy" d="M-54,62 L-29,47 M50,-55 L34,-36 M64,33 L46,27" />
    </>;
    case 'knight': return <>
      <path className="fue-bold fue-fill" d="M0,-55 L43,-37 L38,16 Q26,48 0,64 Q-26,48 -38,16 L-43,-37 Z" />
      <path d="M0,-41 L29,-28 L26,14 L0,46 L-26,14 L-29,-28 Z M0,-34 L0,32 M-22,-4 L22,-4 M-61,50 L-61,-59 L-68,-41 L-54,-41 L-61,-59 M61,50 L61,-59 L54,-41 L68,-41 L61,-59" />
      <path d="M-45,-13 L-76,-24 L-67,-5 L-78,7 L-46,14 M45,-13 L76,-24 L67,-5 L78,7 L46,14 M-18,-69 L-12,-58 L0,-74 L12,-58 L18,-69" />
    </>;
    case 'spearfighter': return <>
      <path className="fue-bold" d="M0,73 L0,-77 M-15,-57 L0,-80 L15,-57 M-25,-51 Q-35,-74 -41,-55 L-33,-29 L0,-15 L33,-29 L41,-55 Q35,-74 25,-51" />
      <path d="M-8,56 Q-68,37 -40,9 Q-4,-19 39,-1 Q70,16 44,39 Q25,50 14,28 M-40,9 L-56,-4 L-39,-9 M39,-1 L57,-9 L54,6 M41,39 L59,45 L53,28 M-7,-35 L7,-35 M-7,-27 L7,-27" />
      <path className="fue-fill" d="M-4,-61 L0,-75 L4,-61 L0,-48 Z" />
    </>;
    case 'pugilist': return <>
      <path className="fue-bold fue-fill" d="M-36,14 L-41,-19 Q-42,-31 -30,-31 L-23,-11 L-25,-46 Q-22,-57 -12,-48 L-7,-17 L-7,-54 Q0,-63 7,-53 L9,-19 L15,-45 Q23,-53 28,-42 L24,-9 L34,-24 Q46,-27 45,-13 L31,27 L14,42 L-16,42 Z" />
      <path d="M-29,15 L17,15 M-13,24 L17,24 M-18,43 L-22,57 L19,57 L18,40 M-72,65 L-41,31 L-24,51 M25,55 L44,27 L76,65 M-68,-12 L-49,-5 M54,-7 L71,-20" />
    </>;
    case 'shieldbearer': return <>
      <path className="fue-bold fue-fill" d="M0,-75 L63,-37 L63,38 L0,76 L-63,38 L-63,-37 Z" />
      <path d="M-44,40 L-44,-19 L-29,-19 L-29,-37 L-13,-37 L-13,-19 L13,-19 L13,-37 L29,-37 L29,-19 L44,-19 L44,40 M-44,3 L44,3 M-30,3 L-30,40 M0,3 L0,40 M30,3 L30,40 M-44,24 L44,24" />
      <path className="fue-heavy" d="M-81,-18 L-81,40 M81,-18 L81,40 M-42,-61 L-59,-71 M42,-61 L59,-71" />
    </>;
    case 'archer': return <>
      <path className="fue-bold" d="M-3,-67 Q62,0 -3,67 M-3,-67 L17,0 L-3,67 M-64,0 L60,0 M43,-13 L63,0 L43,13" />
      <path d="M-9,-39 Q-39,-73 -78,-59 L-57,-44 L-74,-39 L-48,-27 L-62,-19 L-16,-12 M-9,39 Q-39,73 -78,59 L-57,44 L-74,39 L-48,27 L-62,19 L-16,12 M-58,-8 L-46,0 L-58,8 M-43,-8 L-31,0 L-43,8" />
      <Star x={37} y={-52} r={9} /><Star x={37} y={52} r={9} />
    </>;
    case 'hunter': return <>
      <path className="fue-bold" d="M-59,0 Q0,-55 59,0 Q0,46 -59,0 Z M-27,-23 L-9,-45 L2,-28 L17,-49 L37,-15" />
      <circle r="15" /><path d="M0,-69 L0,-41 M0,37 L0,69 M-72,0 L-45,0 M45,0 L72,0 M-46,45 Q0,79 46,45 L35,40 L31,55 L18,48 L10,63 L0,54 L-10,63 L-18,48 L-31,55 L-35,40 Z" /><circle r="5" className="fue-solid" />
    </>;
    case 'ranger': return <>
      <path className="fue-bold" d="M0,68 L0,-25 M0,-13 Q-54,-20 -50,-68 M-38,-28 L-63,-36 L-68,-53 M-48,-49 L-27,-62 L-27,-77 M0,-13 Q54,-20 50,-68 M38,-28 L63,-36 L68,-53 M48,-49 L27,-62 L27,-77 M-32,54 Q0,5 32,54 L0,68 Z" />
      <path d="M-14,16 Q-48,-5 -54,23 Q-27,37 -14,16 Z M14,16 Q48,-5 54,23 Q27,37 14,16 Z M-40,48 Q0,-15 40,48 M-40,48 L0,31 L40,48 M-13,40 L0,31 L13,40" />
    </>;
    case 'scout': return <>
      <path className="fue-bold fue-fill" d="M0,-73 L12,-16 L62,0 L12,16 L0,73 L-12,16 L-62,0 L-12,-16 Z M0,-46 L0,46 M-42,0 L42,0" />
      <path d="M-67,-42 Q-26,-69 34,-42 Q82,-26 57,-7 M-71,36 Q-19,63 38,34 Q69,20 78,36 M-39,-43 L-48,-67 M39,44 L49,66 M-80,-4 L-70,7 L-60,-4" />
      <circle r="24" strokeDasharray="3 9" />
    </>;
    case 'spellblade': return <>
      <path className="fue-bold fue-fill" d="M-7,-61 L0,-79 L7,-61 L5,24 L23,30 L21,37 L5,33 L5,58 L-5,58 L-5,33 L-21,37 L-23,30 L-5,24 Z" />
      <ellipse rx="67" ry="25" transform="rotate(-29)" /><ellipse rx="67" ry="25" transform="rotate(29)" />
      <Star x={-52} y={-30} /><Star x={50} y={-32} r={9} /><Star x={39} y={46} r={10} /><path d="M0,-63 L0,18" />
    </>;
    case 'mage': return <>
      <path className="fue-bold" d="M-59,-39 L-6,-68 L56,-30 L66,27 L8,66 L-53,30 Z M-59,-39 L8,66 L56,-30 L-53,30 L-6,-68 L66,27 Z" />
      {[[ -59, -39], [-6, -68], [56, -30], [66, 27], [8, 66], [-53, 30]].map(([x, y], index) => <circle key={index} cx={x} cy={y} r={5} className="fue-solid" />)}
      <Star r={28} /><path d="M-9,-92 L15,-119 M7,-86 L32,-114 M-29,-83 L-12,-102" />
    </>;
    case 'summoner': return <>
      <path className="fue-bold" d="M-66,49 L-66,-35 Q-39,-74 -12,-35 L-12,49 Z M12,49 L12,-35 Q39,-74 66,-35 L66,49 Z M-52,35 L-52,-29 Q-39,-49 -26,-29 L-26,35 M26,35 L26,-29 Q39,-49 52,-29 L52,35" />
      <path d="M-36,60 L0,78 L36,60 M-36,-69 L0,-87 L36,-69 M-21,-1 L0,-14 L21,-1 L21,22 L0,35 L-21,22 Z M-21,-1 L0,35 L21,-1 M-80,-14 L-74,-21 L-80,-28 M80,-14 L74,-21 L80,-28" />
    </>;
    case 'bard': return <>
      <path className="fue-bold" d="M-39,-54 Q-58,-21 -29,5 L-19,47 Q0,63 19,47 L29,5 Q58,-21 39,-54 M-39,-54 Q-21,-35 0,-51 Q21,-35 39,-54 M-24,-30 L-15,40 M-9,-35 L-5,44 M9,-35 L5,44 M24,-30 L15,40" />
      <path d="M-80,-1 Q-60,17 -75,35 M-91,-12 Q-57,17 -87,47 M75,-2 Q57,18 74,36 M88,-15 Q56,17 87,48 M-38,65 L38,65 M-43,73 L43,73" />
      <Star x={0} y={-76} r={12} />
    </>;
    case 'leader': return <>
      <path className="fue-bold fue-fill" d="M-28,-52 L-23,-75 L-8,-61 L0,-85 L8,-61 L23,-75 L28,-52 Z M-22,-45 L22,-45" />
      <path className="fue-bold" d="M0,-37 L0,69 M-49,62 L-49,-51 L-14,-35 L-49,-20 M49,62 L49,-51 L14,-35 L49,-20 M-11,68 L11,68" />
      <path d="M-28,39 L-28,14 L-11,21 L-28,28 M28,39 L28,14 L11,21 L28,28 M-64,69 L-64,30 L-56,35 M64,69 L64,30 L56,35 M-9,-5 L0,4 L9,-5" />
    </>;
    case 'thief': return <>
      <path className="fue-bold fue-fill" d="M-57,-62 L-17,-12 L-28,-9 L-41,-24 Z M57,-62 L17,-12 L28,-9 L41,-24 Z M-34,-11 L-7,10 M34,-11 L7,10 M-22,9 L-38,28 M22,9 L38,28" />
      <path className="fue-bold" d="M-12,36 A20,20 0 1 1 12,36 L20,65 L-20,65 Z" /><circle cx="0" cy="21" r="6" />
      <path d="M-69,-16 Q-90,18 -57,53 M69,-16 Q90,18 57,53 M-63,39 L-57,53 L-73,51 M63,39 L57,53 L73,51" strokeDasharray="6 7" />
    </>;
    case 'assassin': return <>
      <path className="fue-bold fue-fill" d="M24,-74 Q-62,-43 -35,28 Q-16,64 25,69 Q-69,80 -77,1 Q-75,-58 24,-74 Z" />
      <path className="fue-bold" d="M-21,52 L39,-59 L22,-9 L52,-22 L-21,52 Z M-33,26 L1,48 M-7,34 L-20,63" />
      <path d="M44,35 L63,9 L71,44 Z M38,49 L60,58 M51,-64 L69,-42 M29,-83 L38,-89" /><circle cx="53" cy="-7" r="4" className="fue-solid" />
    </>;
    case 'bandit': return <>
      <path className="fue-bold" d="M-36,65 L30,-66 M19,-50 Q50,-77 73,-39 L45,-13 Q26,-25 11,-25 M22,-40 L53,-23" />
      <path className="fue-bold fue-fill" d="M-72,55 L-43,12 L-18,33 L-2,7 L26,56 L12,53 L-2,32 L-12,51 L-23,46 L-29,62 Z" />
      <path d="M-45,-48 L-68,-28 L-51,-11 L-67,4 M-38,35 L-26,23 M23,66 L48,77 M49,40 L71,47" />
    </>;
    case 'smuggler': return <>
      <circle cy="-51" r="12" /><path className="fue-bold" d="M0,-38 L0,43 M-25,-20 L25,-20 M-43,5 Q-40,53 0,62 Q40,53 43,5 M-53,17 L-43,5 L-31,16 M31,16 L43,5 L53,17" />
      <path d="M-76,62 Q-47,42 -25,67 Q0,86 24,65 Q50,43 77,62 M-79,-34 Q-95,-74 -44,-74 L34,-74 Q78,-73 78,-36 L78,26" strokeDasharray="4 8" />
      <path d="M69,18 L78,26 L85,15 M-63,-45 L-51,-56 L-39,-45 Z" />
    </>;
    case 'spy': return <>
      <path className="fue-bold" d="M-68,-7 Q0,-63 68,-7 Q0,45 -68,-7 Z M-26,-63 L-37,-47 M31,-64 L41,-47" />
      <path d="M0,-31 L24,-7 L0,17 L-24,-7 Z M-60,43 L-47,34 L-34,43 M-28,58 L-15,44 L-2,58 M8,41 L19,30 L30,41 M40,59 L54,43 L67,59 M-69,-37 L-56,-49 M63,18 L76,28" />
      <circle cy="-7" r="7" className="fue-solid" /><path d="M-64,73 L-40,73 M-27,73 L-20,73 M-6,73 L14,73 M28,73 L34,73 M46,73 L70,73" />
    </>;
    case 'crimeboss': return <>
      <path className="fue-bold fue-fill" d="M-37,-36 L-44,-67 L-18,-50 L0,-77 L18,-50 L44,-67 L37,-36 Z M-31,-27 L31,-27" />
      <path d="M-65,8 L0,-15 L65,8 L44,63 L-44,63 Z M-65,8 L44,63 M65,8 L-44,63 M0,-15 L0,70 M-44,63 L0,30 L44,63 M-65,8 L0,30 L65,8" />
      {[-1, 1].map(sign => <g key={sign} transform={`translate(${sign * 72} -40) rotate(${sign * 22})`}><rect x="-7" y="-18" width="14" height="24" rx="7" /><rect x="-7" y="1" width="14" height="24" rx="7" /></g>)}
    </>;
    default: return <Star r={55} />;
  }
}

function Trace({ d, delay = 0, className = '' }: { d: string; delay?: number; className?: string }) {
  return <path d={d} pathLength="1" className={`fue-trace ${className}`} style={{ '--fue-delay': delay } as Vars} />;
}

function AttackMotion({ job, source: s, target: t }: { job: string; source: Point; target: Point }) {
  const angle = Math.atan2(t.y - s.y, t.x - s.x) * 180 / Math.PI;
  const line = `M${s.x},${s.y} L${t.x},${t.y}`;
  const atTarget = `translate(${t.x} ${t.y})`;
  switch (job) {
    case 'adventurer': return <>
      <Trace d={`M${s.x},${s.y} Q${s.x - 60},${s.y - 100} ${t.x},${t.y}`} className="fue-route" />
      <g transform={atTarget}><g className="fue-unfold"><path className="fue-heavy" d="M-90,65 L-90,-45 Q0,-160 90,-45 L90,65 M-65,63 L-65,-34 Q0,-115 65,-34 L65,63" /><path d="M-115,78 L-45,47 L0,69 L43,44 L116,78" /><Star y={-67} r={29} /></g></g>
    </>;
    case 'warrior': return <g transform={atTarget}><g transform={`rotate(${angle})`}>
      <path className="fue-sunder fue-heavy" d="M-130,-113 Q148,-51 109,103 Q67,-9 -130,-113" />
      <Trace d="M-138,-76 Q120,-25 130,87" delay={.07} /><Trace d="M-75,-143 L-31,-60 L-43,-24 L11,12 L23,69 L85,119" delay={.21} className="fue-fracture" />
      <path className="fue-scatter" d="M-91,23 L-118,45 L-87,49 Z M61,-98 L91,-121 L82,-81 Z M102,56 L133,71 L109,88 Z" />
    </g></g>;
    case 'knight': return <g transform={atTarget}>
      <g className="fue-rise"><path className="fue-heavy fue-fill" d="M0,-105 L80,-69 L68,31 Q45,88 0,114 Q-45,88 -68,31 L-80,-69 Z" /><path d="M0,-77 L0,68 M-40,-10 L40,-10" /></g>
      {[-1, 1].map(sign => <g key={sign} transform={`translate(${sign * 111} 0)`}><path className="fue-lance" d="M0,96 L0,-107 M-13,-82 L0,-107 L13,-82 M-13,18 L13,18" /></g>)}
    </g>;
    case 'spearfighter': return <>
      <Trace d={line} className="fue-heavy" />
      <Trace d={`M${s.x},${s.y - 18} Q${(s.x + t.x) / 2},${t.y - 110} ${t.x},${t.y - 13}`} delay={.09} />
      <g transform={`${atTarget} rotate(${angle})`}><path className="fue-thrust fue-heavy" d="M-125,0 L86,0 M54,-23 L86,0 L54,23 M28,-47 Q74,-57 61,-24 M28,47 Q74,57 61,24" /><path className="fue-coil" d="M-107,-24 Q-63,-68 -17,-21 Q29,27 62,-12 M-96,31 Q-57,65 -12,24" /></g>
    </>;
    case 'pugilist': return <g transform={atTarget}>
      <g className="fue-punch"><path className="fue-heavy fue-fill" d="M-60,5 L-64,-34 L-38,-49 L-15,-56 L10,-51 L34,-40 L61,-9 L42,39 L9,64 L-40,47 Z" /><path d="M-43,-24 L37,-10 M-29,3 L34,13 M-19,30 L24,35" /></g>
      <Trace d="M-131,81 L-85,23 L-46,70 L-4,20 L46,74 L87,32 L137,91" delay={.17} className="fue-heavy" /><path className="fue-crack" d="M-63,88 L-76,111 M-7,75 L2,121 M62,84 L85,118" />
    </g>;
    case 'shieldbearer': return <g transform={atTarget}>
      {[-1, 0, 1].map((i) => <g key={i} transform={`translate(${i * 86} ${Math.abs(i) * 21})`}><g className="fue-wall" style={{ '--fue-delay': (i + 1) * .07 } as Vars}><path className="fue-heavy fue-fill" d="M0,-91 L43,-64 L43,45 L0,73 L-43,45 L-43,-64 Z" /><path d="M-28,-21 L-28,-45 L-10,-45 L-10,-21 L10,-21 L10,-45 L28,-45 L28,-21 M-28,2 L28,2 M0,2 L0,49" /></g></g>)}
    </g>;
    case 'archer': return <>
      {[-2, -1, 0, 1, 2].map((i) => <Trace key={i} d={`M${s.x},${s.y} Q${t.x + i * 64},${Math.min(s.y, t.y) - 180 - Math.abs(i) * 27} ${t.x + i * 30},${t.y + Math.abs(i) * 15}`} delay={(i + 2) * .045} className="fue-arrow" />)}
      <g transform={atTarget}><path className="fue-feathers" d="M-84,38 L-121,-4 L-97,5 L-117,-26 L-81,-2 M84,38 L121,-4 L97,5 L117,-26 L81,-2" /><Trace d="M-68,67 Q0,24 68,67" delay={.25} /></g>
    </>;
    case 'hunter': return <>
      <Trace d={line} className="fue-heavy fue-arrow" delay={.1} />
      <g transform={atTarget}><g className="fue-lock"><path d="M-105,-25 L-105,-68 L-62,-68 M105,-25 L105,-68 L62,-68 M-105,25 L-105,68 L-62,68 M105,25 L105,68 L62,68" /><path className="fue-heavy" d="M-56,0 Q0,-48 56,0 Q0,48 -56,0 Z" /><circle r="16" /></g><path className="fue-trap" d="M-91,81 L-69,61 L-53,81 L-34,57 L-14,82 L7,57 L26,81 L49,57 L67,81 L90,61" /></g>
    </>;
    case 'ranger': return <>
      {[-2, -1, 0, 1, 2].map(i => <Trace key={i} d={`M${s.x},${s.y} Q${(s.x + t.x) / 2 + i * 32},${(s.y + t.y) / 2 - 110} ${t.x + i * 42},${t.y + i * 13}`} delay={Math.abs(i) * .06} className="fue-vine" />)}
      <g transform={atTarget}><path className="fue-grow" d="M-82,67 Q-46,0 -102,-57 M-70,39 L-112,15 M-80,-3 L-51,-27 M82,67 Q46,0 102,-57 M70,39 L112,15 M80,-3 L51,-27" /><path className="fue-leaf" d="M-106,12 Q-144,-11 -113,-28 Q-93,-16 -106,12 M105,15 Q143,-10 112,-28 Q92,-14 105,15" /></g>
    </>;
    case 'scout': return <>
      {[-1, 0, 1].map(i => <Trace key={i} d={`M${s.x - 20},${s.y + i * 24} C${s.x + 85},${s.y - 130 + i * 30} ${t.x - 110},${t.y + 110 + i * 30} ${t.x + 55},${t.y + i * 25}`} delay={(i + 1) * .09} className="fue-wind" />)}
      <g transform={atTarget}><g className="fue-compass"><path className="fue-heavy" d="M0,-96 L16,-16 L76,0 L16,16 L0,96 L-16,16 L-76,0 L-16,-16 Z" /><path d="M-53,-64 L-22,-22 M53,64 L22,22 M53,-64 L22,-22 M-53,64 L-22,22" /></g></g>
    </>;
    case 'spellblade': return <g transform={atTarget}>
      <g className="fue-starblade"><path className="fue-heavy" d="M-84,101 L87,-112 M36,-82 L82,-44 M-69,75 L-42,97" /><ellipse rx="119" ry="36" transform="rotate(-27)" /><Star x={-102} y={-12} r={19} /><Star x={96} y={-61} r={15} /><Star x={50} y={48} r={12} /></g>
      <Trace d="M-97,-79 Q91,-48 124,62 M-75,-105 Q110,-34 109,91" delay={.18} />
    </g>;
    case 'mage': return <g transform={atTarget}>
      <g className="fue-array"><path d="M-112,-65 L0,-129 L112,-65 L112,65 L0,129 L-112,65 Z M-112,-65 L112,65 L0,-129 L0,129 L112,-65 L-112,65 Z" /><ellipse rx="143" ry="44" /><Star r={38} /></g>
      {[-1, 0, 1].map(i => <g key={i} transform={`translate(${i * 65} ${Math.abs(i) * 18})`}><path className="fue-meteor fue-heavy" style={{ '--fue-delay': (i + 1) * .075 } as Vars} d="M-78,-238 L9,-7 M-59,-232 L24,-19 M-100,-219 L-10,-15 M9,-7 L26,1 L12,21 L-6,7 Z" /></g>)}
    </g>;
    case 'summoner': return <g transform={atTarget}>
      {[-1, 1].map(sign => <g key={sign} transform={`translate(${sign * 83} 0)`}><g className={`fue-gate fue-gate-${sign < 0 ? 'left' : 'right'}`}><path className="fue-heavy fue-fill" d="M-45,84 L-45,-54 Q0,-125 45,-54 L45,84 Z" /><path d="M-30,66 L-30,-49 Q0,-92 30,-49 L30,66 M-17,-21 L0,-38 L17,-21 L0,-4 Z M-17,21 L0,4 L17,21 L0,38 Z" /></g></g>)}
      <Trace d="M-83,-91 L0,-136 L83,-91 M-83,93 L0,132 L83,93 M-80,0 L80,0" delay={.2} /><Star r={24} />
    </g>;
    case 'bard': return <>
      {[-1, 0, 1].map(i => <Trace key={i} d={`M${s.x},${s.y + i * 18} C${s.x + 80},${s.y - 100} ${t.x - 80},${t.y + 80} ${t.x},${t.y + i * 20}`} delay={(i + 1) * .08} className="fue-song" />)}
      <g transform={atTarget}>{[0, 1, 2].map(i => <path key={i} className="fue-sound" style={{ '--fue-delay': i * .09 } as Vars} d={`M${-38 - i * 29},${-65 - i * 8} Q${-79 - i * 43},0 ${-38 - i * 29},${65 + i * 8} M${38 + i * 29},${-65 - i * 8} Q${79 + i * 43},0 ${38 + i * 29},${65 + i * 8}`} />)}<path className="fue-staff" d="M-36,-41 L36,-41 M-36,-21 L36,-21 M-36,-1 L36,-1 M-36,19 L36,19 M-36,39 L36,39 M-8,-47 L-8,31 Q-34,16 -26,41 Q-14,55 -8,31 M-8,-47 L16,-29" /></g>
    </>;
    case 'leader': return <g transform={atTarget}>
      {[-1, 0, 1].map(i => <g key={i} transform={`translate(${i * 86} ${Math.abs(i) * 18})`}><g className="fue-banner" style={{ '--fue-delay': Math.abs(i) * .1 } as Vars}><path className="fue-heavy" d="M-29,94 L-29,-94 M-29,-88 Q0,-109 33,-85 L33,-9 Q2,-34 -29,-12" /><path d="M-9,-67 L0,-80 L9,-67 L0,-54 Z M-20,93 L-38,93" /></g></g>)}
      <Trace d="M-145,110 Q0,66 145,110" delay={.27} className="fue-command" />
    </g>;
    case 'thief': return <g transform={atTarget}>
      <g className="fue-scissor"><path className="fue-heavy" d="M-112,-94 L63,75 M-65,75 L112,-94 M-85,56 L-47,95 M47,95 L85,56" /></g>
      <Trace d="M-133,18 Q-110,-103 0,-99 M132,-18 Q110,103 0,99" delay={.12} className="fue-vanish" /><path className="fue-key" d="M-12,16 A24,24 0 1 1 12,16 L20,52 L-20,52 Z" />
    </g>;
    case 'assassin': return <g transform={atTarget}>
      <path className="fue-eclipse fue-fill" d="M44,-119 Q-99,-70 -56,44 Q-25,103 43,112 Q-112,132 -125,2 Q-122,-94 44,-119 Z" />
      <Trace d="M-90,110 L82,-119 M-70,122 L103,-100" delay={.23} className="fue-heavy" /><path className="fue-deathmark" d="M-32,-8 L0,-40 L32,-8 L0,41 Z M-22,26 L22,-22 M-22,-22 L22,26" />
    </g>;
    case 'bandit': return <g transform={atTarget}>
      <g className="fue-axe"><path className="fue-heavy" d="M-75,85 L46,-119 M20,-83 Q73,-124 115,-60 L68,-12 Q41,-42 -2,-43" /></g>
      <Trace d="M-148,98 L-100,33 L-68,66 L-27,7 L12,70 L60,36 L98,83 L139,58" delay={.18} className="fue-fracture" /><path className="fue-crack" d="M-29,8 L-40,48 L-24,63 L-36,118 M31,68 L40,105 M-104,70 L-122,114" />
    </g>;
    case 'smuggler': return <>
      <Trace d={`M${s.x},${s.y} C${s.x - 120},${s.y + 115} ${t.x + 160},${t.y - 95} ${t.x},${t.y}`} className="fue-hidden-route" />
      <g transform={atTarget}><g className="fue-anchor"><circle cy="-64" r="17" /><path className="fue-heavy" d="M0,-47 L0,62 M-35,-21 L35,-21 M-66,5 Q-56,67 0,87 Q56,67 66,5 M-78,25 L-66,5 L-48,22 M48,22 L66,5 L78,25" /></g><path className="fue-tide" d="M-143,104 Q-110,76 -77,104 Q-44,132 -11,104 Q22,76 55,104 Q88,132 121,104" /></g>
    </>;
    case 'spy': return <g transform={atTarget}>
      <g className="fue-reveal"><path className="fue-heavy" d="M-116,-8 Q0,-105 116,-8 Q0,83 -116,-8 Z" /><path d="M0,-55 L47,-8 L0,39 L-47,-8 Z" /><circle cy="-8" r="17" /></g>
      {[-1, 1].map(sign => <g key={sign} transform={`translate(${sign * 60} 75)`}><path className="fue-code" d="M-37,-9 L-26,-22 L-16,-9 M-9,6 L2,-9 L13,6 M22,-5 L35,-21 L42,-5 M-34,28 L-13,28 M0,28 L7,28 M18,28 L39,28" /></g>)}
      <Trace d="M-115,-75 L-69,-75 L-57,-59 M115,58 L70,58 L56,42" delay={.22} />
    </g>;
    case 'crimeboss': return <g transform={atTarget}>
      <g className="fue-web"><path d="M-138,-5 L0,-73 L138,-5 L88,108 L-88,108 Z M0,-73 L0,124 M-138,-5 L88,108 M138,-5 L-88,108 M-88,108 L0,39 L88,108 M-138,-5 L0,39 L138,-5" /></g>
      <path className="fue-crown fue-heavy fue-fill" d="M-47,-85 L-58,-127 L-22,-105 L0,-146 L22,-105 L58,-127 L47,-85 Z M-39,-71 L39,-71" />
      {[-1, 1].map(sign => <g key={sign} transform={`translate(${sign * 105} -60) rotate(${sign * 27})`}><g className="fue-chain"><rect x="-11" y="-35" width="22" height="39" rx="11" /><rect x="-11" y="-4" width="22" height="39" rx="11" /><rect x="-11" y="27" width="22" height="39" rx="11" /></g></g>)}
    </g>;
    default: return null;
  }
}

const JOB_PARTICLES: Record<string, { spread: number; bias: number; shape: 'spark' | 'leaf' | 'diamond' | 'chip'; count: number }> = {
  adventurer: { spread: 105, bias: -22, shape: 'diamond', count: 8 }, warrior: { spread: 160, bias: 20, shape: 'chip', count: 11 },
  knight: { spread: 125, bias: -30, shape: 'spark', count: 8 }, spearfighter: { spread: 140, bias: -8, shape: 'diamond', count: 10 },
  pugilist: { spread: 150, bias: 55, shape: 'chip', count: 12 }, shieldbearer: { spread: 170, bias: 45, shape: 'diamond', count: 9 },
  archer: { spread: 145, bias: -85, shape: 'spark', count: 11 }, hunter: { spread: 105, bias: 30, shape: 'diamond', count: 7 },
  ranger: { spread: 135, bias: -20, shape: 'leaf', count: 12 }, scout: { spread: 150, bias: 5, shape: 'spark', count: 9 },
  spellblade: { spread: 135, bias: -40, shape: 'spark', count: 10 }, mage: { spread: 180, bias: -65, shape: 'diamond', count: 12 },
  summoner: { spread: 170, bias: -10, shape: 'diamond', count: 10 }, bard: { spread: 155, bias: -50, shape: 'spark', count: 9 },
  leader: { spread: 150, bias: -50, shape: 'diamond', count: 9 }, thief: { spread: 120, bias: 12, shape: 'chip', count: 8 },
  assassin: { spread: 125, bias: -18, shape: 'chip', count: 9 }, bandit: { spread: 165, bias: 60, shape: 'chip', count: 12 },
  smuggler: { spread: 155, bias: 45, shape: 'leaf', count: 8 }, spy: { spread: 140, bias: 30, shape: 'diamond', count: 10 },
  crimeboss: { spread: 165, bias: -25, shape: 'diamond', count: 11 },
};

function Particles({ job, seed, tier }: { job: string; seed: string | number; tier: number }) {
  const plan = JOB_PARTICLES[job];
  if (!plan) return null;
  let hash = 0;
  for (const character of `${job}:${seed}`) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  return <g className="fue-particles">{Array.from({ length: Math.min(plan.count, 6 + tier * 2) }, (_, i) => {
    const angle = (i * 2.39996 + (hash % 113) * .061) % (Math.PI * 2);
    const radius = plan.spread * (.45 + ((hash >>> (i % 19)) % 53) / 100);
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius * .75 + plan.bias;
    const size = 4 + i % 4;
    const d = plan.shape === 'leaf' ? `M${-size},0 Q0,${-size * 2} ${size},0 Q0,${size * 2} ${-size},0`
      : plan.shape === 'chip' ? `M${-size},${-size} L${size * 1.5},0 L0,${size} Z`
        : plan.shape === 'diamond' ? `M0,${-size} L${size * .6},0 L0,${size} L${-size * .6},0 Z`
          : `M${-size},0 L${size},0 M0,${-size} L0,${size}`;
    return <g key={i} transform={`translate(${x} ${y}) rotate(${i * 37 + hash % 91})`}><path className={`fue-particle fue-particle-${plan.shape}`} d={d}
      style={{ '--fue-delay': .1 + i * .024, '--fue-px': `${x * .22}px`, '--fue-py': `${y * .25 - 18}px` } as Vars} /></g>;
  })}</g>;
}

export function FantasyUltimateEffects({ id, ultimate, source, target, tier, durationMs, seed }: FantasyUltimateEffectsProps) {
  const strength = Math.max(1, Math.min(4, Number.isFinite(tier) ? Math.round(tier) : 1));
  const duration = Number.isFinite(durationMs) ? Math.max(600, Math.min(6000, durationMs)) : ultimate.durationMs;
  return <g key={`${id}:${seed}`} className={`fue fue-${ultimate.job} fue-tier-${strength}`} data-sigil={ultimate.sigil} aria-hidden="true"
    style={{ '--fue-duration': `${duration}ms`, '--fue-color': ultimate.color } as Vars}>
    <g transform={`translate(${source.x} ${source.y})`}><g className="fue-sigil"><Sigil job={ultimate.job} /></g></g>
    <g className="fue-motion"><AttackMotion job={ultimate.job} source={source} target={target} /></g>
    <g className="fue-motion" transform={`translate(${target.x} ${target.y})`}><Particles job={ultimate.job} seed={seed} tier={strength} /></g>
  </g>;
}
