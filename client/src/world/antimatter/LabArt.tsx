import { useId, type CSSProperties } from 'react';

export type LabArtKind = 'reactor' | 'boost' | 'galaxy' | 'singularity' | 'trophy' | 'explorer';

/** Small, original vector illustrations: decorative and crisp at every UI scale. */
export function LabArt({ kind = 'reactor', size = 88, style }: { kind?: LabArtKind; size?: number; style?: CSSProperties }) {
  const id = useId().replace(/:/g, '');
  const ink = '#091426';
  return (
    <svg viewBox="0 0 160 160" width={size} height={size} fill="none" aria-hidden="true" focusable="false" style={{ flexShrink: 0, ...style }}>
      <defs>
        <linearGradient id={`${id}-power`} x1="25" y1="20" x2="130" y2="145" gradientUnits="userSpaceOnUse"><stop stopColor="#72fff0" /><stop offset=".48" stopColor="#6b8cff" /><stop offset="1" stopColor="#fa65da" /></linearGradient>
        <radialGradient id={`${id}-glow`}><stop stopColor="#6de6ff" stopOpacity=".38" /><stop offset="1" stopColor="#7364ff" stopOpacity="0" /></radialGradient>
      </defs>
      <circle cx="80" cy="80" r="78" fill={`url(#${id}-glow)`} />
      <g stroke="#9abaff" strokeWidth="2" opacity=".75"><path d="M22 34v10m-5-5h10M132 100v12m-6-6h12M115 22v8m-4-4h8" /><circle cx="31" cy="119" r="2" fill="#7dfce6" /><circle cx="133" cy="56" r="2" fill="#ff91eb" /></g>
      {kind === 'reactor' && <g stroke={ink} strokeWidth="4" strokeLinejoin="round">
        <path d="m46 119 7-65h54l7 65-12 16H58z" fill="#4566be" />
        <path d="M51 51h58v18H51zM48 119h64v13H48z" fill="#a4e6ff" />
        <path d="M64 51V34h32v17" fill="#899dff" /><path d="M69 34V24h22v10" fill="#f6b8ff" />
        <circle cx="80" cy="92" r="22" fill={`url(#${id}-power)`} /><path d="m85 75-16 20h12l-5 14 17-22H81z" fill="#e7fff1" strokeWidth="2" />
        <path d="M42 80H29v25h16m70-25h15v25h-14" stroke="#70eadf" />
        <path d="M62 140h36" stroke="#75f4f0" />
      </g>}
      {kind === 'boost' && <g stroke={ink} strokeWidth="4" strokeLinejoin="round">
        <path d="m64 104-7 26 20-12 4 23 15-35" fill="#ffae53" /><path d="m71 104 5 19 12-19" fill="#fff2a0" />
        <path d="M60 79 41 98l-4 24 29-15m34-28 19 19 4 24-29-15" fill="#bb8cff" />
        <path d="M80 21c-23 19-29 51-20 83h40c9-32 3-64-20-83Z" fill="#d6faff" />
        <path d="M80 21c-10 9-16 18-20 30h40c-4-12-10-21-20-30Z" fill="#65e9e6" />
        <circle cx="80" cy="72" r="12" fill={`url(#${id}-power)`} /><path d="M69 97h22" stroke="#6072c9" />
        <path d="m27 68 9-13m92 22 8-16M46 40l5-9" stroke="#98eaff" />
      </g>}
      {kind === 'galaxy' && <g>
        <ellipse cx="80" cy="80" rx="64" ry="29" transform="rotate(-28 80 80)" stroke="#8a7aff" strokeWidth="13" opacity=".5" />
        <ellipse cx="80" cy="80" rx="59" ry="23" transform="rotate(-28 80 80)" stroke="#6fffe3" strokeWidth="4" />
        <path d="M33 103c4-24 77-69 93-49 16 25-58 70-73 46-10-16 35-43 49-30 9 11-19 28-26 17" stroke="#dba4ff" strokeWidth="7" strokeLinecap="round" />
        <circle cx="80" cy="80" r="13" fill="#edfff2" /><circle cx="128" cy="57" r="6" fill="#ffcd6e" /><circle cx="40" cy="119" r="5" fill="#f68cd3" />
      </g>}
      {kind === 'singularity' && <g>
        <circle cx="80" cy="80" r="44" fill={ink} stroke="#a186ff" strokeWidth="9" /><circle cx="80" cy="80" r="35" stroke="#fb92e4" strokeWidth="2" />
        <ellipse cx="80" cy="80" rx="65" ry="18" transform="rotate(-23 80 80)" stroke="#76fff1" strokeWidth="6" />
        <path d="M44 72a37 37 0 0 1 72 0" fill={ink} stroke="#ffd3f2" strokeWidth="3" />
        <path d="m80 13 3 12m-3 110 3 12M12 80l13-2m111 1 12-2" stroke="#bca4ff" strokeWidth="3" />
      </g>}
      {kind === 'trophy' && <g stroke={ink} strokeWidth="4" strokeLinejoin="round">
        <path d="M51 48H31v17c0 18 16 27 30 24m48-41h20v17c0 18-16 27-30 24" stroke="#ffd16d" strokeWidth="9" />
        <path d="M53 39h54v38c0 21-13 33-27 33S53 98 53 77Z" fill="#ffcf67" /><path d="M72 109h16v17H72zM56 127h48v12H56z" fill="#ba94ff" />
        <path d="m80 52 6 12 13 2-10 10 2 14-11-7-12 7 3-14-10-10 13-2z" fill="#fff5ae" strokeWidth="2" />
        <path d="m28 24 8 8m91-7-6 10M19 101l10-2" stroke="#70ffdf" />
      </g>}
      {kind === 'explorer' && <g stroke={ink} strokeWidth="4" strokeLinejoin="round">
        <path d="m50 137 4-29 26-12 26 12 6 29" fill="#ddeaff" /><path d="m69 104 11 23 12-23M80 127v17" stroke="#5e73bb" />
        <path d="M111 59c11 6 11 33-2 39H51c-13-6-12-33-2-39" fill="#a6a1f7" />
        <rect x="48" y="36" width="64" height="66" rx="28" fill="#c2e9ff" />
        <rect x="56" y="51" width="48" height="35" rx="16" fill="#193550" /><path d="m65 63 5-4 5 4m10 0 5-4 5 4" stroke="#7cffe1" strokeWidth="3" strokeLinecap="round" />
        <path d="M74 75q6 6 12 0" stroke="#ffb1e5" strokeWidth="3" strokeLinecap="round" /><path d="M80 35V24m-5-3h10" stroke="#7cf7ed" />
        <path d="M39 119 27 104m0 0 1-15m-1 15-13-5M118 121l16-13" stroke="#d4eeff" strokeWidth="8" strokeLinecap="round" />
        <path d="M96 119h9" stroke="#fa80ce" />
      </g>}
    </svg>
  );
}

export function LabBanner({ kind, eyebrow, title, description }: { kind: LabArtKind; eyebrow: string; title: string; description: string }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 16, background: 'linear-gradient(115deg, #192444, #29204b 65%, #153940)', border: '1px solid #6bdedb55', overflow: 'hidden' }}>
    <LabArt kind={kind} size={92} />
    <div style={{ minWidth: 0 }}><div style={{ color: '#83f5e1', fontSize: 10, fontWeight: 800, letterSpacing: '0.18em' }}>{eyebrow}</div><div style={{ color: '#f4f1ff', fontSize: 19, fontWeight: 900, margin: '3px 0' }}>{title}</div><div style={{ color: '#c2cce6', fontSize: 12, lineHeight: 1.6 }}>{description}</div></div>
  </div>;
}
