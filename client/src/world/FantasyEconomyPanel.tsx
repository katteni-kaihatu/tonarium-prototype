import { useEffect, useState } from 'react';
import type { FantasyProfile } from '../../../shared/fantasy.ts';
import { fantasyEconomyText, type FantasyEconomyCommand, type FantasyEconomySelection, type FantasyEconomyState } from '../../../shared/fantasy-economy.ts';
import { fantasyBuildings, type FantasyBuildingId } from '../../../shared/fantasy-town.ts';
import { useLocale } from '../locale.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { itemDisplayName } from './fantasy-action-help.ts';
import './fantasy-economy.css';

interface Props { profile: FantasyProfile; state: FantasyEconomyState | null; pending: boolean; error: string | null; onCommand: (command: FantasyEconomyCommand) => void; shop?: FantasyBuildingId; building?: string; shopOnly?: boolean }
export function FantasyEconomyPanel({ profile, state, pending, error, onCommand, shop, building, shopOnly }: Props) {
  const selectedShop = shop ?? building;
  const [locale] = useLocale(), [peer, setPeer] = useState(''), [gold, setGold] = useState('0'), [goods, setGoods] = useState<FantasyEconomySelection[]>([]), [selection, setSelection] = useState(''), [count, setCount] = useState('1'), [query, setQuery] = useState('');
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale], c = profile.character;
  const trade = state?.trades.find(trade => trade.status === 'open'), mine = trade?.mine ?? 0, own = trade?.offers[mine];
  useEffect(() => { setGold(String(own?.gold ?? 0)); setGoods(own?.items.map(({ item, count, instance }) => ({ item, count, ...(instance ? { instance } : {}) })) ?? []); }, [trade?.id, trade?.revision]);
  if (!c) return null;
  const busy = pending || !!profile.activity || !!profile.event || !!profile.combatId || !!profile.death;
  const reason = pending ? say('요청을 확인 중입니다.', 'Waiting for the request.', '依頼を確認しています。') : busy ? say('현재 행동이나 사건을 먼저 마쳐 주세요.', 'Finish the current activity or encounter first.', 'いまの行動や出来事を先に終えてください。') : undefined;
  const name = (item: string) => itemDisplayName(item, locale), quality = { fresh: say('상태가 좋은 묶음', 'Well-kept batch', '状態のよい品'), stale: say('상태가 변한 묶음', 'Deteriorated batch', '変化した品'), spoiled: say('상한 묶음', 'Spoiled batch', '傷んだ品') };
  const available: (FantasyEconomySelection & { key: string; label: string })[] = Object.entries(c.inventory).flatMap(([item, amount]) => {
    const equipment = c.gear?.filter(g => g.item === item) ?? [], worn = Object.values(c.equippedGear ?? {});
    const plain = amount - equipment.length - (c.outfit === item || Object.entries(c.equipment ?? {}).some(([slot, value]) => value === item && !c.equippedGear?.[slot as keyof NonNullable<typeof c.equippedGear>]) ? 1 : 0);
    return [...(plain > 0 ? [{ key: `${item}|`, item, count: plain, label: `${name(item)} ×${plain}` }] : []), ...equipment.filter(g => !worn.includes(g.id)).map(g => ({ key: `${item}|${g.id}`, item, count: 1, instance: g.id, label: `${name(item)} · ${'★'.repeat(g.quality)}` }))];
  });
  const selected = available.find(item => item.key === selection), n = Number(count), cash = Number(gold);
  const validCount = Number.isSafeInteger(n) && n >= 1 && !!selected && n <= selected.count && (!selected.instance || n === 1), validGold = Number.isSafeInteger(cash) && cash >= 0 && cash <= c.gold;
  const dirty = !!own && (cash !== own.gold || JSON.stringify(goods) !== JSON.stringify(own.items.map(({ item, count, instance }) => ({ item, count, ...(instance ? { instance } : {}) }))));
  const add = () => { if (!validCount || !selected || goods.length >= 12) return; setGoods([...goods.filter(good => !(good.item === selected.item && good.instance === selected.instance)), { item: selected.item, count: n, ...(selected.instance ? { instance: selected.instance } : {}) }]); };
  return <section className="fr-economy">
    {error && <p role="alert">{fantasyEconomyText(error, locale)}</p>}
    {!state && <p>{say('장부를 확인하고 있습니다.', 'Checking the ledger.', '帳簿を確認しています。')}</p>}
    {!selectedShop && !shopOnly && <>
      <h2>{say('물품 교환', 'Exchange', '品物の交換')}</h2>
      {!trade ? <div className="fr-economy-fields"><select aria-label={say('거래 상대', 'Trading partner', '取引相手')} value={peer} onChange={e => setPeer(e.target.value)}><option value="">{say('주변 여행자', 'Nearby travelers', '近くの旅人')}</option>{state?.peers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><ReasonButton className="fr-btn" disabled={busy || !state?.peers.some(p => p.id === peer)} reason={reason ?? say('같은 장소의 상대를 골라 주세요.', 'Choose someone at the same place.', '同じ場所の相手を選んでください。')} onClick={() => onCommand({ type: 'open', peer })}>{say('교환 요청', 'Request exchange', '交換を申し込む')}</ReasonButton></div> : <>
        <h3>{trade.names[1 - mine]}</h3>
        <div className="fr-economy-offers">{trade.offers.map((offer, i) => <article key={i}><b>{i === mine ? say('내 제안', 'My offer', '自分の提示') : trade.names[i]}</b><p>{offer.gold} G {offer.confirmed && `· ${say('승인함', 'Confirmed', '承認済み')}`}</p>{offer.items.map((good, index) => <p key={index}>{name(good.item)} ×{good.count}{good.gearQuality ? ` · ${'★'.repeat(good.gearQuality)}` : ''}{good.quality ? ` · ${quality[good.quality]}` : ''}</p>)}</article>)}</div>
        <label>{say('제안할 금화', 'Gold to offer', '提示する金貨')}<input type="number" min="0" max={c.gold} value={gold} onChange={e => setGold(e.target.value)}/></label>
        <div className="fr-economy-fields"><select aria-label={say('교환할 소지품', 'Belongings to exchange', '交換する持ち物')} value={selection} onChange={e => setSelection(e.target.value)}><option value="">{say('소지품 선택', 'Choose belongings', '持ち物を選ぶ')}</option>{available.map(good => <option key={good.key} value={good.key}>{good.label}</option>)}</select><input aria-label={say('교환 수량', 'Exchange quantity', '交換数')} type="number" min="1" max={selected?.count ?? 1} value={count} onChange={e => setCount(e.target.value)}/><ReasonButton className="fr-btn" disabled={busy || !validCount || goods.length >= 12} reason={reason ?? say('물품과 올바른 수량을 선택하세요.', 'Choose goods and a valid quantity.', '品物と正しい数を選んでください。')} onClick={add}>{say('추가', 'Add', '追加')}</ReasonButton></div>
        {goods.map((good, i) => <div className="fr-economy-row" key={`${good.item}-${good.instance ?? ''}`}><span>{name(good.item)} ×{good.count}</span><button className="fr-btn" onClick={() => setGoods(goods.filter((_, n) => n !== i))}>{say('제외', 'Remove', '外す')}</button></div>)}
        <div className="fr-economy-fields"><ReasonButton className="fr-btn" disabled={busy || !validGold} reason={reason ?? say('소지금 안에서 금액을 입력하세요.', 'Enter an amount within your gold.', '所持金以内の額を入力してください。')} onClick={() => onCommand({ type: 'offer', trade: trade.id, revision: trade.revision, gold: cash, items: goods })}>{say('제안 갱신', 'Update offer', '提示を更新')}</ReasonButton><ReasonButton className="fr-btn" disabled={busy || dirty || !!own?.confirmed} reason={reason ?? (dirty ? say('변경한 제안을 먼저 갱신하세요.', 'Update your changed offer first.', '変更した提示を先に更新してください。') : say('이 제안은 이미 승인했습니다.', 'You already confirmed these terms.', 'この提示は承認済みです。'))} onClick={() => onCommand({ type: 'confirm', trade: trade.id, revision: trade.revision })}>{say('이 제안으로 교환 승인', 'Confirm these exchange terms', 'この内容で交換を承認')}</ReasonButton><ReasonButton className="fr-btn" disabled={pending} reason={reason} onClick={() => onCommand({ type: 'cancel', trade: trade.id, revision: trade.revision })}>{say('거래 취소', 'Cancel trade', '取引を取り消す')}</ReasonButton></div>
      </>}
      {state?.trades.filter(trade => trade.status !== 'open').slice(-2).map(trade => <p className="fr-muted" key={trade.id}>{trade.names[1 - trade.mine]} · {trade.status === 'completed' ? say('교환 완료', 'Exchange completed', '交換完了') : say('거래 종료', 'Trade closed', '取引終了')}</p>)}
    </>}
    <input aria-label={say('물건 찾기', 'Find goods', '品物を探す')} placeholder={say('물건 찾기', 'Find goods', '品物を探す')} value={query} onChange={e => setQuery(e.target.value)}/>
    {state?.shops.filter(shop => !selectedShop || shop.building === selectedShop).map(shop => <details key={shop.building} open={!!selectedShop}><summary>{fantasyBuildings(c).find(b => b.id === shop.building)?.name[locale] ?? shop.building}</summary>
      {shop.lots.filter(lot => name(lot.item).toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(lot => <div className="fr-economy-row" key={lot.id}><span>{name(lot.item)}{lot.gearQuality ? ` · ${'★'.repeat(lot.gearQuality)}` : ''}<small>{say('재고', 'Stock', '在庫')} {lot.count}</small></span><b>{lot.unitPrice} G</b><ReasonButton className="fr-btn" disabled={busy || lot.count < 1 || c.gold < lot.unitPrice} reason={reason ?? (lot.count < 1 ? say('품절입니다.', 'Sold out.', '売り切れです。') : say('소지금이 부족합니다.', 'Not enough gold.', '所持金が足りません。'))} onClick={() => onCommand({ type: 'shopBuy', building: shop.building, item: lot.item, lot: lot.id, count: 1, revision: shop.revision, quotedUnitPrice: lot.unitPrice })}>{say('구매', 'Buy', '買う')}</ReasonButton></div>)}
      <details><summary>{say('소지품 판매', 'Sell belongings', '持ち物を売る')}</summary>{shop.sales.filter(good => name(good.item).toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(good => <div className="fr-economy-row" key={good.key}><span>{name(good.item)} ×{good.count}{good.quality && <small>{quality[good.quality]}</small>}</span><b>{good.unitPrice} G</b><ReasonButton className="fr-btn" disabled={busy || !good.canSell} reason={reason ?? say('착용 여부나 물품 상태를 확인하세요.', 'Check equipment and condition.', '装備と品物の状態を確認してください。')} onClick={() => onCommand({ type: 'shopSell', building: shop.building, item: good.item, count: 1, revision: shop.revision, quotedUnitPrice: good.unitPrice, ...(good.quality ? { quality: good.quality } : {}), ...(good.instance ? { instance: good.instance } : {}) })}>{say('1개 판매', 'Sell one', '1個売る')}</ReasonButton></div>)}</details>
    </details>)}
  </section>;
}
