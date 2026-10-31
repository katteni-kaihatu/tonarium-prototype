import { useCallback, useEffect, useRef } from 'react';
import { get, useStore } from '../store.ts';
import { useLocale } from '../locale.ts';
import { fantasyPrivateMessagesAllowed } from './fantasy-account-state.ts';

type State = Pick<ReturnType<typeof get>, 'wsConnected' | 'selfId' | 'joined' | 'wsReady' | 'session' | 'worldBy'>;
export const fantasyRankingRequestAllowed = (state: State) => !!state.wsConnected && fantasyPrivateMessagesAllowed(state) && !!state.session && state.worldBy[state.session] === 'fantasy';
export function FantasyRankingPanel() {
  const [locale] = useLocale(), rows = useStore(state => state.fantasyRanking), available = useStore(fantasyRankingRequestAllowed), self = useStore(state => state.selfId), session = useStore(state => state.session);
  const requestedAt = useRef(0);
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  const request = useCallback(() => {
    const state = get(), now = Date.now();
    if (!fantasyRankingRequestAllowed(state) || now - requestedAt.current < 1000) return;
    requestedAt.current = now;
    void import('../net/ws.ts').then(({ send }) => { const current = get(); if (fantasyRankingRequestAllowed(current) && current.selfId === state.selfId && current.session === state.session) send({ t: 'fantasyRankingRequest' }); });
  }, []);
  useEffect(() => { requestedAt.current = 0; request(); }, [available, self, session, request]);
  const cell = { padding: '10px 8px', textAlign: 'left' as const, borderBottom: '1px solid var(--fr-border, #454c48)' };
  return <section className="fr-ranking"><div className="fr-form-row"><h2>{say('랭킹', 'Rankings', 'ランキング')} TOP 10</h2><button className="fr-btn" disabled={!available} onClick={request}>{say('새로고침', 'Refresh', '更新')}</button></div>
    {!available ? <p>{say('서버 연결을 기다리고 있어요.', 'Waiting for the server connection.', 'サーバーへの接続を待っています。')}</p> : rows === null ? <p role="status">{say('랭킹을 불러오는 중…', 'Loading rankings…', 'ランキングを読み込み中…')}</p> : !rows.length ? <p>{say('아직 기록이 없습니다.', 'No records yet.', 'まだ記録がありません。')}</p> : <div style={{ overflowX: 'auto' }}><table aria-label={say('상위 10명', 'Top ten', '上位10人')} style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{[say('닉네임', 'Nickname', 'ニックネーム'), say('종족', 'Race', '種族'), say('직업', 'Profession', '職業'), say('점수', 'Score', '点数')].map(title => <th key={title} scope="col" style={cell}>{title}</th>)}</tr></thead><tbody>{rows.slice(0, 10).map((row, index) => <tr key={index}><td style={cell}><span aria-hidden="true">{index + 1}. </span>{row.nickname}</td><td style={cell}>{row.race[locale]}</td><td style={cell}>{row.job[locale]}</td><td style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.score.toLocaleString(locale)}</td></tr>)}</tbody></table></div>}
  </section>;
}
