import { FantasyCarryReturnPanel } from './FantasyCarryReturnPanel.tsx';
import { send } from '../net/ws.ts';
import { useState } from 'react';
import type { FantasyProfile } from '../../../shared/fantasy.ts';
import type { FantasyPartyCommand, FantasyPartyState } from '../../../shared/fantasy-party.ts';
import { FANTASY_ITEMS } from '../../../shared/fantasy-data.ts';
import { FANTASY_TERMS } from '../../../shared/fantasy-lore.ts';
import { FANTASY_MAPS } from '../../../shared/fantasy-town.ts';
import { FANTASY_INTERIOR_MAP_ITEM, fantasyInteriorMapLabel } from '../../../shared/fantasy-interior-map-catalog.ts';
import { useLocale } from '../locale.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import './fantasy-party-extras.css';

export function FantasyPartyExtras({ profile, state, selfId, blocked, command }: {
  profile: FantasyProfile; state: FantasyPartyState; selfId: string; blocked: boolean; command: (command: FantasyPartyCommand) => void;
}) {
  const [locale] = useLocale();
  const [message, setMessage] = useState(''), [deposit, setDeposit] = useState(''), [amount, setAmount] = useState(1);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const c = profile.character;
  if (!c) return null;
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  const me = state.members.find(member => member.id === selfId), busy = blocked || !!profile.activity || !!profile.combatId || !!profile.event || !!profile.death;
  const reason = say('현재 행동·전투 또는 요청을 먼저 마쳐 주세요.', 'Finish the current activity, battle or request first.', 'いまの行動・戦闘・依頼を先に終えてください。');
  const itemName = (id: string) => FANTASY_ITEMS.find(item => item.id === id)?.names?.[locale] ?? FANTASY_TERMS.find(term => term.category === 'item' && term.id === id)?.names[locale] ?? FANTASY_MAPS.find(map => map.item === id)?.name[locale] ?? id;
  const options = Object.entries(c.inventory).flatMap(([item, count]) => {
    if (!count) return [];
    if (item === FANTASY_INTERIOR_MAP_ITEM) return (c.interiorMaps ?? []).map(copy => ({ key: `${item}|${copy.id}`, item, instance: copy.id, count: 1, label: fantasyInteriorMapLabel(copy, locale) }));
    const gear = c.gear?.filter(gear => gear.item === item) ?? [], worn = Object.values(c.equippedGear ?? {});
    const plainWorn = c.outfit === item || Object.entries(c.equipment ?? {}).some(([slot, value]) => value === item && !c.equippedGear?.[slot as keyof NonNullable<typeof c.equippedGear>]);
    const result: { key: string; item: string; instance?: string; count: number; label: string }[] = gear.filter(instance => !worn.includes(instance.id)).map(instance => ({ key: `${item}|${instance.id}`, item, instance: instance.id, count: 1, label: `${itemName(item)} · ${instance.quality}★` }));
    const plain = count - gear.length - (plainWorn ? 1 : 0);
    if (plain > 0) result.push({ key: item, item, count: plain, label: `${itemName(item)} ×${plain}` });
    return result;
  });
  const selected = options.find(option => option.key === deposit) ?? options[0];
  const vault = state.vault;
  return <div className="fr-party-extras">
    <FantasyCarryReturnPanel profile={profile} selfId={selfId} peers={state.members} blocked={blocked} showCarryControls={false} onCommand={(target,method)=>send({t:'fantasyAid',target,method})}/>
    {vault && <details><summary>{say('공동 소지품', 'Shared supplies', '共有の持ち物')}</summary>
      <div className="fr-party-deposit"><select aria-label={say('맡길 물건', 'Item to deposit', '預ける品')} value={selected?.key ?? ''} disabled={busy} onChange={e => { setDeposit(e.target.value); setAmount(1); }}>{options.map(option => <option value={option.key} key={option.key}>{option.label}</option>)}</select>
        <input aria-label={say('맡길 수량', 'Deposit quantity', '預ける数')} type="number" min={1} max={Math.min(999, selected?.count ?? 1)} value={selected?.instance ? 1 : amount} disabled={busy || !!selected?.instance} onChange={e => setAmount(Number(e.target.value))}/>
        <ReasonButton className="fr-btn" disabled={busy || !selected || !Number.isSafeInteger(amount) || amount < 1 || amount > Math.min(999, selected?.count ?? 0)} reason={busy ? reason : say('맡길 물건과 보유 수량을 확인해 주세요.', 'Choose an item and check the quantity you own.', '預ける品と所持数を確認してください。')} onClick={() => selected && command({ type: 'deposit', revision: vault.revision, item: selected.item, count: selected.instance ? 1 : amount, ...(selected.instance ? { instance: selected.instance } : {}) })}>{say('맡기기', 'Deposit', '預ける')}</ReasonButton>
      </div>
      {vault.lots.map(lot => <article key={lot.id}><span>{lot.interiorMap ? fantasyInteriorMapLabel(lot.interiorMap, locale) : itemName(lot.item)} ×{lot.count}{lot.gear ? ` · ${lot.gear.quality}★` : ''}</span><small>{lot.name}</small>
        <input aria-label={`${itemName(lot.item)} ${say('출금 수량', 'withdraw quantity', '引き出す数')}`} type="number" min={1} max={Math.min(999, lot.count)} value={quantities[lot.id] ?? 1} disabled={busy} onChange={e => setQuantities({ ...quantities, [lot.id]: Number(e.target.value) })}/>
        <ReasonButton className="fr-btn" disabled={busy || vault.requests.some(request => request.user === selfId && request.lot === lot.id) || !Number.isSafeInteger(quantities[lot.id] ?? 1) || (quantities[lot.id] ?? 1) < 1 || (quantities[lot.id] ?? 1) > lot.count} reason={busy ? reason : vault.requests.some(request => request.user === selfId && request.lot === lot.id) ? say('이미 이 물건의 출금 승인을 기다리고 있어요.', 'A withdrawal request for this item is already pending.', 'この品の引き出しはすでに承認待ちです。') : say('출금할 수량을 확인해 주세요.', 'Check the withdrawal quantity.', '引き出す数を確認してください。')} onClick={() => command({ type: 'requestWithdraw', revision: vault.revision, lot: lot.id, count: quantities[lot.id] ?? 1 })}>{say('출금 요청', 'Request withdrawal', '引き出しを依頼')}</ReasonButton>
      </article>)}
      {vault.requests.map(request => <article key={request.id}><p>{request.name} · {itemName(vault.lots.find(lot => lot.id === request.lot)?.item ?? '')} ×{request.count}</p>{me?.isLeader ? <div className="fr-action-grid">{[true, false].map(approve => <ReasonButton key={String(approve)} className="fr-btn" disabled={busy} reason={reason} onClick={() => command({ type: 'approveWithdraw', revision: vault.revision, request: request.id, approve })}>{approve ? say('승인', 'Approve', '承認') : say('거절', 'Decline', '却下')}</ReasonButton>)}</div> : <small>{say('파티장 승인 대기', 'Awaiting leader approval', 'リーダーの承認待ち')}</small>}</article>)}
    </details>}
    <details open><summary>{say('파티 대화', 'Party chat', 'パーティーチャット')}</summary><div className="fr-party-chat" role="log" aria-live="polite">{state.chat?.map(message => <p key={message.id}><b>{message.name}</b> {message.text}</p>)}</div>
      <form onSubmit={e => { e.preventDefault(); if (!blocked && message.trim()) { command({ type: 'chat', text: message.trim() }); setMessage(''); } }}><input aria-label={say('파티 메시지', 'Party message', 'パーティーメッセージ')} value={message} maxLength={500} onChange={e => setMessage(e.target.value)} disabled={blocked}/><ReasonButton className="fr-btn" disabled={blocked || !message.trim()} reason={blocked ? reason : say('보낼 내용을 입력해 주세요.', 'Enter a message to send.', '送る内容を入力してください。')} type="submit">{say('보내기', 'Send', '送信')}</ReasonButton></form>
    </details>
  </div>;
}
