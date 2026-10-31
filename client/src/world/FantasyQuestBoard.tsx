import { fantasyCombatEnemy } from '../../../shared/fantasy-combat-catalog.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import type { FantasyAction, FantasyCharacter, FantasyQuest } from '../../../shared/fantasy.ts';
import { FANTASY_ITEMS, FANTASY_QUESTS } from '../../../shared/fantasy-data.ts';
import { fantasyQuestEligible } from '../../../shared/fantasy-access.ts';
import { FANTASY_TERMS } from '../../../shared/fantasy-lore.ts';
import { fantasyQuestText } from '../../../shared/fantasy-narrative.ts';
import { fantasyKnownLocations } from '../../../shared/fantasy-town.ts';
import { FANTASY_CONTRACT_DEADLINE_HOURS, FANTASY_CONTRACT_RAID_WAITING_DEADLINE, fantasyContractHunt, fantasyContractIssuer, fantasyContractMode, fantasyPersonalQuest } from '../../../shared/fantasy-contracts.ts';
import { fantasyGuildRankName } from '../../../shared/fantasy-adventurer.ts';
import { fantasyQuestGrade } from '../../../shared/fantasy-quest-grades.ts';
import { NPC_PUBLIC } from '../../../shared/npc.ts';
import { FANTASY_MONSTERS } from '../../../shared/fantasy-monsters.ts';
import { useLocale } from '../locale.ts';
import { useStore } from '../store.ts';
import { gameClock } from './fantasy-copy.ts';
import { fantasyMainProgress, fantasyMainReady, fantasyMainTrial } from '../../../shared/fantasy-main-trials.ts';
import { fantasyTaskObjective, fantasyTaskObjectiveLabel, fantasyTaskProgress, fantasyTaskReady } from '../../../shared/fantasy-task-progress.ts';
import { FantasyMainInvestigation } from './FantasyMainInvestigation.tsx';
import { FantasyEscortPanel } from './FantasyEscortPanel.tsx';
import { FantasyVoyageEnding } from './FantasyVoyageEnding.tsx';
import { FANTASY_ISLE_STORY_TITLE } from '../../../shared/fantasy-isle-story.ts';

export function FantasyQuestBoard({ c, building, onAction, onSelect, blocked }: { c: FantasyCharacter; building?: string; onAction: (a: FantasyAction) => void; onSelect?: (id: string) => void; blocked: boolean }) {
  const [locale] = useLocale(), known = fantasyKnownLocations(c);
  const worldHour = useStore(state => state.fantasyClock?.hour);
  const selfId = useStore(state => state.selfId), party = useStore(state => state.fantasyParty);
  const hour = Math.max(c.hour, worldHour ?? c.hour);
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  const t = {
    ko: { title: '받은 의뢰', personal: '이어지는 이야기', main: '메인 퀘스트', normal: '일반 의뢰', active: '진행 중', destination: '목적지', unknown: '미지의 장소', giver: '의뢰인', reward: '보상', deliver: '보고·납품', accept: '수락', empty: '받은 의뢰가 없습니다.', story: '의뢰 내용', abandon: '포기', expired: '기한 만료', left: '남은 시간', hunt: '토벌', unmet: '필요 물품이나 의뢰 목표가 부족합니다.', proof: '장 안의 세부 의뢰를 순서대로 마쳐야 합니다.', return: '의뢰인이 있는 곳으로 돌아가세요.', locked: '의뢰를 받을 조건이 맞지 않습니다.' },
    en: { title: 'Accepted quests', personal: 'Your unfolding story', main: 'Main quests', normal: 'Ordinary contracts', active: 'Active', destination: 'Destination', unknown: 'Unknown place', giver: 'Issuer', reward: 'Reward', deliver: 'Report / deliver', accept: 'Accept', empty: 'You have no accepted quests.', story: 'Contract details', abandon: 'Abandon', expired: 'Expired', left: 'Time left', hunt: 'Hunt', unmet: 'Required goods or objectives are incomplete.', proof: 'Finish the chapter’s subquests in order.', return: 'Return to the issuer first.', locked: 'The quest conditions are not met.' },
    ja: { title: '受注した依頼', personal: '続く物語', main: 'メインクエスト', normal: '一般の依頼', active: '進行中', destination: '目的地', unknown: '未知の場所', giver: '依頼人', reward: '報酬', deliver: '報告・納品', accept: '受ける', empty: '受注した依頼はありません。', story: '依頼の内容', abandon: '放棄', expired: '期限切れ', left: '残り時間', hunt: '討伐', unmet: '必要な品物か依頼の目標が未達成です。', proof: '章の小依頼を順番に終えてください。', return: '先に依頼人のいる場所へ戻ってください。', locked: '依頼の条件が整っていません。' },
  }[locale];
  const name = (id: string) => FANTASY_TERMS.find(term => term.id === id)?.names[locale] ?? FANTASY_ITEMS.find(item => item.id === id)?.names?.[locale] ?? id;
  const quests = FANTASY_QUESTS.filter(q => building ? fantasyPersonalQuest(q) && q.giver === c.location && (q.building ? q.building === building : NPC_PUBLIC.find(npc => npc.id === fantasyContractIssuer(q))?.building === building) && !c.completed.includes(q.id) && fantasyQuestEligible(c, q) : c.quests.includes(q.id));
  if (building && !quests.length) return null;
  const card = (q: FantasyQuest) => {
    const active = c.quests.includes(q.id), grant = c.contracts?.[q.id];
    const record = c.contractParties?.[q.id], shared = active && !!record && !record.paid, supporter = shared && record.owner !== selfId;
    const representative = party?.members.find(member => member.id === record?.owner)?.name ?? say('의뢰 대표', 'Contract holder', '依頼の代表');
    const sharedReason = say('보고와 납품은 의뢰 대표가 맡습니다. 자신의 참가만 취소할 수 있습니다.', 'The contract holder handles reporting and delivery. You may leave your own participation.', '報告と納品は依頼の代表が行います。自分の同行だけを取りやめられます。');
    const isHunt = active && q.objective?.type === 'hunt';
    const startsAt = isHunt && fantasyContractMode(q) === 'raid' ? grant?.startsAt : undefined;
    const startedAt = grant?.startedAt;
    const scheduled = startsAt !== undefined;
    const waiting = scheduled && startedAt === undefined;
    const expired = !!grant && !waiting && grant.expiresAt <= hour;
    const hunt = isHunt ? fantasyContractHunt(q) : undefined;
    const grade = grant?.grade ?? fantasyQuestGrade(q);
    const monster = hunt ? FANTASY_MONSTERS.find(monster => monster.id === hunt.monster) : undefined;
    const status = expired ? t.expired : waiting ? { ko: '집결 대기', en: 'Awaiting muster', ja: '集合待ち' }[locale] : t.active;
    const scheduleStatus = startedAt !== undefined
      ? { ko: `전투 시작: ${gameClock(startedAt, locale)}`, en: `Battle started: ${gameClock(startedAt, locale)}`, ja: `戦闘開始：${gameClock(startedAt, locale)}` }[locale]
      : startsAt !== undefined && hour < startsAt
        ? { ko: `집결까지 게임 ${(startsAt - hour).toFixed(1)}시간. 목적지까지 이동해 주세요.`, en: `${(startsAt - hour).toFixed(1)} game hours until muster. Travel to the destination.`, ja: `集合までゲーム内${(startsAt - hour).toFixed(1)}時間。目的地へ移動してください。` }[locale]
        : c.location === q.destination
          ? { ko: '집결 시각이 되었습니다. 현장의 여행 메뉴에서 시작하세요.', en: 'Muster time has arrived. Start from Travel at the destination.', ja: '集合時刻になりました。現地の旅先メニューから開始してください。' }[locale]
          : { ko: '집결 시각이 되었습니다. 참가한 인물은 목적지까지 직접 이동해야 합니다.', en: 'Muster time has arrived. Joined characters must travel to the destination.', ja: '集合時刻になりました。参加者は目的地まで自分で移動してください。' }[locale];
    const deadline = !grant ? undefined : waiting
      ? { ko: `기한은 전투 시작 후 게임 ${FANTASY_CONTRACT_DEADLINE_HOURS}시간`, en: `Deadline: ${FANTASY_CONTRACT_DEADLINE_HOURS} game hours after battle starts`, ja: `期限は戦闘開始後ゲーム内${FANTASY_CONTRACT_DEADLINE_HOURS}時間` }[locale]
      : grant.expiresAt < FANTASY_CONTRACT_RAID_WAITING_DEADLINE ? expired ? t.expired : `${t.left} ${Math.max(0, grant.expiresAt - hour).toFixed(1)} h` : undefined;
    const reportAt = q.reportAt ?? q.giver, requiredLocation = active ? reportAt : q.giver;
    const issuer = NPC_PUBLIC.find(npc => npc.id === (grant?.issuer ?? fantasyContractIssuer(q)));
    const have = c.inventory[q.item] ?? 0, available = have - (Object.values(c.equipment ?? {}).includes(q.item) || c.outfit === q.item ? 1 : 0);
    const task = fantasyTaskObjective(q);
    const ready = task ? fantasyTaskReady(c, q) : q.objective?.type === 'hunt' ? (grant?.progress ?? 0) >= q.objective.count : available >= q.count && c.visited.includes(q.destination) && (!q.chapter || fantasyMainReady(c, q.id));
    const text = fantasyQuestText(q, locale), destination = `${t.destination}: ${known.includes(q.destination) ? name(q.destination) : t.unknown}`;
    const reason = supporter ? sharedReason : expired ? t.expired : !fantasyQuestEligible(c, q) ? t.locked : c.location !== requiredLocation ? (q.reportAt ? { ko: '지정된 현장 보고 장소로 이동하세요.', en: 'Go to the designated field reporting site.', ja: '指定された現地報告の場所へ移動してください。' }[locale] : t.return) : q.chapter && !fantasyMainReady(c, q.id) ? t.proof : t.unmet;
    return <article className="fr-card" key={q.id}>
      {!q.chapter && <div className="fr-section-title"><h3>{text.name}</h3>{active && <span className="fr-tag">{status}</span>}</div>}
      {shared && <p className="fr-muted">{say(`공유 의뢰 · ${representative}가 대표로 보고합니다. 보수는 참가자에게 균등하게 나눕니다.`, `Shared contract · ${representative} handles reporting. Pay is shared equally among participants.`, `共同の依頼・${representative}が代表して報告します。報酬は参加者で均等に分けます。`)}</p>}
      {grade !== undefined && <p>{{ ko: '의뢰 전체 권장 등급', en: 'Recommended rank for the whole contract', ja: '依頼全体の推奨等級' }[locale]}: <strong>{fantasyGuildRankName(grade, locale)}</strong></p>}
      {monster && <p className="fr-muted">{{ ko: `개체 등급 ${monster.tier} · 목표 수량 전체를 합산한 전력이 의뢰 등급에 반영됩니다.`, en: `Individual monster tier ${monster.tier}. The contract rank accounts for the total target count.`, ja: `個体の等級${monster.tier}。依頼の等級は目標数全体の戦力を合算して評価します。` }[locale]}</p>}
      {startsAt !== undefined && <p>{{ ko: '공동토벌 집결 시각', en: 'Raid muster time', ja: '共同討伐の集合時刻' }[locale]}: <strong>{gameClock(startsAt, locale)}</strong><br /><small>{scheduleStatus}</small></p>}
      {onSelect && known.includes(q.destination) ? <ReasonButton className="fr-text-button" onClick={() => onSelect(q.destination)}>{destination} ↗</ReasonButton> : <p>{destination}</p>}
      <p className="fr-muted">{t.giver}: {issuer?.name[locale] ?? name(q.giver)} · {known.includes(q.giver) ? name(q.giver) : t.unknown}</p>
      {q.reportAt && <p className="fr-muted">{{ ko: '현장 마무리', en: 'Finish on site', ja: '現地で仕上げる' }[locale]}: {known.includes(reportAt) ? name(reportAt) : t.unknown}</p>}
      <details><summary>{t.story}</summary><p>{known.includes(q.destination) ? q.dialogue?.[locale] ?? text.description : t.unknown}</p></details>
      <FantasyMainInvestigation c={c} quest={q.id} blocked={blocked} onAction={onAction}/>
      <p>{supporter ? say('대표가 물품과 목표를 확인해 보고합니다. 현장에 함께 참가하세요.', 'Join your companions at the site; the contract holder verifies goods and objectives before reporting.', '仲間と現地に同行してください。品物と目標を確かめて報告するのは代表です。') : task ? `${fantasyTaskObjectiveLabel(q, locale)} · ${fantasyTaskProgress(c, q)} / ${task.count}` : q.objective?.type === 'hunt' ? `${t.hunt}: ${(q.objective?.type==='hunt'&&q.objective.monster?fantasyCombatEnemy(q.objective.monster):undefined)?.names[locale] ?? t.hunt} ${Math.min(grant?.progress ?? 0, q.objective.count)} / ${q.objective.count}` : `${name(q.item)} ${Math.min(have, q.count)} / ${q.count}`}</p>
      <small>{shared ? say('파티 보수 총액', 'Total party pay', 'パーティー報酬総額') : t.reward} {grant?.gold ?? q.gold} G · {q.xp} XP{deadline && ` · ${deadline}`}</small>
      <div className="fr-action-grid"><ReasonButton className="fr-btn" disabled={blocked || supporter || expired || !fantasyQuestEligible(c, q) || c.location !== requiredLocation || active && !ready} reason={blocked ? undefined : reason} onClick={() => onAction({ type: active ? 'complete' : 'accept', quest: q.id })}>{active ? q.completionLabel?.[locale] ?? t.deliver : t.accept}</ReasonButton>{active && <ReasonButton className="fr-text-button" disabled={blocked} onClick={() => onAction({ type: 'abandon', quest: q.id })}>{supporter ? say('참가 취소', 'Leave this contract', '同行をやめる') : t.abandon}</ReasonButton>}</div>
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
