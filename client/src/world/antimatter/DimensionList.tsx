import { t, useLanguage, type UiMessage } from '../../i18n/index.ts';
import { Icon } from '../Icon.tsx';
import { memo } from 'react';
import { bigMulNumber } from '../../ad/engine.mjs';
import type { AntimatterSlice, DimensionDerived } from './types.ts';
import { formatNumber } from './format.ts';
import { TIER_EN } from './styles.ts';
import { DimensionReactor } from './DimensionReactor.tsx';
import { ActionBar } from './ActionBar.tsx';

function DimensionName({ d }: { d: DimensionDerived }) {
  return (
    <div className="adlab-dim-name">
      <span className="adlab-dim-icon"><DimensionReactor dimension={d} /></span>
      <span className="adlab-dim-title">
        <b title={`${TIER_EN[d.tier - 1]} Dimension`}>{t('adLabText13', d.tier)}</b>
        {!d.locked && <span className="adlab-dim-sub">{t('adUiBoughtCount', d.bought)}</span>}
      </span>
    </div>
  );
}

function DimensionRow({ d, sacrificeBoost, buyDimension, buyUntilNextTen }: {
  d: DimensionDerived;
  sacrificeBoost: AntimatterSlice['game']['sacrificeBoost'];
  buyDimension: AntimatterSlice['buyDimension'];
  buyUntilNextTen: AntimatterSlice['buyUntilNextTen'];
}) {
  useLanguage();
  if (d.locked) {
    return (
      <div className="adlab-dim-row is-locked" data-tier={d.tier}>
        <DimensionName d={d} />
        <div className="adlab-dim-locked"><Icon name="lock" size={14} /> {t('adLabText14')}</div>
      </div>
    );
  }
  // 1 ブロック（10 個）の中は単価が同じなので、次の ×2 までの費用は単価 × 残り個数になる。
  const blockCost = bigMulNumber(d.cost, d.nextMilestoneRemaining);
  const done = 10 - d.nextMilestoneRemaining;
  return (
    <div className={`adlab-dim-row${d.affordable ? ' is-affordable' : ''}`} data-tier={d.tier}>
      <DimensionName d={d} />
      <span className="adlab-dim-cell adlab-dim-owned adlab-number" data-label={t('adOwned')}>{formatNumber(d.amount)}</span>
      <span className="adlab-dim-cell adlab-dim-mult adlab-number" data-label={t('adMultiplier')}>
        ×{formatNumber(d.multiplier)}
        {d.tier === 8 && <small>Sacrifice ×{formatNumber(sacrificeBoost)}</small>}
      </span>
      <span className="adlab-dim-cell adlab-dim-prod adlab-number" data-label={t('adProduction')}>{t('adPerSecond', formatNumber(d.productionPerSecond))}</span>
      <div className="adlab-dim-next" title={t('adLabText16', d.nextMilestoneRemaining)}>
        <div className="adlab-bar" aria-hidden="true"><span style={{ width: `${done * 10}%` }} /></div>
        <span className="adlab-number">{done}/10</span>
      </div>
      <div className="adlab-dim-buy">
        <button type="button" aria-label={t('adLabText23', d.tier)} disabled={!d.affordable} onClick={() => buyDimension(d.tier)}>
          <b>+1</b><small className="adlab-number">{formatNumber(d.cost)}</small>
        </button>
        <button type="button" aria-label={t('adLabText24', d.tier)} disabled={!d.affordable} onClick={() => buyUntilNextTen(d.tier)}>
          <b>+{d.nextMilestoneRemaining}</b><small className="adlab-number">{formatNumber(blockCost)}</small>
        </button>
      </div>
    </div>
  );
}

const MemoRow = memo(DimensionRow);

export function DimensionList({ ad, notice = () => {} }: { ad: AntimatterSlice; notice?: (message: UiMessage) => void }) {
  useLanguage();
  const { derived, game } = ad;
  return (
    <div className="adlab-dimensions">
      <ActionBar ad={ad} notice={notice} />
      <div className="adlab-dim-table">
        <div className="adlab-dim-row adlab-dim-header" aria-hidden="true">
          <span>{t('adUiColDim')}</span>
          <span className="adlab-dim-cell">{t('adOwned')}</span>
          <span className="adlab-dim-cell">{t('adMultiplier')}</span>
          <span className="adlab-dim-cell">{t('adProduction')}</span>
          <span>{t('adUiColNext')}</span>
          <span className="adlab-dim-cell">{t('adUiColBuy')}</span>
        </div>
        {derived.dimensions.map((d) => (
          <MemoRow
            key={d.tier} d={d} sacrificeBoost={game.sacrificeBoost}
            buyDimension={ad.buyDimension} buyUntilNextTen={ad.buyUntilNextTen}
          />
        ))}
      </div>
    </div>
  );
}
