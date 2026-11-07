import { t, useLanguage, type UiMessage } from '../../i18n/index.ts';
import { Icon } from '../Icon.tsx';
import { memo } from 'react';
import type { AntimatterSlice, DimensionDerived } from './types.ts';
import { formatNumber } from './format.ts';
import { s, TIER_EN } from './styles.ts';
import { DimensionReactor } from './DimensionReactor.tsx';
import { ActionBar } from './ActionBar.tsx';

function DimensionRow({ d, sacrificeBoost, buyDimension, buyUntilNextTen }: {
  d: DimensionDerived;
  sacrificeBoost: AntimatterSlice['game']['sacrificeBoost'];
  buyDimension: AntimatterSlice['buyDimension'];
  buyUntilNextTen: AntimatterSlice['buyUntilNextTen'];
}) {
  useLanguage();
  if (d.locked) {
    return (
      <div className="adlab-dimension-card is-locked" data-tier={d.tier}>
        <DimensionReactor dimension={d} />
        <div><span>{t('adLabText13', d.tier)}<span style={s.muted}>{TIER_EN[d.tier - 1]} Dimension</span></span>
        <div style={s.muted}><Icon name="lock" size={14} /> {t('adLabText14')}</div></div>
      </div>
    );
  }
  return (
    <div className={`adlab-dimension-card${d.affordable ? ' is-affordable' : ''}`} data-tier={d.tier}>
      <DimensionReactor dimension={d} />
      <div className="adlab-dimension-details">
        <div className="adlab-dimension-title">{t('adLabText13', d.tier)}<span style={s.muted}>{TIER_EN[d.tier - 1]} Dimension</span></div>
        <dl className="adlab-dimension-numbers">
          <div><dt>{t('adOwned')}</dt><dd style={s.big}>{formatNumber(d.amount)}</dd></div>
          <div><dt>{t('adBought')}</dt><dd>{d.bought}</dd></div>
          <div><dt>{t('adProduction')}</dt><dd>{t('adPerSecond', formatNumber(d.productionPerSecond))}</dd></div>
          <div><dt>{t('adMultiplier')}</dt><dd>×{formatNumber(d.multiplier)}</dd></div>
          {d.tier === 8 && <div><dt>Sacrifice</dt><dd>×{formatNumber(sacrificeBoost)}</dd></div>}
          <div><dt>{t('adCost')}</dt><dd>{formatNumber(d.cost)}</dd></div>
        </dl>
        <div style={s.muted}>{t('adLabText16', d.nextMilestoneRemaining)}</div>
        <div className="adlab-dimension-progress" aria-hidden="true"><span style={{ width: `${(10 - d.nextMilestoneRemaining) * 10}%` }} /></div>
      </div>
      <div className="adlab-dimension-buy">
        <button style={s.btn} aria-label={t('adLabText23', d.tier)} disabled={!d.affordable} onClick={() => buyDimension(d.tier)}>{t('adLabText17')}
        </button>
        <button style={s.btn} aria-label={t('adLabText24', d.tier)} disabled={!d.affordable} onClick={() => buyUntilNextTen(d.tier)}>{t('adLabText19')}</button>
      </div>
    </div>
  );
}

const MemoRow = memo(DimensionRow);

function tickspeedText(value: AntimatterSlice['derived']['tickspeedValue']): string {
  return value.exponent >= 4 ? formatNumber(value) : (value.mantissa * 10 ** value.exponent).toFixed(2);
}

export function DimensionList({ ad, notice = () => {} }: { ad: AntimatterSlice; notice?: (message: UiMessage) => void }) {
  useLanguage();
  const { derived, game } = ad;
  return (
    <div className="adlab-dimensions">
      <div className="adlab-tickspeed">
        <div className="adlab-tickspeed-numbers">
          <span className="adlab-number"><Icon name="sparkle" size={16} /> Tickspeed: ×{tickspeedText(derived.tickspeedValue)}</span>
          <span style={s.muted}>{t('adLabText20', derived.tickspeedBought, derived.tickspeedPerPurchase.toFixed(4))}</span>
          <span className="adlab-number" style={s.muted}>{t('adLabText18', formatNumber(derived.tickspeedCost))}</span>
        </div>
        <div className="adlab-tickspeed-buy">
          <button style={s.btn} disabled={!derived.tickspeedAffordable} onClick={() => ad.buyTickspeed()}>{t('adBuyTickspeed')}</button>
          <button style={s.btn} onClick={() => ad.buyMax()}>{t('adLabText22')}</button>
        </div>
      </div>
      <ActionBar ad={ad} notice={notice} />
      {derived.dimensions.map((d) => (
        <MemoRow
          key={d.tier} d={d} sacrificeBoost={game.sacrificeBoost}
          buyDimension={ad.buyDimension} buyUntilNextTen={ad.buyUntilNextTen}
        />
      ))}
    </div>
  );
}
