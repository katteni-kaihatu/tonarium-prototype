import { t, useLanguage } from '../../i18n/index.ts';
import { Icon } from '../Icon.tsx';
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
        <div style={s.muted}><Icon name="lock" size={14} /> {t('adLabText14')}</div></div>
      </div>
    );
  }
  return (
    <div className={`ad-dimension-card${d.affordable ? ' is-affordable' : ''}`} data-tier={d.tier}>
      <DimensionReactor dimension={d} />
      <div className="ad-dimension-details">
        <div className="ad-dimension-title">{t('adLabText13', d.tier)}<span style={s.muted}>{TIER_EN[d.tier - 1]} Dimension</span></div>
        <dl className="ad-dimension-numbers">
          <div><dt>{t('adOwned')}</dt><dd style={s.big}>{formatNumber(d.amount)}</dd></div>
          <div><dt>{t('adBought')}</dt><dd>{d.bought}</dd></div>
          <div><dt>{t('adProduction')}</dt><dd>{t('adPerSecond', formatNumber(d.productionPerSecond))}</dd></div>
          <div><dt>{t('adMultiplier')}</dt><dd>{dimensionMultiplierText(d.tier, d.bought, boosts, sacrificeBoost, false)}</dd></div>
          {d.tier === 8 && <div><dt>Sacrifice</dt><dd>×{formatNumber(sacrificeBoost)}</dd></div>}
          <div><dt>{t('adCost')}</dt><dd>{formatNumber(d.cost)}</dd></div>
        </dl>
        <div style={s.muted}>{t('adLabText16', d.nextMilestoneRemaining)}</div>
        <div className="ad-dimension-progress" aria-hidden="true"><span style={{ width: `${(10 - d.nextMilestoneRemaining) * 10}%` }} /></div>
      </div>
      <div className="ad-dimension-buy">
        <button style={s.btn} aria-label={t('adLabText23', d.tier)} disabled={!d.affordable} onClick={() => buyDimension(d.tier)}>{t('adLabText17')}
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
      <div className="ad-tickspeed">
        <div className="ad-tickspeed-numbers">
          <span className="ad-number"><Icon name="sparkle" size={16} /> Tickspeed: ×{derived.tickspeedValue >= 10000 ? formatNumber(derived.tickspeedValue) : derived.tickspeedValue.toFixed(2)}</span>
          <span style={s.muted}>{t('adLabText20', derived.tickspeedBought, derived.tickspeedPerPurchase.toFixed(4))}</span>
          <span className="ad-number" style={s.muted}>{t('adLabText18', formatNumber(derived.tickspeedCost))}</span>
        </div>
        <div className="ad-tickspeed-buy">
          <button style={s.btn} disabled={!derived.tickspeedAffordable} onClick={() => ad.buyTickspeed()}>{t('adBuyTickspeed')}</button>
          <button style={s.btn} onClick={() => ad.buyMax()}>{t('adLabText22')}</button>
        </div>
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
