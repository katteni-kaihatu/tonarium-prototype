import type { FantasyAction, FantasyCharacter, FantasyStats } from '../../../shared/fantasy.ts';
import { FANTASY_ITEMS } from '../../../shared/fantasy-data.ts';
import { fantasyStats } from '../../../shared/fantasy-engine.ts';
import { fantasyItemBonuses } from '../../../shared/fantasy-effects.ts';
import { fantasyEquippedGear } from '../../../shared/fantasy-equipment.ts';
import { FANTASY_BAGS, FANTASY_STARTER_BAG, fantasyBagEquipError, fantasyBagState, fantasyBagText, fantasyEquippedMagicBags, fantasyMagicBagRemoveError, fantasyNormalBagId } from '../../../shared/fantasy-bags.ts';
import { useLocale } from '../locale.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { actionHelp, itemDisplayName } from './fantasy-action-help.ts';
import { gameClock, statLabels } from './fantasy-copy.ts';

type Props = { c: FantasyCharacter; onAction: (action: FantasyAction) => void; blocked: boolean; onInventory: () => void; travelEquipment?: boolean };
import { FANTASY_EQUIPMENT_SLOTS, fantasyEquipmentEntries, fantasyEquipmentSlotName, fantasyOffhandEquipError } from '../../../shared/fantasy-equipment-slots.ts';
const QUALITY = {
  ko: ['기본', '양호', '우수', '명품', '걸작'],
  en: ['Standard', 'Fine', 'Superior', 'Masterwork', 'Exquisite'],
  ja: ['標準', '良品', '上質', '名品', '逸品'],
};

export function FantasyEquipmentPanel({ c, onAction, blocked, onInventory, travelEquipment = false }: Props) {
  const [locale] = useLocale();
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  const name = (id: string) => itemDisplayName(id, locale);
  const stats = fantasyStats(c), equipment = fantasyEquipmentEntries(c, FANTASY_ITEMS), instances = fantasyEquippedGear(c);
  const bagState = fantasyBagState(c), normalBagId = fantasyNormalBagId(c), magicBags = fantasyEquippedMagicBags(c);
  const normalBag = FANTASY_BAGS.find(bag => bag.id === normalBagId) ?? FANTASY_STARTER_BAG;
  const normalBagName = FANTASY_BAGS.find(bag => bag.id === normalBagId)?.names[locale] ?? say('기본 배낭', 'Starter pack', '最初の背嚢');
  const outfit = FANTASY_ITEMS.find(item => item.id === c.outfit && item.wear && (c.inventory[item.id] ?? 0) > 0);
  const unequip = (action: FantasyAction, reason?: string) => { const actionBlocked=blocked&&!(travelEquipment&&action.type==='unequip'); return <ReasonButton type="button" className="fr-btn" disabled={actionBlocked || !!reason} reason={actionBlocked ? undefined : reason} onClick={() => onAction(action)}>{say('해제', 'Unequip', '外す')}</ReasonButton>; };
  const normalBagError = normalBagId !== FANTASY_STARTER_BAG.id ? fantasyBagEquipError(c, FANTASY_STARTER_BAG.id) : undefined;
  return <section className="fr-equipment-panel">
    <h2>{say('장비', 'Equipment', '装備')}</h2>
    <p className="fr-muted">{say('현재 착용한 장비와 옷, 가방을 확인합니다. 소지품에서 다른 물품으로 바꿀 수 있습니다.', 'Inspect your equipped gear, clothing and bags. Choose replacements in your inventory.', '現在の装備、衣服、鞄を確認できる。別の品へ替えるときは持ち物から選ぼう。')}</p>
    <button type="button" className="fr-btn" onClick={onInventory}>{say('소지품에서 장비 선택', 'Choose equipment in inventory', '持ち物で装備を選ぶ')}</button>
    <section className="fr-card" style={{ marginTop: 12 }}>
      <h3>{say('현재 능력치', 'Current attributes', '現在の能力')}</h3>
      <div className="fr-tags">{(Object.entries(stats) as [keyof FantasyStats, number][]).map(([key, value]) => <span key={key}>{statLabels[locale][key]} {value}</span>)}</div>
    </section>
    {FANTASY_EQUIPMENT_SLOTS.map(slot => {
      const item = equipment.find(entry => entry.slot === slot)?.item;
      const inactive = item && fantasyOffhandEquipError(c, item, locale);
      const instance = item && instances.find(instance => instance.id === c.equippedGear?.[slot]);
      // 共通の集計を使い、一時効果や恒久成長を装備の加点へ混ぜない。
      const bonuses = item ? fantasyItemBonuses({ ...c, equipment: { [slot]: item.id }, equippedGear: instance ? { [slot]: instance.id } : {}, permanentBonuses: undefined, effects: [] }, FANTASY_ITEMS) : undefined;
      const additions = Object.entries(bonuses?.stats ?? {}).filter(([, value]) => value !== 0).map(([key, value]) => `${statLabels[locale][key as keyof FantasyStats]} ${value >= 0 ? '+' : ''}${value}`);
      if (bonuses?.guard) additions.push(`${say('방호', 'Guard', '防護')} +${bonuses.guard}`);
      if (bonuses?.check) additions.push(`${say('판정', 'Check', '判定')} ${bonuses.check > 0 ? '+' : ''}${bonuses.check}`);
      return <section className="fr-card" key={slot} style={{ marginTop: 12 }}>
        <h3>{fantasyEquipmentSlotName(slot, locale)}</h3>
        {item ? <>
          <p><b>{name(item.id)}</b> · {instance ? `${'★'.repeat(instance.quality)} ${QUALITY[locale][instance.quality - 1]}` : say('일반품', 'Standard copy', '通常品')}</p>
          <p>{item.descriptions?.[locale] ?? item.description}</p>
          {inactive && <p className="fr-muted">{inactive}</p>}
          {instance && <>
            {instance.material && <p>{say('소재', 'Material', '素材')} · {name(instance.material)}</p>}
            {instance.gem && <p>{say('보석', 'Gem', '宝石')} · {name(instance.gem)}</p>}
            <small>{say('제작 시각', 'Crafted', '制作時刻')} · {gameClock(instance.createdAt, locale)}</small>
          </>}
          {additions.length > 0 && <p>{additions.join(' · ')}</p>}
          {unequip({ type: 'unequip', slot }, actionHelp(c, { type: 'unequip', slot }, locale))}
        </> : <p className="fr-muted">{say('장착한 장비 없음', 'Nothing equipped', '装備なし')}</p>}
      </section>;
    })}
    <section className="fr-card" style={{ marginTop: 12 }}>
      <h3>{say('기후 대응 복식', 'Climate outfit', '気候に備える衣服')}</h3>
      <p className="fr-muted">{say('전신 복식의 기후 효과입니다. 방어구 능력치는 해당 부위에 장착한 때만 한 번 적용됩니다.', 'Full outfits provide climate protection. Gear attributes apply once, only when equipped in their wearable slot.', '全身の衣服で気候に備える。装備能力は対応する部位に装備したときだけ一度適用する。')}</p>
      {outfit?.wear ? <><p><b>{name(outfit.id)}</b></p><p>{outfit.descriptions?.[locale] ?? outfit.description}</p><p>{say('보온', 'Warmth', '保温')} {outfit.wear.warmth} · {say('통풍', 'Cooling', '涼しさ')} {outfit.wear.cooling} · {say('방수', 'Waterproofing', '防水')} {outfit.wear.waterproof}</p></> : <p className="fr-muted">{say('착용한 옷 없음', 'No clothing selected', '衣服の選択なし')}</p>}
    </section>
    <section className="fr-card" style={{ marginTop: 12 }}>
      <h3>{say('기본 가방', 'Main bag', '主な鞄')}</h3>
      <p><b>{normalBagName}</b></p>
      <p>{normalBag.weightLimit / 1000} kg · {normalBag.slotLimit} {say('칸', 'slots', '枠')}</p>
      {normalBagId !== FANTASY_STARTER_BAG.id && unequip({ type: 'bagEquip', item: FANTASY_STARTER_BAG.id }, normalBagError ? fantasyBagText(normalBagError, locale) ?? normalBagError : undefined)}
    </section>
    {([0, 1] as const).map(slot => {
      const id = magicBags[slot], bag = FANTASY_BAGS.find(bag => bag.id === id), error = bag ? fantasyMagicBagRemoveError(c, slot) : undefined;
      return <section className="fr-card" style={{ marginTop: 12 }} key={`magic-${slot}`}>
        <h3>{say('보조 마법 가방', 'Extra magic bag', '追加の魔法鞄')} {slot + 1}/2</h3>
        {bag ? <><p><b>{bag.names[locale]}</b></p><p>{bag.weightLimit / 1000} kg · {bag.slotLimit} {say('칸', 'slots', '枠')}</p>{id === 'preserve-magic-bag' && <p className="fr-muted">{say('착용 중 식품의 신선도 저하가 1/10로 느려집니다. 중복 착용 효과는 겹치지 않습니다.', 'While equipped, food ages at one tenth the normal rate. Extra preservation bags do not stack.', '装備中は食品の鮮度低下が通常の1/10になる。保存効果は重複しない。')}</p>}{unequip({ type: 'magicBagRemove', slot }, error ? fantasyBagText(error, locale) ?? error : undefined)}</> : <p className="fr-muted">{say('비어 있음', 'Empty', '空き')}</p>}
      </section>;
    })}
    <p className="fr-muted">{say('전체 수납', 'Total carrying capacity', '全体の収納')} · {(bagState.weight / 1000).toFixed(1)}/{bagState.weightLimit / 1000} kg · {bagState.slots}/{bagState.slotLimit} {say('칸', 'slots', '枠')}{bagState.overloaded ? ` · ${say('초과', 'Over capacity', '超過')}` : ''}</p>
  </section>;
}
