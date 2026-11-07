import { t, useLanguage } from '../../i18n/index.ts';
import { bigLog10 } from '../../ad/engine.mjs';
import { Icon, type IconName } from '../Icon.tsx';
import type { AntimatterSlice } from './types.ts';
import { formatDuration, formatNumber } from './format.ts';
import { digitRatio, percent, ratio, remaining } from './progress.ts';
import { tickspeedText } from './ActionBar.tsx';

function Tile({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="adlab-stat">
      <span className="adlab-stat-icon"><Icon name={icon} size={17} /></span>
      <span className="adlab-stat-text"><span className="adlab-stat-label">{label}</span><b className="adlab-number">{value}</b></span>
    </div>
  );
}

function Goal({ name, now, progress, note }: { name: string; now: string; progress: number; note: string }) {
  return (
    <div className="adlab-goal">
      <div className="adlab-goal-head"><b>{name}</b><span className="adlab-number">{now}</span></div>
      <div className="adlab-bar" aria-hidden="true"><span style={{ width: percent(progress) }} /></div>
      <span className="adlab-goal-note">{note}</span>
    </div>
  );
}

export function StatsPanel({ ad }: { ad: AntimatterSlice }) {
  useLanguage();
  const { game, derived } = ad;
  const playTimeSec = Math.max(0, Math.floor((Date.now() - (game.createdAt || Date.now())) / 1000));
  const { boost, galaxy, infinity, preview } = derived;
  const antimatterLog = Math.max(0, bigLog10(game.antimatter));
  const digits = Math.floor(antimatterLog);
  const infinityGoal = Math.floor(preview.infinityThresholdLog10);

  return (
    <div className="adlab-stats">
      <div className="adlab-stat-grid">
        <Tile icon="atom" label={t('adUiStatTotal')} value={formatNumber(game.totalAntimatter)} />
        <Tile icon="calendar" label={t('adUiStatPlay')} value={formatDuration(playTimeSec)} />
        <Tile icon="gauge" label={t('adUiStatTick')} value={t('adUiTimes', game.tickspeedBought)} />
        <Tile icon="flame" label={t('adUiStatSacrifice')} value={`×${formatNumber(game.sacrificeBoost)}`} />
        <Tile icon="rocket" label="Dimension Boost" value={t('adUiTimes', game.dimensionalBoosts)} />
        <Tile icon="galaxy" label={t('adUiStatGalaxy')} value={t('adUiGalaxyCount', game.galaxies)} />
        <Tile icon="infinity" label="Infinity" value={t('adUiTimes', game.infinities)} />
        <Tile icon="infinity" label="Infinity Point" value={formatNumber(game.infinityPoints)} />
      </div>
      <div className="adlab-stat-columns">
        <section className="adlab-panel-box">
          <div className="adlab-box-head"><b>{t('adUiBreakdown')}</b><span>{t('adUiBreakdownHint')}</span></div>
          <div className="adlab-breakdown">
            <div className="adlab-breakdown-row adlab-breakdown-header">
              <span>{t('adUiColDim')}</span><span>{t('adUiColBuy10')}</span><span>Boost</span><span>{t('adUiColOther')}</span><span>{t('adUiColTotal')}</span>
            </div>
            {preview.breakdown.map(row => row.locked ? (
              <div key={row.tier} className="adlab-breakdown-row is-locked">
                <span>{t('adLabText13', row.tier)}</span><span className="adlab-breakdown-locked"><Icon name="lock" size={12} /> {t('adLocked')}</span>
              </div>
            ) : (
              <div key={row.tier} className="adlab-breakdown-row adlab-number">
                <span>{t('adLabText13', row.tier)}</span>
                <span>×{formatNumber(row.buy10)}</span>
                <span className="is-boost">×{formatNumber(row.boost)}</span>
                <span className="is-other">×{formatNumber(row.other)}</span>
                <b>×{formatNumber(row.total)}</b>
              </div>
            ))}
          </div>
          <div className="adlab-breakdown-foot">{t('adUiAllTick', tickspeedText(derived.tickspeedValue))}{bigLog10(game.sacrificeBoost) > 0 ? ` · ${t('adUiSacrificeEighth', formatNumber(game.sacrificeBoost))}` : ''}</div>
        </section>
        <section className="adlab-panel-box">
          <div className="adlab-box-head"><b>{t('adUiGoals')}</b></div>
          <Goal name="Dimension Boost" now={`${formatNumber(boost.currentAmount)} / ${boost.amount}`} progress={ratio(boost.currentAmount, boost.amount)}
            note={t('adUiGoalLeft', t('adLabText13', boost.tier), remaining(boost.currentAmount, boost.amount))} />
          <Goal name="Antimatter Galaxy" now={`${formatNumber(galaxy.currentAmount)} / ${galaxy.amount}`} progress={ratio(galaxy.currentAmount, galaxy.amount)}
            note={t('adUiGoalLeft', t('adLabText13', galaxy.tier), remaining(galaxy.currentAmount, galaxy.amount))} />
          <Goal name="Big Crunch" now={`e${digits} / e${infinityGoal}`} progress={infinity.can ? 1 : digitRatio(antimatterLog, preview.infinityThresholdLog10)}
            note={infinity.can ? t('adUiTipReady') : t('adUiLeftDigits', Math.max(0, infinityGoal - digits))} />
        </section>
      </div>
    </div>
  );
}
