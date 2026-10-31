import type { FantasyAction, FantasyCharacter } from '../../../shared/fantasy.ts';
import { FANTASY_ADVENTURER_POWER_THRESHOLDS, FANTASY_GUILD_RANKS, fantasyGuildRankName } from '../../../shared/fantasy-adventurer.ts';
import { FANTASY_GUILD_PROMOTION_QUESTS, fantasyGuildProgress, fantasyCanRegisterGuild } from '../../../shared/fantasy-guild-progression.ts';
import { fantasyBuildings } from '../../../shared/fantasy-town.ts';
import { fantasyFacilityOpen } from '../../../shared/fantasy-facility-hours.ts';
import { useLocale } from '../locale.ts';
import { useStore } from '../store.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { gameClock } from './fantasy-copy.ts';
import { FantasyRankBookReward } from './FantasyRankBookReward.tsx';

export function FantasyGuildAssessment({ c, onAction, blocked }: { c: FantasyCharacter; onAction: (action: FantasyAction) => void; blocked: boolean }) {
  const [locale] = useLocale();
  const connected = useStore(state => state.wsConnected);
  const hour = useStore(state => state.fantasyClock?.hour) ?? c.hour;
  if (!fantasyCanRegisterGuild(c)) return null;
  const t = {
    ko: { title: '모험가 승급 심사', current: '등록 등급', progress: '현재 등급 의뢰 완료·보고', next: '다음 등급', power: '필요 전투력', max: '최고 등급에 도달했습니다.', quests: '현재 등급의 의뢰 5개를 완료하고 보고해 주세요.', score: '최근 심사 전투력', assessed: '최근 심사', assess: '코퍼로 등록하기', reassess: '다음 등급 승급 심사', help: '모두 코퍼 (1)에서 시작합니다. 현재 등급의 서로 다른 의뢰 5개를 완료·보고한 뒤, 전투력 심사를 통과하면 한 등급 승급합니다. 상위·하위 등급 의뢰, 포기·기한 만료는 실적에 포함되지 않습니다. 승급 후 실적은 새로 쌓으며 강등은 없습니다.', ranks: '등급 순서', guild: '현재 지역의 열린 길드에서 심사받을 수 있습니다.', living: '회복한 뒤 심사받으세요.', disconnected: '서버 연결을 기다리고 있습니다.' },
    en: { title: 'Adventurer promotion test', current: 'Registered rank', progress: 'Current-rank quests completed and reported', next: 'Next rank', power: 'Required combat power', max: 'You have reached the highest rank.', quests: 'Complete and report 5 quests of your current rank.', score: 'Last assessed combat power', assessed: 'Last assessment', assess: 'Register as Copper', reassess: 'Test for the next rank', help: 'Everyone starts at Copper (1). Complete and report 5 different quests of your current rank, then pass a combat-power assessment to advance one rank. Higher or lower rank quests, abandonment and expiry do not count. Progress resets after promotion; ranks never decrease.', ranks: 'Rank order', guild: 'Visit an open local guild for an assessment.', living: 'Recover before requesting an assessment.', disconnected: 'Waiting for the server connection.' },
    ja: { title: '冒険者の昇格審査', current: '登録等級', progress: '現在の等級の達成・報告数', next: '次の等級', power: '必要な戦闘力', max: '最高等級に達しています。', quests: '現在の等級の依頼を5件達成・報告してください。', score: '前回審査時の戦闘力', assessed: '前回の審査', assess: 'カッパーとして登録', reassess: '次の等級の昇格審査', help: '全員カッパー (1)から始まります。現在の等級の異なる依頼を5件達成・報告し、戦闘力審査に合格すると一段昇格します。上位・下位の依頼や放棄・期限切れは実績になりません。昇格後は実績を積み直し、降格はありません。', ranks: '等級の順序', guild: '現地の開いているギルドで審査を受けられます。', living: '回復してから審査を受けてください。', disconnected: 'サーバーへの接続を待っています。' },
  }[locale];
  const onRoad = !!c.travelPosition && c.travelPosition.from !== c.travelPosition.to && c.travelPosition.fraction > 0 && c.travelPosition.fraction < 1;
  const atGuild = !onRoad && !c.dungeon?.active && fantasyBuildings(c).some(building => building.id === 'guild') && fantasyFacilityOpen('guild', hour);
  const progress = fantasyGuildProgress(c);
  const reason = !connected ? t.disconnected : !atGuild ? t.guild : c.hp <= 0 ? t.living : progress.grade === 8 ? t.max : c.guildProgress && progress.completedAtGrade < FANTASY_GUILD_PROMOTION_QUESTS ? t.quests : undefined;
  const assessment = c.guildAssessment;
  return <section className="fr-card">
    <h3>{t.title}</h3>
    <p role="status" aria-atomic="true">{t.current}: <strong>{fantasyGuildRankName(progress.grade, locale)}</strong></p>
    <p>{t.progress}: <strong>{progress.completedAtGrade}/{FANTASY_GUILD_PROMOTION_QUESTS}</strong></p>
    {progress.grade < 8 ? <p>{t.next}: <strong>{fantasyGuildRankName((progress.grade + 1) as typeof progress.grade, locale)}</strong> · {t.power}: {FANTASY_ADVENTURER_POWER_THRESHOLDS[progress.grade]}</p> : <p>{t.max}</p>}
    {assessment && <p className="fr-muted">{t.score}: {assessment.score}<br />{t.assessed}: {gameClock(assessment.assessedAt, locale)}</p>}
    <p>{t.help}</p>
    <ReasonButton type="button" className="fr-btn" disabled={blocked || !!reason} reason={blocked ? undefined : reason} onClick={() => onAction({ type: 'guildAssess' })}>{c.guildProgress ? t.reassess : t.assess}</ReasonButton>
    <details className="fr-fold"><summary>{t.ranks}</summary><ol>{FANTASY_GUILD_RANKS.map(rank => <li key={rank.grade}>{fantasyGuildRankName(rank.grade, locale)}</li>)}</ol></details>
    <FantasyRankBookReward c={c} source="adventurer" blocked={blocked} onAction={onAction}/>
  </section>;
}
