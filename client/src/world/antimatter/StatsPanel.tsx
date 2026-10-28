import { t, useLanguage } from '../../i18n/index.ts';
import type { AntimatterSlice } from './types.ts';
import { formatDuration, formatFromLog10, formatNumber } from './format.ts';
import { ACHIEVEMENT_DEFS, s } from './styles.ts';
import { LabBanner } from './LabArt.tsx';

export function StatsPanel({ ad, notice }: { ad: AntimatterSlice; notice: (msg: string) => void }) {
  useLanguage();
  const { game } = ad;
  const owned = new Set(game.achievements);
  const playTimeSec = Math.max(0, Math.floor((Date.now() - (game.createdAt || Date.now())) / 1000));
  const defs: { id: string; name: string; desc: string }[] = [...ACHIEVEMENT_DEFS];
  for (const id of game.achievements) {
    if (!defs.some((d) => d.id === id)) defs.push({ id, name: id, desc: '解除済みの実績' });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <LabBanner kind="trophy" eyebrow="YOUR LAB RECORD" title="研究成果、積み上がってる！" description={`実績 ${owned.size} 個を解除。次元を育てて、次の記録に挑もう。`} />
      <div>
        <h3 style={s.sectionTitle}>統計</h3>
        <div style={s.row}>
          <span>累計反物質: {formatNumber(game.totalAntimatter)}</span>
          <span>プレイ時間: {formatDuration(playTimeSec)}</span>
          <span>Boost: {game.dimensionalBoosts} 回</span>
          <span>銀河: {game.galaxies} 個</span>
          <span>Infinity: {game.infinities} 回</span>
          <span>IP: {formatNumber(game.infinityPoints)}</span>
          <span>Tickspeed 購入: {game.tickspeedBought} 回</span>
          <span>Sacrifice 倍率: ×{formatNumber(game.sacrificeBoost)}</span>
        </div>
      </div>
      <div>
        <h3 style={s.sectionTitle}>実績 <span style={s.muted}>（{owned.size}/{defs.length} 解除）</span></h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {defs.map((d) => (
            <div key={d.id} style={{ ...s.row, opacity: owned.has(d.id) ? 1 : 0.65, borderRadius: 10, padding: '10px 12px', background: owned.has(d.id) ? 'linear-gradient(110deg, #234143, #302744)' : '#182238', border: `1px solid ${owned.has(d.id) ? '#78edd95c' : '#66729333'}` }}>
              <span>{owned.has(d.id) ? '🏆' : '🔒'} <b>{d.name}</b></span>
              <span style={s.muted}>{d.desc}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 style={s.sectionTitle}>ランキング</h3>
        {ad.leaderboard.length === 0 ? (
          <p style={s.muted}>ランキングはまだ空です。</p>
        ) : (
          <table style={s.table}>
            <thead><tr><th style={s.num}>#</th><th>名前</th><th style={s.num}>反物質</th><th style={s.num}>Infinity</th><th style={s.num}>プレイ時間</th></tr></thead>
            <tbody>
              {ad.leaderboard.map((e, i) => (
                <tr key={`${e.name}-${i}`} style={e.self ? { fontWeight: 700 } : undefined}>
                  <td style={s.num}>{i + 1}</td>
                  <td>{e.name}</td>
                  <td style={s.num}>{formatFromLog10(e.antimatterLog10)}</td>
                  <td style={s.num}>{e.infinities}</td>
                  <td style={s.num}>{formatDuration(e.playTimeSec)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          <span style={s.muted}>{t('adRankingAuto', ad.activeProfile?.name ?? '')}</span>
          <button style={s.btn} onClick={() => { void ad.refreshLeaderboard().catch(() => notice(t('adRankingFailed'))); }}>{t('adRankingRefresh')}</button>
        </div>
      </div>
    </div>
  );
}
