import { fantasyTravelBurden } from '../../../shared/fantasy-travel-burden.ts';
import { FANTASY_ITEMS } from '../../../shared/fantasy-data.ts';
import type { FantasyAction, FantasyCharacter } from '../../../shared/fantasy.ts';
import { FANTASY_BAGS, FANTASY_STARTER_BAG, fantasyBagState, fantasyMagicBagRemoveError, fantasyBagText } from '../../../shared/fantasy-bags.ts';
import { useLocale } from '../locale.ts';
import { ReasonButton } from './FantasyActionButton.tsx';

export function FantasyBagPanel({ c, blocked, onAction }: { c: FantasyCharacter; blocked: boolean; onAction: (action: FantasyAction) => void }) {
  const [locale] = useLocale(), bag = fantasyBagState(c), held = c.pendingLoot?.[c.location];
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  const bagName = FANTASY_BAGS.find(entry => entry.id === bag.bag)?.names[locale] ?? say('기본 배낭', 'Starter pack', '最初の背嚢');
  const canClaim = !!held && Object.entries(held.items).some(([id, count]) => count > 0 && !fantasyBagState({ ...c, inventory: { ...c.inventory, [id]: (c.inventory[id] ?? 0) + 1 } }).overloaded);
  return <section className="fr-bag-status">
    <p>{say('일반 가방', 'Normal bag', '普通の鞄')} · {bagName}</p>
    {bag.bag !== FANTASY_STARTER_BAG.id && <ReasonButton className="fr-btn" disabled={blocked || fantasyBagState({ ...c, bag: undefined }).overloaded} reason={say('기본 배낭으로 바꾸기 전에 짐을 줄여 주세요.', 'Reduce your goods before returning to the starter pack.', '最初の背嚢に戻す前に荷物を減らしてください。')} onClick={() => onAction({ type: 'bagEquip', item: FANTASY_STARTER_BAG.id })}>{say('일반 가방 해제', 'Remove normal bag', '普通の鞄を外す')}</ReasonButton>}
    <p>{say('마법 보조 가방', 'Supplementary magic bags', '魔法の補助鞄')} · {bag.magicBags.length}/2</p>
    {[0, 1].map(slot => { const id = bag.magicBags[slot], definition = FANTASY_BAGS.find(entry => entry.id === id), error = id ? fantasyMagicBagRemoveError(c, slot as 0 | 1) : undefined; return <p key={slot}>{slot + 1}. {definition?.names[locale] ?? say('빈 슬롯', 'Empty slot', '空き枠')}{id && <ReasonButton className="fr-btn" disabled={blocked || !!error} reason={blocked ? undefined : error ? fantasyBagText(error, locale) : undefined} onClick={() => onAction({ type: 'magicBagRemove', slot: slot as 0 | 1 })}>{say('해제', 'Remove', '外す')}</ReasonButton>}</p>; })}
    <p>{say('총 소지품', 'All carried goods', '所持品合計')} · {(bag.weight / 1000).toFixed(1)}/{bag.weightLimit / 1000} kg · {bag.slots}/{bag.slotLimit}{say('칸', ' slots', '枠')}{bag.overloaded ? ' · ' + say('초과', 'Over capacity', '超過') : ''}</p>
    {bag.magicBags.includes('preserve-magic-bag') && <details className="fr-fold"><summary>{say('보존 가방 안의 식품', 'Food in preservation bags', '保存鞄の中の食品')} · {(bag.foodStorage.weight / 1000).toFixed(1)} kg · {bag.foodStorage.slots}{say('종', ' types', '種類')}</summary>{Object.entries(bag.foodStorage.counts).map(([id, count]) => <p key={id}>{FANTASY_ITEMS.find(item => item.id === id)?.names?.[locale] ?? id} ×{count}</p>)}<p>{say('가방 하나당 식품 12kg·8종까지만 보존하며 넘친 식품은 정상 속도로 상합니다.', 'Each bag preserves only 12 kg and 8 food types. Overflow food ages normally.', '一つの鞄につき食品12kg・8種類まで保存し、超過分は通常の速度で傷みます。')}</p></details>}
    <p>{say('짐에 따른 도보 시간 증가', 'Walking time added by baggage', '荷物による徒歩時間の増加')}: +{Math.round(fantasyTravelBurden(c).penalty*100)}%<small> · {say('가방 크기와 실제 무게 반영 · 파티는 가장 느린 일행에게 맞춰 이동', 'Bag size and actual weight count; parties match their slowest member', '鞄の大きさと実重量を反映・パーティーは最も遅い仲間に合わせる')}</small></p>
    <p className="fr-muted">{say('일반 가방 한 개와 마법 보조 가방 두 개까지 함께 착용합니다. 소지품에서 가방을 선택해 추가하세요.', 'Equip one normal bag and up to two supplementary magic bags. Select a bag in inventory to add it.', '普通の鞄一つと魔法の補助鞄二つまで同時に装備できます。持ち物から鞄を選んで追加してください。')}</p>
    {held && <details className="fr-fold">
      <summary>{say('이 지역의 보관품', 'Goods held here', 'この地域の預かり品')}</summary>
      {Object.entries(held.items).map(([id, count]) => <p key={id}>{FANTASY_ITEMS.find(item => item.id === id)?.names?.[locale] ?? id} ×{count}</p>)}
      <ReasonButton className="fr-btn" disabled={blocked || !canClaim} reason={say('가방에 무게와 품목 여유가 필요합니다.', 'Make room in your bag for weight and item types.', '鞄の重量と品目枠に空きが必要です。')} onClick={() => onAction({ type: 'bagClaim' })}>{say('들어가는 만큼 수령', 'Collect what fits', '入る分を受け取る')}</ReasonButton>
    </details>}
  </section>;
}
