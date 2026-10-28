import { Fragment, useId, useState } from 'react';
import { Icon } from '../Icon.tsx';
import { groupLeaderboard } from './leaderboard.ts';
import { t, useLanguage, msg, type UiMessage } from '../../i18n/index.ts';
import type { AntimatterSlice } from './types.ts';
import { formatDuration, formatFromLog10, formatNumber } from './format.ts';
import { ACHIEVEMENT_DEFS, s } from './styles.ts';
import { LabBanner } from './LabArt.tsx';

export function StatsPanel({ ad, notice }: { ad: AntimatterSlice; notice: (message: UiMessage) => void }) {
  useLanguage();
  const { game } = ad;
  const [expandedNames, setExpandedNames] = useState<Set<string>>(() => new Set());
  const rankingId = useId();
  const groups = groupLeaderboard(ad.leaderboard);
  const toggle = (name: string) => setExpandedNames(previous => {
    const next = new Set(previous);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });
  const owned = new Set(game.achievements);
  const playTimeSec = Math.max(0, Math.floor((Date.now() - (game.createdAt || Date.now())) / 1000));
  const defs: { id: string; name: string; desc: string }[] = [...ACHIEVEMENT_DEFS];
  for (const id of game.achievements) {
    if (!defs.some((d) => d.id === id)) defs.push({ id, name: id, desc: t('adLabText57') });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <LabBanner kind="trophy" eyebrow={t('adRecordEyebrow')} title={t('adLabText58')} description={t('adLabText59', owned.size)} />
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
      <div>
        <h3 style={s.sectionTitle}>{t('ui819')}<span style={s.muted}>{t('adLabText51', owned.size, defs.length)}</span></h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {defs.map((d) => (
            <div key={d.id} style={{ ...s.row, opacity: owned.has(d.id) ? 1 : 0.65, borderRadius: 10, padding: '10px 12px', background: owned.has(d.id) ? 'linear-gradient(110deg, #234143, #302744)' : '#182238', border: `1px solid ${owned.has(d.id) ? '#78edd95c' : '#66729333'}` }}>
              <span>{owned.has(d.id) ? '🏆' : '🔒'} <b>{d.name}</b></span>
              <span style={s.muted}>{d.desc}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="ad-ranking">
        <h3 style={s.sectionTitle}>{t('adLabText52')}</h3>
        {groups.length === 0 ? (
          <p style={s.muted}>{t('adLabText53')}</p>
        ) : (
          <div className="ad-ranking-scroll" role="region" aria-label={t('adRankingScroll')} tabIndex={0}>
            <table style={s.table} className="ad-ranking-table">
              <thead><tr><th scope="col" style={s.num}>{t('adRankingRank')}</th><th scope="col">{t('adLabText54')}</th><th scope="col" style={s.num}>{t('adLabText55')}</th><th scope="col" style={s.num}>{t('adRankingBoost')}</th><th scope="col" style={s.num}>{t('adRankingInfinity')}</th><th scope="col" style={s.num}>{t('adLabText56')}</th></tr></thead>
              {groups.map(({ rank, representative: e, records, hasSelfInRecords }, index) => {
                const expanded = expandedNames.has(e.name);
                const recordsId = `${rankingId}-records-${index}`;
                const buttonId = `${recordsId}-toggle`;
                return <Fragment key={e.name}>
                  <tbody>
                    <tr className={e.self ? 'ad-ranking-self' : undefined}>
                      <td style={s.num} className="ad-ranking-rank">{rank}</td>
                      <th scope="row" className="ad-ranking-name">
                        <span>{e.name}</span>
                        {e.self && <span className="ad-ranking-badge"><Icon name="user" size={14} />{t('adRankingSelf')}</span>}
                        {hasSelfInRecords && <span className="ad-ranking-badge"><Icon name="user" size={14} />{t('adRankingContainsSelf')}</span>}
                        {records.length > 0 && <div className="ad-ranking-controls">
                          <span style={s.muted}>{t('adRankingRecordCount', records.length + 1)}</span>
                          <button type="button" id={buttonId} style={s.btn} aria-expanded={expanded} aria-controls={recordsId} aria-label={t(expanded ? 'adRankingCollapseLabel' : 'adRankingExpandLabel', e.name)} onClick={() => toggle(e.name)}>
                            <Icon name={expanded ? 'up' : 'down'} size={14} />{t(expanded ? 'adRankingCollapse' : 'adRankingExpand')}
                          </button>
                        </div>}
                      </th>
                      <td style={s.num}>{formatFromLog10(e.antimatterLog10)}</td>
                      <td style={s.num}>{e.dimensionalBoosts === undefined ? t('adRankingUnavailable') : e.dimensionalBoosts}</td>
                      <td style={s.num}>{e.infinities}</td>
                      <td style={s.num}>{formatDuration(e.playTimeSec)}</td>
                    </tr>
                  </tbody>
                  {records.length > 0 && <tbody id={recordsId} hidden={!expanded} aria-labelledby={buttonId}>
                    {records.map((record, childIndex) => <tr key={childIndex} className={`ad-ranking-child${record.self ? ' ad-ranking-self' : ''}`}>
                      <td />
                      <th scope="row" className="ad-ranking-name"><span>{record.name}</span>{record.self && <span className="ad-ranking-badge"><Icon name="user" size={14} />{t('adRankingSelf')}</span>}</th>
                      <td style={s.num}>{formatFromLog10(record.antimatterLog10)}</td>
                      <td style={s.num}>{record.dimensionalBoosts === undefined ? t('adRankingUnavailable') : record.dimensionalBoosts}</td>
                      <td style={s.num}>{record.infinities}</td>
                      <td style={s.num}>{formatDuration(record.playTimeSec)}</td>
                    </tr>)}
                  </tbody>}
                </Fragment>;
              })}
            </table>
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          <span style={s.muted}>{t('adRankingAuto', ad.activeProfile?.name ?? '')}</span>
          <button type="button" style={s.btn} onClick={() => { void ad.refreshLeaderboard().catch(() => notice(msg('adRankingFailed'))); }}>{t('adRankingRefresh')}</button>
        </div>
      </div>
    </div>
  );
}
