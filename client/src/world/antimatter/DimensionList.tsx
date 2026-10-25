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
  if (d.locked) {
    return (
      <div className="ad-dimension-card is-locked" data-tier={d.tier}>
        <DimensionReactor dimension={d} />
        <div><span>第{d.tier}次元 <span style={s.muted}>{TIER_EN[d.tier - 1]} Dimension</span></span>
        <div style={s.muted}>🔒 未解放 · Dimension Boost で解放</div></div>
      </div>
    );
  }
  return (
    <div className={`ad-dimension-card${d.affordable ? ' is-affordable' : ''}`} data-tier={d.tier}>
      <DimensionReactor dimension={d} />
      <div className="ad-dimension-details">
        <div className="ad-dimension-title">第{d.tier}次元 <span style={s.muted}>{TIER_EN[d.tier - 1]} Dimension</span></div>
        <div style={s.big}>{formatNumber(d.amount)}</div>
        <div style={s.muted}>
          購入数: {d.bought} · 生産: {formatNumber(d.productionPerSecond)} /秒 · 倍率: {dimensionMultiplierText(d.tier, d.bought, boosts, sacrificeBoost)}
          <br />次の×2まで あと {d.nextMilestoneRemaining} 個
        </div>
        <div className="ad-dimension-progress" aria-hidden="true"><span style={{ width: `${(10 - d.nextMilestoneRemaining) * 10}%` }} /></div>
      </div>
      <div className="ad-dimension-buy">
        <button style={s.btn} aria-label={`第${d.tier}次元を1個買う`} disabled={!d.affordable} onClick={() => buyDimension(d.tier)}>
          1個買う<br /><small>コスト: {formatNumber(d.cost)}</small>
        </button>
        <button style={s.btn} aria-label={`第${d.tier}次元を10個まで買う`} disabled={!d.affordable} onClick={() => buyUntilNextTen(d.tier)}>10個まで買う</button>
      </div>
    </div>
  );
}

const MemoRow = memo(DimensionRow);

export function DimensionList({ ad }: { ad: AntimatterSlice }) {
  const { derived, game } = ad;
  return (
    <div className="ad-dimensions">
      <div style={s.row}>
        <span>🔥 Tickspeed: ×{derived.tickspeedValue >= 10000 ? formatNumber(derived.tickspeedValue) : derived.tickspeedValue.toFixed(2)}</span>
        <span style={s.muted}>購入数: {derived.tickspeedBought} · 1購入あたり ×{derived.tickspeedPerPurchase.toFixed(4)}</span>
        <span style={{ flex: 1 }} />
        <button style={s.btn} disabled={!derived.tickspeedAffordable} onClick={() => ad.buyTickspeed()}>
          Tickspeed を買う（コスト: {formatNumber(derived.tickspeedCost)}）
        </button>
        <button style={s.btn} onClick={() => ad.buyMax()}>Max All（買えるものをすべて買う）</button>
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
