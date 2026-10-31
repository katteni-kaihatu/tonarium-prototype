import { useStore } from '../store.ts';
import { requestFantasyParty } from './fantasy-party-transport.ts';
import type { FantasyAction, FantasyCharacter } from '../../../shared/fantasy.ts';
import { fantasyMainApproachStat, fantasyMainInvestigationError, fantasyMainProgress, fantasyMainReady, fantasyMainStage, fantasyMainTrial } from '../../../shared/fantasy-main-trials.ts';
import { fantasyStats } from '../../../shared/fantasy-engine.ts';
import { FANTASY_MAIN_APPROACHES, fantasyMainApproachLabel, fantasyMainGuidance } from '../../../shared/fantasy-main-guidance.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { fantasyErrorText, statLabels } from './fantasy-copy.ts';
import { useLocale } from '../locale.ts';
import { fantasyEnvironmentActionError } from '../../../shared/fantasy-environment.ts';
import { fantasyVoyageScene } from '../../../shared/fantasy-voyage-scenes.ts';
import { FantasyVoyageSceneHistory, FantasyVoyageSceneSetup } from './FantasyVoyageScenes.tsx';
import { FantasyVoyageMoment } from './FantasyVoyageMoment.tsx';
import { fantasyStoryCombatRequirement } from '../../../shared/fantasy-combat-stories.ts';
import { requestFantasyCombat } from './fantasy-combat-transport.ts';

export function FantasyMainInvestigation({ c, quest, blocked, onAction }: { c: FantasyCharacter; quest: string; blocked: boolean; onAction: (action: FantasyAction) => void }) {
  const [locale] = useLocale(), trial = fantasyMainTrial(quest);
  const party=useStore(s=>s.fantasyParty), selfId=useStore(s=>s.selfId), partyPending=useStore(s=>s.fantasyPartyPending);
  const me=party?.members.find(member=>member.id===selfId), grouped=!!party?.id, leader=!!me?.isLeader;
  if (!trial) return null;
  const active = c.quests.includes(quest), stage = fantasyMainStage(c, quest);
  const scene = fantasyVoyageScene(c, quest);
  const combat = stage && fantasyStoryCombatRequirement(c, quest, stage.id);
  const label = { ko: '장 안의 세부 의뢰', en: 'Chapter subquests', ja: '章の小依頼' }[locale];
  const step = fantasyMainProgress(c, quest);
  return <details className="fr-main-investigation"><summary>{label}{active && fantasyMainReady(c, quest) ? ' ✓' : ''} · { { ko: '권장', en: 'Recommended', ja: '推奨' }[locale] } Lv.{trial.recommendedLevel}</summary>
    <p>{fantasyMainGuidance(c, quest, locale)}</p>
    <FantasyVoyageSceneSetup c={c} quest={quest}/>
    <FantasyVoyageMoment c={c} quest={quest} blocked={blocked} onAction={onAction}/>
    {combat && stage?.location === c.location && <article className="fr-story-battle"><p>{combat.setup[locale]}</p><ReasonButton className="fr-btn primary" disabled={blocked||partyPending||grouped&&!leader} reason={grouped&&!leader?{ko:'파티장이 전투를 제안할 수 있습니다.',en:'The leader proposes battles.',ja:'戦闘はリーダーが提案します。'}[locale]:undefined} onClick={() => grouped?requestFantasyParty({type:'readyCombat',source:'story',target:quest}):requestFantasyCombat({ type: 'start', source: 'story', target: quest })}>{{ ko: '막아선 상대와 전투', en: 'Confront the obstacle', ja: '行く手を塞ぐ相手と戦う' }[locale]}</ReasonButton><small>{{ ko: '파티 전투 제안을 보고 참가 여부를 선택하세요.', en: 'Each member responds to the party battle proposal.', ja: 'パーティーの戦闘提案を見て参加するか選んでください。' }[locale]}</small></article>}
    {active && <ol className="fr-subquests">{trial.stages.map((part, index) => <li key={part.id} aria-current={index === step ? 'step' : undefined}>{index < step ? '✓ ' : index === step ? '➜ ' : '◇ '}{index <= step ? part.labels[locale] : { ko: part.id === 'compare' ? '의뢰인과 증거 대조' : '현장 증거 재검증', en: part.id === 'compare' ? 'Cross-check evidence with the issuer' : 'Verify the field evidence', ja: part.id === 'compare' ? '依頼人と証拠を照合' : '現地の証拠を再検証' }[locale]}</li>)}</ol>}
    {active && stage && <div className="fr-action-grid">{FANTASY_MAIN_APPROACHES.map(approach => {
      const action: FantasyAction & { type: 'investigate' } = { type: 'investigate', quest, approach };
      const error = fantasyMainInvestigationError(c, action) ?? fantasyEnvironmentActionError(c, action);
      const stat = statLabels[locale][fantasyMainApproachStat(fantasyStats(c), stage, approach)];
      const risk = { ko: '실패하면 피로가 쌓이며 위험한 현장에서는 다칠 수 있습니다.', en: 'Failure adds fatigue; dangerous field sites can cause injury.', ja: '失敗すると疲労が増え、危険な現場では負傷することがあります。' }[locale];
      return <ReasonButton key={approach} className="fr-btn" title={risk} disabled={blocked || partyPending || !!error || grouped&&!!me?.ready} reason={me?.ready?{ko:"준비를 취소하면 조사 방법을 바꿀 수 있습니다.",en:"Unready to change your approach.",ja:"準備を取り消すと調査方法を変えられます。"}[locale]:error ? fantasyErrorText(error, locale) : undefined} onClick={() => grouped?requestFantasyParty({type:"ready",quest,approach}):onAction(action)}>{scene?.approaches[approach][locale] ?? fantasyMainApproachLabel(stage.kind, approach, locale)} · {stat}</ReasonButton>;
    })}</div>}
    {grouped&&active&&stage&&<div className="fr-action-grid">{me?.ready&&<ReasonButton className="fr-btn" disabled={partyPending} onClick={()=>requestFantasyParty({type:'unready'})}>{{ko:'준비 취소',en:'Unready',ja:'準備を取り消す'}[locale]}</ReasonButton>}{leader&&<ReasonButton className="fr-btn primary" disabled={blocked||partyPending||!party?.canStart} reason={{ko:'같은 조사 현장에서 모두 방법을 선택하고 준비해야 합니다.',en:'Everyone must choose an approach and ready at the same site.',ja:'同じ現場で全員が調査方法を選んで準備してください。'}[locale]} onClick={()=>requestFantasyParty({type:'start'})}>{{ko:'파티 조사 시작',en:'Begin party investigation',ja:'パーティー調査を始める'}[locale]}</ReasonButton>}</div>}
    <FantasyVoyageSceneHistory c={c} quest={quest}/>
  </details>;
}
