import { t, useLanguage } from '../../i18n/index.ts';
import type { AntimatterSlice } from './types.ts';
import { formatDuration, formatNumber } from './format.ts';
import { s } from './styles.ts';

export function StatsPanel({ ad }: { ad: AntimatterSlice }) {
  useLanguage();
  const { game } = ad;
  const playTimeSec = Math.max(0, Math.floor((Date.now() - (game.createdAt || Date.now())) / 1000));

  return (
    <div>
      <h3 style={s.sectionTitle}>{t('adLabText43')}</h3>
      <div style={s.row}>
        <span>{t('adLabText44', formatNumber(game.totalAntimatter))}</span>
        <span>{t('adLabText45', formatDuration(playTimeSec))}</span>
        <span>{t('adLabText46', game.dimensionalBoosts)}</span>
        <span>{t('adLabText47', game.galaxies)}</span>
        <span>{t('adLabText48', game.infinities)}</span>
        <span>IP: {formatNumber(game.infinityPoints)}</span>
        <span>{t('adLabText49', game.tickspeedBought)}</span>
        <span>{t('adLabText50', formatNumber(game.sacrificeBoost))}</span>
      </div>
    </div>
  );
}
