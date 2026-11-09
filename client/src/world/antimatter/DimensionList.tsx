import { t, useLanguage, type UiMessage } from '../../i18n/index.ts';
import { Icon } from '../Icon.tsx';
import { memo, type CSSProperties } from 'react';
import { bigGte, bigMulNumber } from '../../ad/engine.mjs';
import type { AntimatterSlice, BigNum, DimensionDerived } from './types.ts';
import { formatNumber } from './format.ts';
import { TIER_EN } from './styles.ts';
import { DimensionReactor } from './DimensionReactor.tsx';
import { percent, ratio } from './progress.ts';
import { ActionBar } from './ActionBar.tsx';

// 毎 tick 数字が動くとうるさいので、いちばん大きい単位だけを切り上げて出す（秒が動くのは 1 分を切ってから）。
function etaText(antimatter: BigNum, cost: BigNum, etaSeconds: number): string {
  if (bigGte(antimatter, cost)) return t('adUiEtaNow');
  const seconds = Math.ceil(etaSeconds);
  if (!Number.isFinite(seconds)) return t('adUiEtaFar');
  if (seconds < 60) return t('adUiEtaSec', seconds);
  if (seconds < 3600) return t('adUiEtaMin', Math.ceil(seconds / 60));
  if (seconds < 86400) return t('adUiEtaHour', Math.ceil(seconds / 3600));
  const days = Math.ceil(seconds / 86400);
  return days > 9999 ? t('adUiEtaFar') : t('adUiEtaDay', days);
}

function BuyButton({ label, count, cost, antimatter, etaSeconds, reachesDouble, partial, disabled, onClick }: {
  label: string; count: number; cost: BigNum; antimatter: BigNum; etaSeconds: number;
  reachesDouble: boolean; partial: boolean; disabled: boolean; onClick: () => void;
}) {
  const fill = percent(ratio(antimatter, cost));
  const full = bigGte(antimatter, cost);
  const state = full && reachesDouble ? 'is-double' : partial ? 'is-partial' : undefined;
  return (
    <button type="button" className={state} aria-label={label} title={t('adUiFundProgress', fill)} style={{ '--ad-fill': fill } as CSSProperties} disabled={disabled} onClick={onClick}>
      <b>+{count}</b>
      <small className="adlab-number">{formatNumber(cost)}</small>
      <small className="adlab-dim-eta">{etaText(antimatter, cost, etaSeconds)}</small>
    </button>
  );
}

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

function DimensionRow({ d, antimatter, sacrificeBoost, buyDimension, buyUntilNextTen }: {
  d: DimensionDerived;
  antimatter: AntimatterSlice['game']['antimatter'];
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
  // 押せる条件は 1 個買えるかのまま（足りない分は買える数だけ買う）。強調は全部買えるときだけにする。
  const blockAffordable = d.affordable && bigGte(antimatter, blockCost);
  return (
    <div className={`adlab-dim-row${d.affordable ? ' is-affordable' : ''}`} data-tier={d.tier}>
      <DimensionName d={d} />
      <span className="adlab-dim-cell adlab-dim-owned adlab-number" data-label={t('adOwned')}>{formatNumber(d.amount)}</span>
      <span className="adlab-dim-cell adlab-dim-mult adlab-number" data-label={t('adMultiplier')}>
        ×{formatNumber(d.multiplier)}
        {d.tier === 8 && <small>Sacrifice ×{formatNumber(sacrificeBoost)}</small>}
      </span>
      <span className="adlab-dim-cell adlab-dim-prod" data-label={t('adProduction')}>
        <span className="adlab-number">{t('adPerSecond', formatNumber(d.productionPerSecond))}</span>
        <small>{t('adUiMakes', d.tier === 1 ? t('adUiResAntimatter') : t('adLabText13', d.tier - 1))}</small>
      </span>
      <div className="adlab-dim-next" title={t('adLabText16', d.nextMilestoneRemaining)}>
        <div className="adlab-bar" aria-hidden="true"><span style={{ width: `${done * 10}%` }} /></div>
        <span className="adlab-number">{done}/10</span>
      </div>
      <div className="adlab-dim-buy">
        <BuyButton label={t('adLabText23', d.tier)} count={1} cost={d.cost} antimatter={antimatter} etaSeconds={d.purchaseEtaSeconds}
          reachesDouble={d.nextMilestoneRemaining === 1} partial={false} disabled={!d.affordable} onClick={() => buyDimension(d.tier)} />
        <BuyButton label={t('adLabText24', d.tier)} count={d.nextMilestoneRemaining} cost={blockCost} antimatter={antimatter} etaSeconds={d.milestoneEtaSeconds}
          reachesDouble partial={!blockAffordable} disabled={!d.affordable} onClick={() => buyUntilNextTen(d.tier)} />
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
            key={d.tier} d={d} antimatter={game.antimatter} sacrificeBoost={game.sacrificeBoost}
            buyDimension={ad.buyDimension} buyUntilNextTen={ad.buyUntilNextTen}
          />
        ))}
      </div>
    </div>
  );
}
