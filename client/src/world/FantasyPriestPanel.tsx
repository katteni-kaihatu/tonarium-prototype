import { fantasyPriestRankName } from '../../../shared/fantasy-priest-ranks.ts';
import { FantasyMiraclePreparation } from './FantasyMiraclePreparation.tsx';
import type { FantasyAction, FantasyProfile } from '../../../shared/fantasy.ts';
import { FANTASY_QUESTS } from '../../../shared/fantasy-data.ts';
import { FANTASY_PRIEST_BRANCH_CHANGE_COST, fantasyPriestActionError, fantasyPriestDiscoveredBranches, fantasyPriestGrowthStatus, fantasyPriestServiceQuest } from '../../../shared/fantasy-priest-growth.ts';
import { useLocale } from '../locale.ts';
import { useStore } from '../store.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { fantasyPriestTitle } from '../../../shared/fantasy-job-display.ts';
import { FantasyRankBookReward } from './FantasyRankBookReward.tsx';

export function FantasyPriestPanel({ profile, onAction }: { profile: FantasyProfile; onAction: (action: FantasyAction) => void }) {
  const [locale] = useLocale();
  const pending = useStore(state => state.fantasyPending || !state.wsConnected);
  const c = profile.character;
  const t = {
    ko: { title: '성소의 길', wrong: '사제 전용입니다.', faith: '신앙', rank: '성직 등급', service: '봉사', doctrine: '교리 독서', pilgrimage: '성소 순례', vows: '이행한 서약', trust: '이 신전의 신뢰', records: '신앙 기록', active: '맡은 서약', promise: '신전에서 서약하기', release: '서약을 정직하게 철회', choose: '이 길을 선택', change: '이 길로 변경', current: '걷고 있는 길', cost: '무료 · 실제 2분', time: '실제 2분', vowsEmpty: '수락한 봉사 의뢰가 없습니다.' },
    en: { title: 'Paths of the Sanctuary', wrong: 'For priests.', faith: 'Faith', rank: 'Clergy rank', service: 'Service', doctrine: 'Doctrine books', pilgrimage: 'Sanctuaries', vows: 'Fulfilled vows', trust: 'This temple’s trust', records: 'Faith record', active: 'Current vow', promise: 'Swear at a temple', release: 'Honestly release the vow', choose: 'Choose this path', change: 'Change to this path', current: 'Current path', cost: 'Free · 2 real minutes', time: '2 real minutes', vowsEmpty: 'No accepted service contracts.' },
    ja: { title: '聖所の道', wrong: '司祭のための記録です。', faith: '信仰', rank: '聖職等級', service: '奉仕', doctrine: '教理の読書', pilgrimage: '聖所巡礼', vows: '果たした誓い', trust: 'この神殿の信頼', records: '信仰の記録', active: '今の誓い', promise: '神殿で誓う', release: '誓いを正直に辞退', choose: 'この道を選ぶ', change: 'この道へ変更', current: '歩んでいる道', cost: '無料・実時間2分', time: '実時間2分', vowsEmpty: '受注中の奉仕依頼がありません。' },
  }[locale];
  if (!c || c.job !== 'priest') return <p className="fr-muted">{t.wrong}</p>;
  const status = fantasyPriestGrowthStatus(c), growth = c.priestGrowth;
  const blocked = pending || !!profile.activity || !!profile.combatId || !!profile.death;
  const questName = (id: string) => { const q = FANTASY_QUESTS.find(q => q.id === id); return q?.names?.[locale] ?? q?.name ?? id; };
  const button = (action: FantasyAction, label: string) => { const error = fantasyPriestActionError(c, action, locale); return <ReasonButton className="fr-btn" disabled={blocked || !!error} reason={error} onClick={() => onAction(action)}>{label}</ReasonButton>; };
  const vows = c.quests.filter(id => fantasyPriestServiceQuest(id) && !c.completed.includes(id) && !growth?.vows.some(vow => vow.quest === id));
  return <section className="fr-priest-panel">
    <h2>{t.title}</h2>
    <FantasyMiraclePreparation profile={profile} blocked={blocked} onAction={onAction}/>
    <p>{t.faith} {status.faith} · {t.rank} {fantasyPriestRankName(status.clergyGrade,locale)}</p>
    <FantasyRankBookReward c={c} source="priest" blocked={blocked} onAction={onAction}/>
    <details><summary>{t.records}</summary><dl>
      <dt>{t.service}</dt><dd>{status.service}</dd><dt>{t.doctrine}</dt><dd>{status.doctrine}</dd>
      <dt>{t.pilgrimage}</dt><dd>{status.pilgrimage}</dd><dt>{t.vows}</dt><dd>{status.vows}</dd>
      <dt>{t.trust}</dt><dd>{status.templeTrust[c.location] ?? 0}</dd>
    </dl></details>
    <details><summary>{t.active}</summary>
      {growth?.vow ? <p>{questName(growth.vow.quest)} {button({ type: 'priestReleaseVow' }, t.release)}</p> : vows.length ? vows.map(id => <p key={id}>{questName(id)} {button({ type: 'priestVow', quest: id }, t.promise)}</p>) : <p className="fr-muted">{t.vowsEmpty}</p>}
    </details>
    {fantasyPriestDiscoveredBranches(c).map(branch => <details key={branch.id} open={growth?.branch === branch.id}><summary>{fantasyPriestTitle(branch.id,c.gender)[locale]}{growth?.branch === branch.id ? ` · ${t.current}` : ''}</summary>
      <p>{branch.descriptions[locale]}</p>
      {button({ type: 'priestBranch', branch: branch.id }, `${growth?.branch ? t.change : t.choose} · ${growth?.branch ? `${FANTASY_PRIEST_BRANCH_CHANGE_COST}G · ${t.time}` : t.cost}`)}
    </details>)}
  </section>;
}
