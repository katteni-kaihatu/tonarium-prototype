import { Icon } from '../Icon.tsx';
import { t, useLanguage } from '../../i18n/index.ts';
import type { AntimatterSlice } from './types.ts';
import { ACHIEVEMENT_DEFS, s } from './styles.ts';

export function AchievementsPanel({ ad }: { ad: AntimatterSlice }) {
  useLanguage();
  const { game } = ad;
  const owned = new Set(game.achievements);
  const defs: { id: string; name: string; desc: string }[] = [...ACHIEVEMENT_DEFS];
  for (const id of game.achievements) {
    if (!defs.some((d) => d.id === id)) defs.push({ id, name: id, desc: t('adLabText57') });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 style={s.sectionTitle}>{t('adLabText58')} <span style={s.muted}>{t('adLabText59', owned.size)}</span></h2>
      <div>
        <h3 style={s.sectionTitle}>{t('ui819')}<span style={s.muted}>{t('adLabText51', owned.size, defs.length)}</span></h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {defs.map((d) => (
            <div key={d.id} style={{ ...s.row, opacity: owned.has(d.id) ? 1 : 0.65, borderRadius: 10, padding: '10px 12px', background: owned.has(d.id) ? 'linear-gradient(110deg, #234143, #302744)' : '#182238', border: `1px solid ${owned.has(d.id) ? '#78edd95c' : '#66729333'}` }}>
              <span><Icon name={owned.has(d.id) ? 'check' : 'lock'} size={16} /> <span style={s.muted}>{t(owned.has(d.id) ? 'adAchieved' : 'adNotAchieved')}</span> <b>{d.name}</b></span>
              <span style={s.muted}>{d.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
