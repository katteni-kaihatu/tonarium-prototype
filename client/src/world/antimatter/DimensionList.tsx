import { t, useLanguage } from '../../i18n/index.ts';
import { memo } from 'react';
import type { AntimatterSlice, DimensionDerived } from './types.ts';
import { formatNumber } from './format.ts';
import { dimensionMultiplierText, s, TIER_EN } from './styles.ts';
import { DimensionReactor } from './DimensionReactor.tsx';

function DimensionRow({ d, boosts, sacrificeBoost, buyDimension, buyUntilNextTen }: {
  d: DimensionDerived;
  boosts: number;
  sacrificeBoost: AntimatterSlice['game']['sacrificeBoost'];
  buyDimension: AntimatterSlice['buyDimension'];
  buyUntilNextTen: AntimatterSlice['buyUntilNextTen'];
}) {
  useLanguage();
  if (d.locked) {
    return (
      <div className="ad-dimension-card is-locked" data-tier={d.tier}>
        <DimensionReactor dimension={d} />
        <div><span>{t('adLabText13', d.tier)}<span style={s.muted}>{TIER_EN[d.tier - 1]} Dimension</span></span>
        <div style={s.muted}>{t('adLabText14')}</div></div>
      </div>
    );
  }
  return (
    <div className={`ad-dimension-card${d.affordable ? ' is-affordable' : ''}`} data-tier={d.tier}>
      <DimensionReactor dimension={d} />
      <div className="ad-dimension-details">
        <div className="ad-dimension-title">{t('adLabText13', d.tier)}<span style={s.muted}>{TIER_EN[d.tier - 1]} Dimension</span></div>
        <div style={s.big}>{formatNumber(d.amount)}</div>
        <div style={s.muted}>{t('adLabText15', d.bought, formatNumber(d.productionPerSecond), dimensionMultiplierText(d.tier, d.bought, boosts, sacrificeBoost))}<br />{t('adLabText16', d.nextMilestoneRemaining)}</div>
        <div className="ad-dimension-progress" aria-hidden="true"><span style={{ width: `${(10 - d.nextMilestoneRemaining) * 10}%` }} /></div>
      </div>
      <div className="ad-dimension-buy">
        <button style={s.btn} aria-label={t('adLabText23', d.tier)} disabled={!d.affordable} onClick={() => buyDimension(d.tier)}>{t('adLabText17')}<br /><small>{t('adLabText18', formatNumber(d.cost))}</small>
        </button>
        <button style={s.btn} aria-label={t('adLabText24', d.tier)} disabled={!d.affordable} onClick={() => buyUntilNextTen(d.tier)}>{t('adLabText19')}</button>
      </div>
    </div>
  );
}

const MemoRow = memo(DimensionRow);

export function DimensionList({ ad }: { ad: AntimatterSlice }) {
  useLanguage();
  const { derived, game } = ad;
  return (
    <div className="ad-dimensions">
      <div style={s.row}>
        <span>🔥 Tickspeed: ×{derived.tickspeedValue >= 10000 ? formatNumber(derived.tickspeedValue) : derived.tickspeedValue.toFixed(2)}</span>
        <span style={s.muted}>{t('adLabText20', derived.tickspeedBought, derived.tickspeedPerPurchase.toFixed(4))}</span>
        <span style={{ flex: 1 }} />
        <button style={s.btn} disabled={!derived.tickspeedAffordable} onClick={() => ad.buyTickspeed()}>{t('adLabText21', formatNumber(derived.tickspeedCost))}</button>
        <button style={s.btn} onClick={() => ad.buyMax()}>{t('adLabText22')}</button>
      </div>
      {derived.dimensions.map((d) => (
        <MemoRow
          key={d.tier} d={d} boosts={game.dimensionalBoosts} sacrificeBoost={game.sacrificeBoost}
          buyDimension={ad.buyDimension} buyUntilNextTen={ad.buyUntilNextTen}
        />
      ))}
    </div>
  );
}
