import type { AntimatterSlice } from './types.ts';
import { formatNumber } from './format.ts';
import { s } from './styles.ts';
import { LabArt } from './LabArt.tsx';

export function ActionBar({ ad, notice }: { ad: AntimatterSlice; notice: (msg: string) => void }) {
  const { derived, game } = ad;
  const boost = derived.boost;
  const galaxy = derived.galaxy;
  const sacrifice = derived.sacrifice;
  const infinity = derived.infinity;

  const onGalaxy = () => {
    if (!window.confirm('Antimatter Galaxy を作りますか？反物質・次元・Tickspeed・Dimension Boost がリセットされます。')) return;
    if (ad.antimatterGalaxy()) notice('Antimatter Galaxy！銀河が増え、Tickspeed が強化されました');
  };
  const onBigCrunch = () => {
    if (!window.confirm(`Big Crunch を実行しますか？すべてリセットされ、Infinity Point を +${infinity.gain} 獲得します。`)) return;
    const gained = ad.prestigeInfinity();
    if (gained) notice(`Big Crunch！Infinity Point +${gained} を獲得しました`);
  };
  const onSacrifice = () => {
    if (ad.sacrifice()) notice(`Sacrifice！第8次元の倍率が ×${formatNumber(game.sacrificeBoost)} になりました`);
    else notice('Sacrifice の条件を満たしていません（倍率が現在以上になる場合のみ実行できます）');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ ...s.row, background: 'linear-gradient(105deg, #202d49, #241e3a)', border: '1px solid #8572e64d', borderRadius: 14, padding: 10 }}>
        <LabArt kind="boost" size={64} />
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <b>Dimension Boost / Shift</b>
          <div style={s.muted}>要件: 第{boost.tier}次元 {formatNumber(boost.amount)} 個 · 現在: 第{boost.tier}次元 {formatNumber(boost.currentAmount)} 個 · 現在の Boost: {game.dimensionalBoosts} 回</div>
        </div>
        <span style={{ flex: 1 }} />
        <button style={s.btn} disabled={!boost.can} onClick={() => { if (ad.dimensionalBoost()) notice('Dimension Boost！次元がリセットされ、生産倍率が上がりました'); }}>Boost する</button>
      </div>
      <div style={{ ...s.row, background: 'linear-gradient(105deg, #202d49, #241e3a)', border: '1px solid #8572e64d', borderRadius: 14, padding: 10 }}>
        <LabArt kind="galaxy" size={64} />
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <b>Antimatter Galaxy</b>
          <div style={s.muted}>要件: 第{galaxy.tier}次元 {formatNumber(galaxy.amount)} 個 · 現在: 第{galaxy.tier}次元 {formatNumber(galaxy.currentAmount)} 個 · 現在の銀河: {game.galaxies} 個</div>
        </div>
        <span style={{ flex: 1 }} />
        <button style={s.btn} disabled={!galaxy.can} onClick={onGalaxy}>Galaxy を作る</button>
      </div>
      <div style={{ ...s.row, background: 'linear-gradient(105deg, #202d49, #241e3a)', border: '1px solid #8572e64d', borderRadius: 14, padding: 10 }}>
        <LabArt kind="reactor" size={64} />
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <b>Dimensional Sacrifice</b>
          <div style={s.muted}>
            現在の倍率: ×{formatNumber(sacrifice.boost)}（第8次元） ·{' '}
            {sacrifice.unlocked ? '第1〜7次元を消費して第8次元の倍率を上げる' : `Dimension Boost 5回で解放（現在 ${sacrifice.boosts} 回）`}
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <button style={s.btn} disabled={!(sacrifice.unlocked && sacrifice.can)} onClick={onSacrifice}>Sacrifice する</button>
      </div>
      <div style={{ ...s.row, background: 'linear-gradient(105deg, #202d49, #241e3a)', border: '1px solid #8572e64d', borderRadius: 14, padding: 10 }}>
        <LabArt kind="singularity" size={64} />
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <b>Big Crunch（Infinity）</b>
          <div style={s.muted}>{infinity.can ? `Big Crunch で +${infinity.gain} IP` : '反物質 1.79e308 で Infinity 到達（IP +1）'} · 現在の IP: {formatNumber(game.infinityPoints)} · Infinity 回数: {game.infinities} 回</div>
        </div>
        <span style={{ flex: 1 }} />
        <button style={s.btn} disabled={!infinity.can} onClick={onBigCrunch}>Big Crunch する</button>
      </div>
    </div>
  );
}
