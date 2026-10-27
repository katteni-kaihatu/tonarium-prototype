import { ReasonButton } from './FantasyActionButton.tsx';
import type { FantasyAction, FantasyCharacter, FantasyQuest } from '../../../shared/fantasy.ts';
import { FANTASY_ITEMS, FANTASY_QUESTS } from '../../../shared/fantasy-data.ts';
import { fantasyQuestEligible } from '../../../shared/fantasy-access.ts';
import { FANTASY_TERMS } from '../../../shared/fantasy-lore.ts';
import { fantasyQuestText } from '../../../shared/fantasy-narrative.ts';
import { fantasyKnownLocations } from '../../../shared/fantasy-town.ts';
import { fantasyContractIssuer, fantasyPersonalQuest } from '../../../shared/fantasy-contracts.ts';
import { NPC_PUBLIC } from '../../../shared/npc.ts';
import { FANTASY_MONSTERS } from '../../../shared/fantasy-monsters.ts';
import { useLocale } from '../locale.ts';
import { fantasyMainProgress, fantasyMainReady, fantasyMainTrial } from '../../../shared/fantasy-main-trials.ts';
import { fantasyTaskObjective, fantasyTaskObjectiveLabel, fantasyTaskProgress, fantasyTaskReady } from '../../../shared/fantasy-task-progress.ts';
import { FantasyMainInvestigation } from './FantasyMainInvestigation.tsx';
import { FantasyEscortPanel } from './FantasyEscortPanel.tsx';
import { FantasyVoyageEnding } from './FantasyVoyageEnding.tsx';
import { FANTASY_ISLE_STORY_TITLE } from '../../../shared/fantasy-isle-story.ts';

export function FantasyQuestBoard({ c, building, onAction, onSelect, blocked }: { c: FantasyCharacter; building?: string; onAction: (a: FantasyAction) => void; onSelect?: (id: string) => void; blocked: boolean }) {
  const [locale] = useLocale(), known = fantasyKnownLocations(c);
  const t = {
    ko: { title: '받은 의뢰', personal: '이어지는 이야기', main: '메인 퀘스트', normal: '일반 의뢰', active: '진행 중', destination: '목적지', unknown: '미지의 장소', giver: '의뢰인', reward: '보상', deliver: '보고·납품', accept: '수락', empty: '받은 의뢰가 없습니다.', story: '의뢰 내용', abandon: '포기', expired: '기한 만료', left: '남은 시간', hunt: '토벌', unmet: '필요 물품이나 의뢰 목표가 부족합니다.', proof: '장 안의 세부 의뢰를 순서대로 마쳐야 합니다.', return: '의뢰인이 있는 곳으로 돌아가세요.', locked: '의뢰를 받을 조건이 맞지 않습니다.' },
    en: { title: 'Accepted quests', personal: 'Your unfolding story', main: 'Main quests', normal: 'Ordinary contracts', active: 'Active', destination: 'Destination', unknown: 'Unknown place', giver: 'Issuer', reward: 'Reward', deliver: 'Report / deliver', accept: 'Accept', empty: 'You have no accepted quests.', story: 'Contract details', abandon: 'Abandon', expired: 'Expired', left: 'Time left', hunt: 'Hunt', unmet: 'Required goods or objectives are incomplete.', proof: 'Finish the chapter’s subquests in order.', return: 'Return to the issuer first.', locked: 'The quest conditions are not met.' },
    ja: { title: '受注した依頼', personal: '続く物語', main: 'メインクエスト', normal: '一般の依頼', active: '進行中', destination: '目的地', unknown: '未知の場所', giver: '依頼人', reward: '報酬', deliver: '報告・納品', accept: '受ける', empty: '受注した依頼はありません。', story: '依頼の内容', abandon: '放棄', expired: '期限切れ', left: '残り時間', hunt: '討伐', unmet: '必要な品物か依頼の目標が未達成です。', proof: '章の小依頼を順番に終えてください。', return: '先に依頼人のいる場所へ戻ってください。', locked: '依頼の条件が整っていません。' },
  }[locale];
  const name = (id: string) => FANTASY_TERMS.find(term => term.id === id)?.names[locale] ?? FANTASY_ITEMS.find(item => item.id === id)?.names?.[locale] ?? id;
  const quests = FANTASY_QUESTS.filter(q => building ? fantasyPersonalQuest(q) && q.giver === c.location && (q.building ? q.building === building : NPC_PUBLIC.find(npc => npc.id === fantasyContractIssuer(q))?.building === building) && !c.completed.includes(q.id) && fantasyQuestEligible(c, q) : c.quests.includes(q.id));
  if (building && !quests.length) return null;
  const card = (q: FantasyQuest) => {
    const active = c.quests.includes(q.id), grant = c.contracts?.[q.id], expired = !!grant && grant.expiresAt <= c.hour;
    const reportAt = q.reportAt ?? q.giver, requiredLocation = active ? reportAt : q.giver;
    const issuer = NPC_PUBLIC.find(npc => npc.id === (grant?.issuer ?? fantasyContractIssuer(q)));
    const have = c.inventory[q.item] ?? 0, available = have - (Object.values(c.equipment ?? {}).includes(q.item) || c.outfit === q.item ? 1 : 0);
    const task = fantasyTaskObjective(q);
    const ready = task ? fantasyTaskReady(c, q) : q.objective?.type === 'hunt' ? (grant?.progress ?? 0) >= q.objective.count : available >= q.count && c.visited.includes(q.destination) && (!q.chapter || fantasyMainReady(c, q.id));
    const text = fantasyQuestText(q, locale), destination = `${t.destination}: ${known.includes(q.destination) ? name(q.destination) : t.unknown}`;
    const reason = expired ? t.expired : !fantasyQuestEligible(c, q) ? t.locked : c.location !== requiredLocation ? (q.reportAt ? { ko: '지정된 현장 보고 장소로 이동하세요.', en: 'Go to the designated field reporting site.', ja: '指定された現地報告の場所へ移動してください。' }[locale] : t.return) : q.chapter && !fantasyMainReady(c, q.id) ? t.proof : t.unmet;
    return <article className="fr-card" key={q.id}>
      {!q.chapter && <div className="fr-section-title"><h3>{text.name}</h3>{active && <span className="fr-tag">{expired ? t.expired : t.active}</span>}</div>}
      {onSelect && known.includes(q.destination) ? <ReasonButton className="fr-text-button" onClick={() => onSelect(q.destination)}>{destination} ↗</ReasonButton> : <p>{destination}</p>}
      <p className="fr-muted">{t.giver}: {issuer?.name[locale] ?? name(q.giver)} · {known.includes(q.giver) ? name(q.giver) : t.unknown}</p>
      {q.reportAt && <p className="fr-muted">{{ ko: '현장 마무리', en: 'Finish on site', ja: '現地で仕上げる' }[locale]}: {known.includes(reportAt) ? name(reportAt) : t.unknown}</p>}
      <details><summary>{t.story}</summary><p>{known.includes(q.destination) ? q.dialogue?.[locale] ?? text.description : t.unknown}</p></details>
      <FantasyMainInvestigation c={c} quest={q.id} blocked={blocked} onAction={onAction}/>
      <p>{task ? `${fantasyTaskObjectiveLabel(q, locale)} · ${fantasyTaskProgress(c, q)} / ${task.count}` : q.objective?.type === 'hunt' ? `${t.hunt}: ${FANTASY_MONSTERS.find(monster => q.objective?.type === 'hunt' && monster.id === q.objective.monster)?.names[locale] ?? t.hunt} ${Math.min(grant?.progress ?? 0, q.objective.count)} / ${q.objective.count}` : `${name(q.item)} ${Math.min(have, q.count)} / ${q.count}`}</p>
      <small>{t.reward} {grant?.gold ?? q.gold} G · {q.xp} XP{grant && ` · ${expired ? t.expired : `${t.left} ${Math.max(0, grant.expiresAt - c.hour).toFixed(1)} h`}`}</small>
      <div className="fr-action-grid"><ReasonButton className="fr-btn" disabled={blocked || expired || !fantasyQuestEligible(c, q) || c.location !== requiredLocation || active && !ready} reason={blocked ? undefined : reason} onClick={() => onAction({ type: active ? 'complete' : 'accept', quest: q.id })}>{active ? q.completionLabel?.[locale] ?? t.deliver : t.accept}</ReasonButton>{active && <ReasonButton className="fr-text-button" disabled={blocked} onClick={() => onAction({ type: 'abandon', quest: q.id })}>{t.abandon}</ReasonButton>}</div>
    </article>;
  };
  const main = quests.filter(q => q.chapter), normal = quests.filter(q => !q.chapter);
  return <><h2>{building ? t.personal : t.title}</h2>{!quests.length && !building && !c.escort && !c.completed.includes('main-night-18') && <p>{t.empty}</p>}
    {!building && <FantasyVoyageEnding c={c} blocked={blocked} onAction={onAction} onSelect={onSelect}/>}
    {!!main.length && <details className="fr-fold fr-main-quests" open><summary>{t.main} · {FANTASY_ISLE_STORY_TITLE[locale]} · {main.length}</summary>{main.map(q => {
      const trial = fantasyMainTrial(q.id);
      return <details className="fr-quest-chapter" key={q.id}><summary>{fantasyQuestText(q, locale).name}{trial && ` · ${fantasyMainProgress(c, q.id)}/${trial.stages.length}`}</summary>{card(q)}</details>;
    })}</details>}
    {!!normal.length && <details className="fr-fold fr-ordinary-quests" open><summary>{t.normal} · {normal.length}</summary>{normal.map(card)}</details>}
    {!building && <FantasyEscortPanel c={c} blocked={blocked} onAction={onAction} onSelect={onSelect}/>}
  </>;
}
