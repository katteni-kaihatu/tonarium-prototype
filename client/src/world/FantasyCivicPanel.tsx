import { useState } from 'react';
import type { FantasyProfile } from '../../../shared/fantasy.ts';
import { NPC_PUBLIC } from '../../../shared/npc.ts';
import { fantasyCivicText, type FantasyCivicCommand, type FantasyCivicCrime, type FantasyCivicState, type FantasyCivicPolicy } from '../../../shared/fantasy-civics.ts';
import { useLocale } from '../locale.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import './fantasy-civics.css';

interface Props { profile: FantasyProfile; state: FantasyCivicState | null; pending: boolean; error: string | null; onCommand: (command: FantasyCivicCommand) => void }
export function FantasyCivicPanel({ profile, state, pending, error, onCommand }: Props) {
  const [locale] = useLocale(), [confirmation, setConfirmation] = useState<{ command: FantasyCivicCommand; label: string } | null>(null);
  const [victim, setVictim] = useState('');
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  const c = profile.character, busy = pending || !!profile.activity || !!profile.combatId || !!profile.event || !!profile.death || !c;
  const busyReason = pending ? say('요청을 확인 중입니다.', 'Waiting for the request.', '依頼を確認しています。') : busy ? fantasyCivicText('busy', locale) : undefined;
  const blocked = busyReason ?? (state?.actionBlock ? fantasyCivicText(state.actionBlock, locale) : undefined);
  const base = () => ({ revision: state!.revision, requestId: crypto.randomUUID() });
  const ask = (command: FantasyCivicCommand, label: string) => setConfirmation({ command, label });
  const crimeName = (crime: FantasyCivicCrime) => ({ theft: say('절도', 'Theft', '窃盗'), assault: say('폭행', 'Assault', '暴行'), robbery: say('약탈', 'Robbery', '略奪'), extortion: say('갈취', 'Extortion', '恐喝') })[crime];
  const policyName = (policy: FantasyCivicPolicy) => ({ provisions: say('물자 지원', 'Supply relief', '物資支援'), patrol: say('순찰 정비', 'Organise patrols', '巡回整備'), festival: say('이웃 잔치', 'Neighbourhood feast', '住人の宴'), extort: say('장터 압박', 'Pressure the market', '市への圧力') })[policy];
  const npcName = (id: string) => NPC_PUBLIC.find(npc => npc.id === id)?.name[locale] ?? id;
  const phaseName = (activity: string) => ({ sleep: say('집에서 쉬는 중', 'Resting at home', '家で休憩中'), work: say('생업에 종사 중', 'At work', '仕事中'), market: say('장터에 들름', 'Visiting the market', '市へ立ち寄り'), visit: say('이웃과 만나는 중', 'Visiting neighbours', '近所を訪問中') })[activity] ?? activity;
  const active = state?.ownCases.find(entry => entry.status !== 'closed');
  const courthouse = !!state?.town;
  const peers = state?.peers ?? [];
  const selected = state?.npcs.find(npc => npc.npc === victim) ?? state?.npcs[0];
  const ordinaryButton = (command: FantasyCivicCommand, label: string, reason?: string) => <ReasonButton className="fr-btn" disabled={!!reason || !!blocked} reason={blocked ?? reason} onClick={() => ask(command, label)}>{label}</ReasonButton>;
  const courtButton = (command: FantasyCivicCommand, label: string, reason?: string) => <ReasonButton className="fr-btn" disabled={!!reason || busy} reason={busyReason ?? reason} onClick={() => ask(command, label)}>{label}</ReasonButton>;
  return <section className="fr-civic"><h2>{say('마을 소식과 관청', 'Town & watch', '街の便りと役所')}</h2>
    {error && <p role="alert" className="fr-error">{fantasyCivicText(error, locale)}</p>}
    <ReasonButton className="fr-btn" disabled={pending} reason={busyReason} onClick={() => onCommand({ type: 'sync' })}>{say('소식 확인', 'Refresh news', '便りを確認')}</ReasonButton>
    {!state ? <p className="fr-muted">{say('소식을 기다리고 있습니다.', 'Waiting for the town record.', '街の記録を待っています。')}</p> : <>
      {!courthouse && <p className="fr-muted">{say('관청은 도시·마을·항구에 있습니다.', 'The watch is in cities, villages and ports.', '役所は街・里・港にあります。')}</p>}
      {!!state.notices.length && <details open><summary>{say('최근 소식', 'Recent news', '最近の便り')}</summary><div className="fr-civic-news">{state.notices.slice(-5).reverse().map(entry => <p key={entry.id}>{entry.text[locale]}</p>)}</div></details>}
      <details><summary>{say('주민들의 하루', 'The residents’ day', '住人の一日')}</summary>
        {!state.npcs.length ? <p className="fr-muted">{say('근처에 거주하는 이가 없습니다.', 'No residents live nearby.', '近くに住人はいません。')}</p> : state.npcs.map(npc => <article className="fr-civic-npc" key={npc.npc}><b>{npc.names[locale]}</b><small>{npc.role[locale]} · {phaseName(npc.activity)}</small>
          {!!Object.keys(npc.relations).length && <details><summary>{say('이웃 사이', 'Neighbours', '近所の関係')}</summary>{Object.entries(npc.relations).map(([other, relation]) => <p key={other}>{npcName(other)} · {relation > 0 ? say('서로 돕는 사이', 'On friendly terms', '助け合う仲') : relation < 0 ? say('마찰이 있는 사이', 'Some friction', '少し不和') : say('평범한 이웃', 'Ordinary neighbours', '普通の隣人')}</p>)}</details>}
        </article>)}
      </details>
      {state.town && <details><summary>{say('마을의 형편', 'Town affairs', '街の情勢')}</summary><p>{say('주민 신뢰', 'Public trust', '住民の信頼')} {state.town.trust}</p>
        <div className="fr-civic-factions"><span>{say('평의회', 'Council', '評議会')} {state.town.council}%</span><span>{say('길드', 'Guilds', 'ギルド')} {state.town.guild}%</span><span>{say('뒷골목', 'Underworld', '裏社会')} {state.town.underworld}%</span></div>
        {state.town.policy && <p>{policyName(state.town.policy)} · {state.town.steward?.name}</p>}
        <p className="fr-muted">{say('공동 금고', 'Civic treasury', '共同金庫')} {state.town.treasury}G</p>
        {c && ['leader', 'crimeboss'].includes(c.job) && <details><summary>{say('마을 사업', 'Town projects', '街の事業')}</summary>{(['provisions', 'patrol', 'festival', ...(c.job === 'crimeboss' ? ['extort' as const] : [])] as FantasyCivicPolicy[]).map(policy => <div className="fr-civic-project" key={policy}>
          {ordinaryButton({ type: 'govern', policy, ...base() }, `${policyName(policy)} · 12G`, (c.gold < 12 ? fantasyCivicText('insufficient-gold', locale) : undefined))}
        </div>)}</details>}
      </details>}
      {active ? <details open><summary>{say('내 사건과 처분', 'My case', '自分の事件と処分')}</summary><p><b>{crimeName(active.crime)}</b> · {active.status === 'wanted' ? say('출석 요청', 'Wanted for a hearing', '出頭の要請') : active.status === 'custody' ? say('심리 대기', 'Awaiting a hearing', '審理待ち') : say('처분 중', 'Serving sentence', '処分中')}</p>
        <details><summary>{say('목격 기록', 'Witness statements', '目撃の記録')}</summary>{active.evidence.map(witness => <p key={witness.npc}>{npcName(witness.npc)} · {say('확인된 목격 증언', 'Verified eyewitness account', '確認された目撃証言')}</p>)}</details>
        {active.status === 'wanted' && courtButton({ type: 'surrender', ...base() }, say('관청에 자수', 'Surrender to the watch', '役所へ自首'), !courthouse || active.location !== c?.location ? fantasyCivicText('unavailable', locale) : undefined)}
        {active.status === 'custody' && <><p className="fr-muted">{say('증언을 확인하는 심리에 응합니다.', 'Attend the hearing to review the testimony.', '証言を確認する審理に応じます。')}</p>
          {courtButton({ type: 'hearing', plea: 'admit', ...base() }, say('행위를 인정하고 심리받기', 'Admit the offence at the hearing', '行為を認めて審理を受ける'))}
          {courtButton({ type: 'hearing', plea: 'contest', ...base() }, say('증거를 다투고 심리받기', 'Contest the evidence at the hearing', '証拠を争って審理を受ける'))}</>}
        {!!active.damages && !active.repaid && courtButton({ type: 'restitution', ...base() }, say(`피해 배상 · ${active.damages}G`, `Restitution · ${active.damages}G`, `被害弁償・${active.damages}G`), (c?.gold ?? 0) < active.damages ? fantasyCivicText('insufficient-gold', locale) : undefined)}
        {active.repaid && <p>{say('피해 배상을 마쳤습니다.', 'Restitution completed.', '被害弁償を終えました。')}</p>}
        {active.status === 'sentenced' && <><p>{say(`남은 형기: 게임 ${Math.max(0, active.jailUntil! - state.hour).toFixed(1)}시간`, `Sentence left: ${Math.max(0, active.jailUntil! - state.hour).toFixed(1)} game hours`, `残る刑期：世界${Math.max(0, active.jailUntil! - state.hour).toFixed(1)}時間`)}</p>
          {courtButton({ type: 'payFine', ...base() }, say(`벌금 납부 후 석방 · ${active.fine}G`, `Pay fine and leave · ${active.fine}G`, `罰金を払い釈放・${active.fine}G`), (c?.gold ?? 0) < active.fine ? fantasyCivicText('insufficient-gold', locale) : undefined)}
          {!active.appealed && courtButton({ type: 'appeal', ...base() }, say('재심 요청', 'Request a rehearing', '再審を求める'))}
          {courtButton({ type: 'release', ...base() }, say('형기 확인 후 석방', 'Complete the sentence', '刑期を確認して釈放'), state.hour < active.jailUntil! ? fantasyCivicText('wait', locale) : undefined)}
        </>}
      </details> : null}
      {!!state.wanted.length && <details><summary>{say('관청의 수배 공고', 'Watch notices', '役所の手配書')}</summary>{state.wanted.map(entry => <article key={`${entry.user}:${entry.generation}`}><p>{entry.name} · {crimeName(entry.crime)} · {say('정산 현상금', 'Settled bounty', '精算時の報奨')} ≤{entry.bounty}G</p>
        {c && ['leader', 'knight', 'scout'].includes(c.job) && peers.some(peer => peer.user === entry.user && peer.wanted) && ordinaryButton({ type: 'arrest', target: entry.user, ...base() }, say('관청에 인도', 'Bring to the watch', '役所へ引き渡す'))}</article>)}</details>}
      {courthouse && <details><summary>{say('위험한 길', 'Dangerous choices', '危険な道')}</summary><p className="fr-muted">{say('서로 서약한 사람끼리만 금화를 빼앗길 수 있습니다. 물품과 장비는 가져가지 않습니다.', 'Only mutually consenting people risk losing a small amount of gold. Goods and equipment are protected.', '双方が誓約した者だけが少額の金貨を奪われます。持ち物と装備は守られます。')}</p>
        {courtButton({ type: 'consent', enabled: !state.riskEnabled, ...base() }, state.riskEnabled ? say('위험 서약 철회', 'Withdraw danger consent', '危険の誓約を取り消す') : say('이곳에서 위험에 동의 · 실제 24분', 'Consent to danger here · 24 real minutes', 'ここで危険に同意・実時間24分'), !state.riskEnabled && active ? fantasyCivicText('protected', locale) : undefined)}
        {peers.filter(peer => peer.consenting).map(peer => <article key={peer.user}><p>{peer.name}</p>{ordinaryButton({ type: 'rob', target: peer.user, ...base() }, say('금화를 빼앗으려 한다', 'Attempt to take gold', '金貨を奪おうとする'), !state.riskEnabled ? fantasyCivicText('protected', locale) : undefined)}</article>)}
        {!!state.npcs.length && <details><summary>{say('주민에게 위해를 가하기', 'Offend against a resident', '住人に害を加える')}</summary><label>{say('상대', 'Resident', '相手')}<select value={selected?.npc} onChange={event => setVictim(event.target.value)}>{state.npcs.map(npc => <option key={npc.npc} value={npc.npc}>{npc.names[locale]}</option>)}</select></label>
          {selected && <>{ordinaryButton({ type: 'npcCrime', npc: selected.npc, kind: 'theft', ...base() }, say('훔치려 한다 · 목격과 처벌 위험', 'Attempt theft · witnesses and punishment', '盗もうとする・目撃と処罰の危険'))}
            {ordinaryButton({ type: 'npcCrime', npc: selected.npc, kind: 'assault', ...base() }, say('위해를 가한다 · 목격과 처벌 위험', 'Assault · witnesses and punishment', '危害を加える・目撃と処罰の危険'))}</>}
        </details>}
      </details>}
      {confirmation && <div role="dialog" aria-label={say('행동 확인', 'Confirm action', '行動の確認')} className="fr-civic-confirm"><p>{confirmation.label}</p>
        <p className="fr-muted">{say('이 행동을 진행할까요?', 'Proceed with this action?', 'この行動を進めますか？')}</p>
        <ReasonButton className="fr-btn primary" disabled={busy} reason={busyReason} onClick={() => { onCommand(confirmation.command); setConfirmation(null); }}>{say('진행', 'Proceed', '進める')}</ReasonButton>
        <button className="fr-btn" onClick={() => setConfirmation(null)}>{say('취소', 'Cancel', '取り消す')}</button>
      </div>}
    </>}
  </section>;
}
