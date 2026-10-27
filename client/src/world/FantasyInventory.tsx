import { useEffect, useRef, useState } from 'react';
import type { FantasyAction, FantasyCharacter, FantasyGearInstance, FantasyStats } from '../../../shared/fantasy.ts';
import { FANTASY_ITEMS } from '../../../shared/fantasy-data.ts';
import { FANTASY_TERMS } from '../../../shared/fantasy-lore.ts';
import { FANTASY_MAPS } from '../../../shared/fantasy-town.ts';
import { FANTASY_FOOD_META, foodSense } from '../../../shared/fantasy-life.ts';
import { useLocale } from '../locale.ts';
import { gameClock, statLabels } from './fantasy-copy.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { actionHelp, itemUseEffectText } from './fantasy-action-help.ts';
import { FantasySaleList } from './FantasySaleList.tsx';

type Props = { c: FantasyCharacter; onAction: (action: FantasyAction) => void; blocked: boolean };
const QUALITY_NAMES = {
  ko: ['기본', '양호', '우수', '명품', '걸작'], en: ['Standard', 'Fine', 'Superior', 'Masterwork', 'Exquisite'], ja: ['標準', '良品', '上質', '名品', '逸品'],
};
function FoodObservation({ c, item }: { c: FantasyCharacter; item: string }) {
  const [locale] = useLocale(), [smell, setSmell] = useState(false), sense = foodSense(c, item);
  return <div className="fr-food-observation"><p>{sense.appearance[locale]}</p><button type="button" className="fr-text-button" onClick={() => setSmell(value => !value)}>{({ ko: '냄새 살피기', en: 'Smell', ja: '匂いを確かめる' })[locale]}</button>{smell && <p>{sense.smell[locale]}</p>}{sense.known && <div className="fr-food-known">{({ ko: '식재 감별', en: 'Ingredient appraisal', ja: '食材鑑定' })[locale]} · {({ ko: { fresh: '신선함', stale: '변화 있음', spoiled: '부패함' }, en: { fresh: 'Fresh', stale: 'Stale', spoiled: 'Spoiled' }, ja: { fresh: '新鮮', stale: '変化あり', spoiled: '腐敗' } })[locale][sense.known.quality]} · {Number(sense.known.age.toFixed(1))}/{sense.known.shelfLife} h · {({ ko: '포만', en: 'Nutrition', ja: '満腹' })[locale]} {sense.known.nutrition}</div>}</div>;
}

export function FantasyInventory({ c, onAction, blocked }: Props) {
  const [locale] = useLocale();
  const [selected, setSelected] = useState<string | null>(null), [instanceId, setInstanceId] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const t = {
    ko: { title: '소지품', empty: '비어 있습니다.', close: '닫기', use: '사용', equip: '장착', unequip: '해제', equipped: '장착 중', instance: '개별 장비', auto: '자동 선택 · 품질 우선', plain: '일반품', material: '소재', gem: '보석', made: '제작 시각', guard: '방호', check: '판정', wear: '옷 갈아입기', wearing: '착용 중', outfit: '복식', warmth: '보온', cooling: '통풍', waterproof: '방수', light: '소지하면 주변을 밝힌다.', recorded: '이미 지도에 기록됨' },
    en: { title: 'Inventory', empty: 'Empty.', close: 'Close', use: 'Use', equip: 'Equip', unequip: 'Unequip', equipped: 'Equipped', instance: 'Individual equipment', auto: 'Automatic · best quality', plain: 'Standard copies', material: 'Material', gem: 'Gem', made: 'Crafted', guard: 'Guard', check: 'Check', wear: 'Change clothes', wearing: 'Worn', outfit: 'Clothing', warmth: 'Warmth', cooling: 'Cooling', waterproof: 'Waterproofing', light: 'Lights your surroundings while carried.', recorded: 'Already charted' },
    ja: { title: '持ち物', empty: '何もありません。', close: '閉じる', use: '使う', equip: '装備', unequip: '外す', equipped: '装備中', instance: '装備の個体', auto: '自動選択・品質優先', plain: '通常品', material: '素材', gem: '宝石', made: '制作時刻', guard: '防護', check: '判定', wear: '着替える', wearing: '着用中', outfit: '衣服', warmth: '保温', cooling: '涼しさ', waterproof: '防水', light: '持っていると周囲を照らす。', recorded: '地図に記録済み' },
  }[locale];
  const name = (id: string) => FANTASY_ITEMS.find(item => item.id === id)?.names?.[locale] ?? FANTASY_TERMS.find(term => term.id === id)?.names[locale] ?? FANTASY_MAPS.find(map => map.item === id)?.name[locale] ?? FANTASY_ITEMS.find(item => item.id === id)?.name ?? id;
  const items = Object.entries(c.inventory).filter(([, count]) => count > 0);
  const item = FANTASY_ITEMS.find(item => item.id === selected), map = FANTASY_MAPS.find(map => map.item === selected);
  const food = !!selected && FANTASY_FOOD_META.some(food => food.item === selected);
  const gear = (c.gear ?? []).filter(gear => gear.item === selected).sort((a, b) => b.quality - a.quality || a.createdAt - b.createdAt);
  const instance = gear.find(gear => gear.id === instanceId) ?? gear[0];
  const slot = item?.equipment?.slot;
  const equipped = !!slot && c.equipment?.[slot] === selected;
  const wornInstance = slot ? gear.find(piece => piece.id === c.equippedGear?.[slot]) : undefined;
  const instanceEquipped = equipped && (instance ? c.equippedGear?.[slot!] === instance.id : !c.equippedGear?.[slot!]);
  const recorded = !!map && map.locationIds.every(id => c.charted.includes(id) || c.visited.includes(id));
  const usable = !!selected && (food || !!map || !!item?.use || ['potion', 'antidote'].includes(selected));
  const quality = (gear: FantasyGearInstance) => `${'★'.repeat(gear.quality)} ${QUALITY_NAMES[locale][gear.quality - 1]}`;
  const combinedStats: Partial<FantasyStats> = { ...item?.equipment?.stats };
  for (const [stat, bonus] of Object.entries(instance?.bonuses ?? {})) combinedStats[stat as keyof FantasyStats] = (combinedStats[stat as keyof FantasyStats] ?? 0) + bonus;
  const guard = (item?.equipment?.guard ?? 0) + (instance?.guard ?? 0), check = (item?.equipment?.check ?? 0) + (instance?.check ?? 0);
  useEffect(() => {
    if (selected && (c.inventory[selected] ?? 0) > 0) { if (!dialog.current?.open) dialog.current?.showModal(); }
    else { dialog.current?.close(); if (selected) setSelected(null); }
  }, [selected, c.inventory]);
  useEffect(() => { if (instanceId && !gear.some(gear => gear.id === instanceId)) setInstanceId(''); }, [instanceId, gear]);
  const open = (id: string) => {
    const definition = FANTASY_ITEMS.find(item => item.id === id), worn = definition?.equipment?.slot ? c.equippedGear?.[definition.equipment.slot] : undefined;
    setInstanceId(worn ?? ''); setSelected(id);
  };
  const button = (label: string, action: FantasyAction, disabled = false) => {const reason=actionHelp(c,action,locale);return <ReasonButton type="button" className="fr-btn" disabled={blocked || disabled||!!reason} reason={blocked?undefined:reason} onClick={() => onAction(action)}>{label}</ReasonButton>;};
  return <>
    <h2>{t.title}</h2>{items.length === 0 && <p>{t.empty}</p>}
    <div className="fr-inventory-list">{items.map(([id, count]) => <button type="button" className="fr-item-name" key={id} onClick={() => open(id)}>{name(id)} × {count}</button>)}</div>
    <dialog ref={dialog} className="fr-item-dialog" onClose={() => setSelected(null)} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      {selected && <>
        <header><h2>{name(selected)} × {c.inventory[selected] ?? 0}</h2><button type="button" className="fr-btn" onClick={() => dialog.current?.close()}>{t.close} ×</button></header>
        {food ? <FoodObservation key={selected} c={c} item={selected} /> : <p>{item?.descriptions?.[locale] ?? FANTASY_TERMS.find(term => term.id === selected)?.summary[locale] ?? map?.description[locale] ?? item?.description ?? ''}</p>}
        {item&&usable&&<section className="fr-use-effects"><b>{{ko:'사용 효과',en:'Use effects',ja:'使用効果'}[locale]}</b>{itemUseEffectText(item,locale).map((effect,index)=><p key={index}>{effect}</p>)}{map&&<p>{{ko:'지도에 기록된 지역을 밝혀 줍니다.',en:'Reveals the regions recorded on this map.',ja:'地図に記された地域が見えるようになります。'}[locale]}</p>}</section>}
        {item?.equipment && <section>
          {equipped && <p>{t.equipped} · {wornInstance ? quality(wornInstance) : t.plain}</p>}
          {gear.length > 0 && <label style={{ display: 'grid', gap: 5 }}>{t.instance}<select value={instanceId} onChange={event => setInstanceId(event.target.value)} style={{ padding: 8, width: '100%', minWidth: 0, font: 'inherit' }}><option value="">{t.auto}</option>{gear.map((piece, index) => <option key={piece.id} value={piece.id}>#{index + 1} · {quality(piece)}{c.equippedGear?.[slot!] === piece.id ? ` · ${t.equipped}` : ''}</option>)}</select></label>}
          {instance && <div className="fr-card"><b>{quality(instance)}</b>{instance.material && <p>{t.material} · {name(instance.material)}</p>}{instance.gem && <p>{t.gem} · {name(instance.gem)}</p>}<small>{t.made} · {gameClock(instance.createdAt, locale)}</small></div>}
          {gear.length > 0 && (c.inventory[selected] ?? 0) > gear.length && <p className="fr-muted">{t.plain} × {(c.inventory[selected] ?? 0) - gear.length}</p>}
          <p>{Object.entries(combinedStats).filter(([, amount]) => amount !== 0).map(([stat, amount]) => `${statLabels[locale][stat as keyof FantasyStats]} ${amount >= 0 ? '+' : ''}${amount}`).concat(guard ? [`${t.guard} +${guard}`] : [], check ? [`${t.check} ${check > 0 ? '+' : ''}${check}`] : []).join(' · ')}</p>
          <div className="fr-inline-actions">{button(instanceEquipped ? t.equipped : t.equip, { type: 'equip', item: selected, ...(instance ? { instance: instance.id } : {}) }, instanceEquipped)}{equipped && slot && button(t.unequip, { type: 'unequip', slot })}</div>
        </section>}
        {item?.wear && <section className="fr-card"><h3>{t.outfit}</h3><p>{t.warmth} {item.wear.warmth} · {t.cooling} {item.wear.cooling} · {t.waterproof} {item.wear.waterproof}</p>{button(c.outfit === selected ? t.wearing : t.wear, { type: 'wear', item: selected }, c.outfit === selected)}</section>}
        {item?.light && <p>{t.light}</p>}
        {usable && <div style={{ marginTop: 12 }}>{button(recorded ? t.recorded : t.use, { type: 'use', item: selected }, recorded || (c.inventory[selected] ?? 0) <= 0)}</div>}
        <details className="fr-fold" style={{marginTop:16}}><summary>{{ko:'판매 가격 확인',en:'Sale prices',ja:'売却価格を確認'}[locale]}</summary><FantasySaleList c={c} item={selected} onAction={onAction} blocked={blocked}/></details>
      </>}
    </dialog>
  </>;
}
