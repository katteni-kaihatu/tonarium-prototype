import { Fragment, useId, useState } from 'react';
import { Icon } from '../Icon.tsx';
import { groupLeaderboard } from './leaderboard.ts';
import { t, useLanguage, msg, type UiMessage } from '../../i18n/index.ts';
import type { AntimatterSlice } from './types.ts';
import { formatDuration, formatFromLog10 } from './format.ts';
import { s } from './styles.ts';

export function RankingPanel({ ad, notice }: { ad: AntimatterSlice; notice: (message: UiMessage) => void }) {
  useLanguage();
  const [expandedNames, setExpandedNames] = useState<Set<string>>(() => new Set());
  const rankingId = useId();
  const groups = groupLeaderboard(ad.leaderboard);
  const toggle = (name: string) => setExpandedNames(previous => {
    const next = new Set(previous);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });
  return (
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
  );
}
