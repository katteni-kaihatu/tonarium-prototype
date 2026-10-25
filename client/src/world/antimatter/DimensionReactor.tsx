import type { CSSProperties } from 'react';
import type { DimensionDerived } from './types.ts';

const COLORS = ['#77ffe0', '#74caff', '#b297ff', '#ff8adf', '#ffad78', '#ffe478', '#aaff83', '#ffffff'];

/** CSS transforms keep the reactors moving between the engine's 100ms updates. */
export function DimensionReactor({ dimension: d }: { dimension: DimensionDerived }) {
  const producing = !d.locked && d.productionPerSecond.mantissa > 0;
  const energy = producing ? Math.max(0, d.productionPerSecond.exponent) : 0;
  const duration = Math.max(2.5, 16 - d.tier - Math.min(8, Math.floor(energy / 4)));
  const style = {
    '--ad-tier-color': COLORS[d.tier - 1],
    '--ad-orbit-duration': `${duration}s`,
  } as CSSProperties;
  return (
    <svg className={`ad-dimension-reactor${d.locked ? ' is-locked' : ''}${producing ? ' is-producing' : ''}`}
      style={style} viewBox="0 0 100 100" aria-hidden="true">
      <circle className="ad-reactor-halo" cx="50" cy="50" r="43" />
      <g className="ad-reactor-orbit">
        <circle cx="50" cy="50" r="39" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="55 10 7 10" />
        <circle cx="50" cy="11" r="4" fill="currentColor" />
        <circle cx="50" cy="89" r="2" fill="white" />
      </g>
      <g className="ad-reactor-orbit ad-reactor-inner">
        <ellipse cx="50" cy="50" rx="29" ry="17" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <ellipse cx="50" cy="50" rx="17" ry="29" fill="none" stroke="currentColor" strokeWidth="1.5" />
        {Array.from({ length: d.tier }, (_, i) => {
          const angle = (i / d.tier) * Math.PI * 2;
          return <circle key={i} cx={50 + Math.cos(angle) * 29} cy={50 + Math.sin(angle) * 29} r="2.5" fill="currentColor" />;
        })}
      </g>
      <path d="M50 32 66 50 50 68 34 50Z" fill="currentColor" fillOpacity=".16" stroke="currentColor" />
      <text x="50" y="55" textAnchor="middle" fill="white" fontSize="15" fontWeight="900">{d.locked ? '?' : d.tier}</text>
    </svg>
  );
}
