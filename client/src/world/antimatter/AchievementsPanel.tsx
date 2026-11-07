import { Icon } from '../Icon.tsx';
import { t, useLanguage } from '../../i18n/index.ts';
import { bigLog10 } from '../../ad/engine.mjs';
import type { AntimatterSlice } from './types.ts';
import { ACHIEVEMENT_DEFS } from './styles.ts';
import { formatNumber } from './format.ts';
import { digitRatio, percent, ratio } from './progress.ts';

interface Hint { progress: number; text: string }

// 判定はエンジン側。ここは未達成の実績に「あとどれくらいか」を添えるだけ。
function hintFor(id: string, ad: AntimatterSlice): Hint | null {
  const { game, derived } = ad;
  const digits = Math.max(0, bigLog10(game.antimatter));
  switch (id) {
    case 'antimatter-1e100': return { progress: digitRatio(digits, 100), text: `e${Math.floor(digits)} / e100` };
    case 'first-infinity': return { progress: digitRatio(digits, derived.preview.infinityThresholdLog10), text: `e${Math.floor(digits)} / e${Math.floor(derived.preview.infinityThresholdLog10)}` };
    case 'first-boost': return { progress: ratio(derived.boost.currentAmount, derived.boost.amount), text: `${t('adLabText13', derived.boost.tier)} ${formatNumber(derived.boost.currentAmount)} / ${derived.boost.amount}` };
    case 'first-galaxy': return { progress: ratio(derived.galaxy.currentAmount, derived.galaxy.amount), text: `${t('adLabText13', 8)} ${formatNumber(derived.galaxy.currentAmount)} / ${derived.galaxy.amount}` };
    case 'eighth-dimension': return { progress: derived.maxUnlockedTier / 8, text: `${t('adLabText13', derived.maxUnlockedTier)} / ${t('adLabText13', 8)}` };
    case 'first-sacrifice': return derived.sacrifice.unlocked
      ? { progress: ratio(derived.sacrifice.next, derived.preview.sacrificeNeeded), text: `×${formatNumber(derived.sacrifice.next)} / ×${formatNumber(derived.preview.sacrificeNeeded)}` }
      : { progress: Math.min(1, derived.sacrifice.boosts / 5), text: `Boost ${derived.sacrifice.boosts} / 5` };
    default: return null;
  }
}

export function AchievementsPanel({ ad }: { ad: AntimatterSlice }) {
  useLanguage();
  const { game } = ad;
  const owned = new Set(game.achievements);
  const defs: { id: string; name: string; desc: string }[] = [...ACHIEVEMENT_DEFS];
  for (const id of game.achievements) {
    if (!defs.some((d) => d.id === id)) defs.push({ id, name: id, desc: t('adLabText57') });
  }
  const rows = defs.map(d => ({ ...d, done: owned.has(d.id), hint: owned.has(d.id) ? null : hintFor(d.id, ad) }));
  const nearest = rows.filter(row => row.hint).sort((a, b) => b.hint!.progress - a.hint!.progress)[0];

  return (
    <div className="adlab-achievements">
      <div className="adlab-ach-summary">
        <b className="adlab-number">{owned.size}<span> / {defs.length}</span></b>
        <div className="adlab-bar" aria-hidden="true"><span style={{ width: percent(defs.length ? owned.size / defs.length : 0) }} /></div>
        <span className="adlab-ach-count">{t('adLabText51', owned.size, defs.length)}</span>
      </div>
      <p className="adlab-ach-lead">{t('adLabText59', owned.size)}{nearest ? ` ${t('adUiNearest', nearest.name, percent(nearest.hint!.progress))}` : ''}</p>
      <div className="adlab-ach-grid">
        {rows.map((d) => (
          <div key={d.id} className={`adlab-ach${d.done ? ' is-done' : ''}`}>
            <span className="adlab-ach-icon"><Icon name={d.done ? 'trophy' : 'lock'} size={20} /></span>
            <div className="adlab-ach-body">
              <div className="adlab-ach-head"><b>{d.name}</b><span className="adlab-ach-state">{t(d.done ? 'adAchieved' : 'adNotAchieved')}</span></div>
              <span className="adlab-ach-desc">{d.desc}</span>
              {d.hint && (
                <div className="adlab-ach-progress">
                  <div className="adlab-bar" aria-hidden="true"><span style={{ width: percent(d.hint.progress) }} /></div>
                  <span className="adlab-number">{d.hint.text}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
