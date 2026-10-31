import { FantasyBusinessPanel } from './FantasyBusinessPanel.tsx';
import { useState } from 'react';
import type { FantasyAction, FantasyProfile } from '../../../shared/fantasy.ts';
import { FANTASY_ITEMS } from '../../../shared/fantasy-data.ts';
import { FANTASY_TERMS } from '../../../shared/fantasy-lore.ts';
import { fantasyPropertyText, fantasyPropertyUseError, type FantasyPropertyCommand, type FantasyPropertyState, type FantasyPropertyView } from '../../../shared/fantasy-property.ts';
import { FANTASY_PROPERTY_BLUEPRINTS, type FantasyPropertyBlueprint } from '../../../shared/fantasy-property-extensions.ts';
import { FANTASY_FURNITURE, fantasyFurnitureCanPlace } from '../../../shared/fantasy-furniture.ts';
import { fantasyBagChangeError } from '../../../shared/fantasy-bags.ts';
import { useLocale } from '../locale.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { realDuration } from './FantasyActivity.tsx';
import './fantasy-property.css';

interface Props {
  profile: FantasyProfile; state: FantasyPropertyState | null; pending: boolean; error: string | null;
  onCommand: (command: FantasyPropertyCommand) => void; onAction?: (action: FantasyAction) => void;
}
export function FantasyPropertyPanel({ profile, state, pending, error, onCommand, onAction }: Props) {
  const [locale] = useLocale(), [confirmation, setConfirmation] = useState<{ plot: string; revision: number; type: 'buy' | 'list' | 'cancel'; price?: number } | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  const c = profile.character;
  const busy = pending || !!profile.activity || !!profile.combatId || !!profile.event || !!profile.death || !c || c.hp <= 0;
  const busyReason = pending ? say('요청을 확인 중입니다.', 'Waiting for the request.', '依頼を確認しています。')
    : busy ? say('현재 행동이나 사건을 먼저 마쳐 주세요.', 'Finish the current activity or encounter first.', 'いまの行動や出来事を先に終えてください。') : undefined;
  const itemName = (id: string) => FANTASY_ITEMS.find(item => item.id === id)?.names?.[locale] ?? FANTASY_TERMS.find(term => term.category === 'item' && term.id === id)?.names[locale] ?? id;
  const send = (command: FantasyPropertyCommand) => { if (!busy || command.type === 'sync') onCommand(command); };
  const execute = () => {
    if (!confirmation || busy) return;
    const { plot, revision, type, price } = confirmation;
    const base = { plot, revision, requestId: crypto.randomUUID() };
    send(type === 'list' ? { ...base, type, price: price! } : { ...base, type });
    setConfirmation(null);
  };
  const confirmPlot = state?.plots.find(plot => plot.id === confirmation?.plot);
  const ownedCount = state?.owned.filter(plot => plot.ownedByMe).length ?? 0;
  const renderPlot = (plot: FantasyPropertyView, remote = false) => {
    const kind = plot.kind === 'farmland' ? say('농지', 'Farmland', '農地') : plot.kind === 'commercial' ? say('상업', 'Commercial', '商業') : say('거주', 'Residence', '住居');
    const price = Number(prices[plot.id] ?? String(plot.initialPrice)), validPrice = Number.isSafeInteger(price) && price >= 1 && price <= 1_000_000;
    const useError = fantasyPropertyUseError(profile, plot.id);
    const useReason = busyReason ?? (plot.listed ? say('매물 등록을 취소한 뒤 이용하세요.', 'Withdraw the listing before using it.', '売り出しを取り消してから利用してください。')
      : plot.management && !plot.management.canUse ? plot.management.tenant && plot.management.lease && plot.management.lease.endsAt - (c?.hour ?? 0) < plot.hours ? say('임대가 끝나기 전에 이 행동을 마칠 수 없습니다.', 'This activity would finish after the lease ends.', 'この行動は賃貸期間内に終わりません。') : fantasyPropertyText(plot.management.taxDue ? 'tax-due' : 'occupied', locale)
      : useError ? fantasyPropertyText(useError, locale) : undefined);
    return <article key={plot.id} className="fr-property-card">
      <span className="fr-eyebrow">{kind}</span><h3>{plot.names[locale]}</h3>
      <p className="fr-muted">{plot.ownerName ? say(`소유자: ${plot.ownerName}`, `Owner: ${plot.ownerName}`, `所有者：${plot.ownerName}`) : say('새 매물', 'New listing', '新しい売り物件')}{plot.estate && ` · ${say('지난 삶의 유산', 'Past-life estate', '過去の生の遺産')}`}</p>
      {plot.listed && <p><b>{plot.price}G</b></p>}
      {remote ? <p className="fr-muted">{say('현지에서 이용·거래할 수 있습니다.', 'Visit the property to use or trade it.', '現地で利用・売買できます。')}</p>
        : plot.estate && !plot.management?.tenant ? <p className="fr-muted">{fantasyPropertyText('estate', locale)}</p>
          : plot.ownedByMe || plot.management?.tenant ? <>
            <ReasonButton className="fr-btn primary" disabled={!!useReason} reason={useReason} onClick={() => send({ type: 'use', plot: plot.id, revision: plot.revision, requestId: crypto.randomUUID() })}>
              {plot.kind === 'residence' ? say('집에서 쉬기 · 피로 -75 · HP +30 · MP +15', 'Rest at home · Fatigue -75 · HP +30 · MP +15', '家で休む・疲労-75・HP+30・MP+15')
                : plot.kind === 'farmland' ? say(`돌보고 수확하기 · ${itemName(plot.output!)} 2~4개`, `Tend and harvest · ${itemName(plot.output!)} ×2–4`, `手入れして収穫・${itemName(plot.output!)} 2～4個`)
                  : say(`영업하기 · ${itemName(plot.input!)} 1개 사용`, `Operate · Uses ${itemName(plot.input!)} ×1`, `営業する・${itemName(plot.input!)}を1個使用`)}
              <small className="fr-action-time">{realDuration(plot.hours, locale)}</small>
            </ReasonButton>
            {plot.management?.manager && <details><summary>{say('판매 관리', 'Manage sale', '売却管理')}</summary>
              {plot.listed ? <ReasonButton className="fr-btn" disabled={busy} reason={busyReason} onClick={() => setConfirmation({ plot: plot.id, revision: plot.revision, type: 'cancel' })}>{say('매물 등록 취소', 'Withdraw listing', '売り出しを取り消す')}</ReasonButton>
                : <div className="fr-property-price"><label>{say('판매 가격', 'Sale price', '売却価格')}<input type="number" min="1" max="1000000" value={prices[plot.id] ?? String(plot.initialPrice)} onChange={event => setPrices({ ...prices, [plot.id]: event.target.value })} /></label><ReasonButton className="fr-btn" disabled={busy || !validPrice} reason={busyReason ?? (!validPrice ? say('1~1,000,000G 사이의 정수를 입력하세요.', 'Enter a whole price from 1 to 1,000,000G.', '1～1,000,000Gの整数を入力してください。') : undefined)} onClick={() => setConfirmation({ plot: plot.id, revision: plot.revision, type: 'list', price })}>{say('매물로 내놓기', 'List for sale', '売りに出す')}</ReasonButton></div>}
            </details>}
          </> : plot.listed ? <ReasonButton className="fr-btn primary" disabled={busy || (c?.gold ?? 0) < plot.price! || ownedCount >= 3} reason={busyReason ?? ((c?.gold ?? 0) < plot.price! ? fantasyPropertyText('insufficient-gold', locale) : ownedCount >= 3 ? fantasyPropertyText('limit', locale) : undefined)} onClick={() => setConfirmation({ plot: plot.id, revision: plot.revision, type: 'buy', price: plot.price! })}>{say(`${plot.price}G에 구매`, `Buy for ${plot.price}G`, `${plot.price}Gで購入`)}</ReasonButton> : <p className="fr-muted">{say('판매 중이 아닙니다.', 'Not for sale.', '売り出していません。')}</p>}
      {!remote && <PropertyManagement profile={profile} plot={plot} busy={busy} busyReason={busyReason} onCommand={send} />}
      {!remote && state && plot.business && <FantasyBusinessPanel profile={profile} plot={plot} state={state} onAction={onAction} reason={busyReason ?? (plot.management?.canUse ? undefined : useReason)} onCommand={send} />}
      {plot.kind === 'residence' && (plot.ownedByMe || plot.management?.tenant || !!plot.furniture?.length) && <PropertyFurniture profile={profile} plot={plot} reason={remote ? say('가구를 옮기려면 현지로 가세요.', 'Visit the home to move furniture.', '家具を動かすには現地を訪ねてください。') : useReason} onCommand={send} />}
    </article>;
  };
  return <section className="fr-property"><h2>{say('부동산', 'Property', '不動産')}</h2>
    {error && <p role="alert" className="fr-error">{fantasyPropertyText(error, locale) ?? error}</p>}
    <ReasonButton className="fr-btn" disabled={pending} reason={pending ? busyReason : undefined} onClick={() => send({ type: 'sync' })}>{say('매물 새로 보기', 'Refresh listings', '物件を更新')}</ReasonButton>
    {state ? <>
      {!state.plots.length && <p className="fr-muted">{say('도시·마을·항구에서 현지 매물을 볼 수 있습니다.', 'View local property in a city, village or port.', '街・里・港で現地の物件を確認できます。')}</p>}
      <div className="fr-property-grid">{state.plots.map(plot => renderPlot(plot))}</div>
      {!!state.owned.filter(plot => plot.location !== c?.location).length && <details><summary>{say('다른 지역의 내 부동산', 'My property elsewhere', '別の地域の自分の不動産')}</summary>{state.owned.filter(plot => plot.location !== c?.location).map(plot => renderPlot(plot, true))}</details>}
      {!!state.legacies.length && <details><summary>{say('지난 삶의 유산', 'Past-life estates', '過去の生の遺産')}</summary>{state.legacies.map(plot => <p key={plot.id}>{plot.names[locale]} · {plot.ownerName}</p>)}</details>}
    </> : <p className="fr-muted">{say('매물을 확인하고 있습니다.', 'Loading property.', '物件を確認しています。')}</p>}
    {confirmation && confirmPlot && <div className="fr-property-confirm" role="dialog" aria-modal="false" aria-label={say('거래 확인', 'Confirm transaction', '取引の確認')}>
      <p><b>{confirmPlot.names[locale]}</b></p><p>{confirmation.type === 'buy' ? say(`${confirmation.price}G를 지불하고 구매할까요?`, `Buy for ${confirmation.price}G?`, `${confirmation.price}Gを支払い購入しますか？`)
        : confirmation.type === 'list' ? say(`${confirmation.price}G에 판매할까요? 다른 사람이 구매하면 소유권이 이전됩니다.`, `List for ${confirmation.price}G? Ownership transfers when another traveler buys it.`, `${confirmation.price}Gで売りに出しますか？ほかの旅人が買うと所有権が移ります。`)
          : say('매물 등록을 취소할까요?', 'Withdraw this listing?', '売り出しを取り消しますか？')}</p>
      <div className="fr-action-grid"><ReasonButton className="fr-btn primary" disabled={busy || confirmPlot.revision !== confirmation.revision} reason={busyReason ?? (confirmPlot.revision !== confirmation.revision ? fantasyPropertyText('stale', locale) : undefined)} onClick={execute}>{say('확인', 'Confirm', '確認')}</ReasonButton><button className="fr-btn" onClick={() => setConfirmation(null)}>{say('닫기', 'Close', '閉じる')}</button></div>
    </div>}
  </section>;
}

function PropertyFurniture({ profile, plot, reason, onCommand }: { profile: FantasyProfile; plot: FantasyPropertyView; reason?: string; onCommand: (command: FantasyPropertyCommand) => void }) {
  const [locale] = useLocale(), c = profile.character;
  if (!c) return null;
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale], installed = plot.furniture ?? [];
  const available = FANTASY_FURNITURE.filter(furniture => (c.inventory[furniture.item] ?? 0) > 0);
  const manage = plot.ownedByMe || plot.management?.tenant;
  return <details className="fr-property-furniture"><summary>{say('집 안의 가구', 'Home furniture', '家の家具')} · {installed.length}/10</summary>
    <p className="fr-muted">{say('침대 1개 · 작업대·궤·식탁·책상·서랍장 각 1개 · 장식 4점. 침대의 추가 회복은 집에서 8시간 쉬기를 마칠 때 적용됩니다.', 'One bed, one workbench, chest, table, desk and drawers, and four decorations. Extra bed recovery applies after eight hours of home rest.', '寝台1台・作業台と長櫃と食卓と机と箪笥は各1台・装飾4点。寝台の追加回復は自宅で8時間休み終えた時に得られます。')}</p>
    {!installed.length && <p className="fr-muted">{say('아직 설치한 가구가 없습니다.', 'No furniture installed yet.', 'まだ家具を置いていません。')}</p>}
    {installed.map((furniture, index) => {
      const after = { ...profile, character: { ...c, inventory: { ...c.inventory, [furniture.item]: (c.inventory[furniture.item] ?? 0) + 1 } } };
      const blocked = reason ?? (!furniture.canRemove ? say('집의 소유자나 이 가구를 설치한 임차인만 회수할 수 있습니다.', 'Only a home owner or the tenant who installed this furnishing can recover it.', '家の所有者か、この家具を置いた借主だけが回収できます。') : fantasyBagChangeError(profile, after) ? fantasyPropertyText('bag-full', locale) : undefined);
      return <div className="fr-property-furniture-row" key={`${furniture.item}-${index}`}><b>{furniture.names[locale]}</b><p className="fr-muted">{furniture.descriptions[locale]}</p>
        {manage && <ReasonButton className="fr-btn" disabled={!!blocked} reason={blocked} onClick={() => onCommand({ type: 'unfurnish', plot: plot.id, revision: plot.revision, requestId: crypto.randomUUID(), item: furniture.item })}>{say('소지품으로 회수', 'Recover to bag', '鞄に回収する')}</ReasonButton>}
      </div>;
    })}
    {manage && <><h4>{say('소지품에서 설치', 'Install from your bag', '鞄から設置する')}</h4>
      {!available.length && <p className="fr-muted">{say('목수가 만든 가구를 소지하면 여기에 표시됩니다.', 'Furniture made by a carpenter appears here when carried.', '木工職人が作った家具を持つと、ここに表示されます。')}</p>}
      {available.map(furniture => {
        const blocked = reason ?? (!fantasyFurnitureCanPlace(installed, furniture.item) ? fantasyPropertyText('furniture-limit', locale) : undefined);
        return <div className="fr-property-furniture-row" key={furniture.item}><p className="fr-muted">{furniture.descriptions[locale]}</p><ReasonButton className="fr-btn" disabled={!!blocked} reason={blocked} onClick={() => onCommand({ type: 'furnish', plot: plot.id, revision: plot.revision, requestId: crypto.randomUUID(), item: furniture.item })}>{say(`${furniture.names[locale]} 설치 · 보유 ${c.inventory[furniture.item]}개`, `Install ${furniture.names[locale]} · Owned ${c.inventory[furniture.item]}`, `${furniture.names[locale]}を設置・所持${c.inventory[furniture.item]}個`)}</ReasonButton></div>;
      })}
    </>}
  </details>;
}

const BLUEPRINT_NAMES: Record<FantasyPropertyBlueprint, [string, string, string]> = {
  irrigation: ['관개 수로', 'Irrigation channels', '灌漑水路'], greenhouse: ['온실', 'Greenhouse', '温室'], granary: ['곡물 창고', 'Granary', '穀物庫'],
  workshop: ['작업장', 'Workshop', '作業場'], shopfront: ['상점 진열대', 'Shopfront', '店先'], storehouse: ['재료 창고', 'Storehouse', '資材庫'],
  hearth: ['따뜻한 난로', 'Warm hearth', '暖炉'], bedroom: ['아늑한 침실', 'Comfortable bedroom', '寝室'], garden: ['작은 정원', 'Small garden', '小さな庭'],
};
function PropertyManagement({ profile, plot, busy, busyReason, onCommand }: { profile: FantasyProfile; plot: FantasyPropertyView; busy: boolean; busyReason?: string; onCommand: (command: FantasyPropertyCommand) => void }) {
  const [locale] = useLocale(), m = plot.management, c = profile.character;
  const [target, setTarget] = useState(''), [rent, setRent] = useState('5'), [days, setDays] = useState('3'), [percent, setPercent] = useState('20');
  const [price, setPrice] = useState(String(plot.initialPrice)), [stock, setStock] = useState('1'), [blueprint, setBlueprint] = useState<FantasyPropertyBlueprint>(FANTASY_PROPERTY_BLUEPRINTS[plot.kind][0]);
  const [confirmation, setConfirmation] = useState<{ command: FantasyPropertyCommand; summary: string } | null>(null);
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  if (!m || !c) return null;
  const names = (value: FantasyPropertyBlueprint) => BLUEPRINT_NAMES[value][locale === 'ko' ? 0 : locale === 'en' ? 1 : 2];
  const base = () => ({ plot: plot.id, revision: plot.revision, requestId: crypto.randomUUID() });
  const queue = (command: FantasyPropertyCommand, summary: string) => setConfirmation({ command, summary });
  const whole = (value: string, min: number, max: number) => Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max;
  const blocked = (reason?: string) => busyReason ?? reason;
  const activeContract = !!m.lease?.active, occupied = plot.listed || !!m.auction || !!m.construction || activeContract;
  const occupation = occupied ? say('매매·임대·공사 중에는 이용할 수 없습니다.', 'Unavailable during a sale, lease or construction.', '売買・賃貸・工事の間は利用できません。') : undefined;
  const button = (label: string, command: FantasyPropertyCommand, summary = label, reason?: string) => {
    let inferred: string | undefined;
    if (command.type === 'build') inferred = c.gold < (m.level + 1) * 40 ? 'insufficient-gold' : (c.inventory.wood ?? 0) < 3 + (m.level + 1) * 2 || (c.inventory.ore ?? 0) < m.level + 1 ? 'missing-material' : undefined;
    if (command.type === 'maintain' && c.gold < 10 + m.level * 5) inferred = 'insufficient-gold';
    if (command.type === 'autoStock') inferred = c.gold < command.count * 2 ? 'insufficient-gold' : (c.inventory[plot.input ?? plot.output!] ?? 0) < command.count ? 'missing-material' : (m.automation?.stock ?? 0) + command.count > 99 ? 'limit' : undefined;
    if (command.type === 'autoToggle' && command.enabled && (!m.automation?.stock || !m.condition)) inferred = 'missing-material';
    if ((command.type === 'autoStock' || command.type === 'autoToggle' && command.enabled) && m.taxDue) inferred = 'tax-due';
    if (command.type === 'claim' && c.gold >= 1_000_000) inferred = 'limit';
    if (command.type === 'auctionStart' && command.price < m.taxDue) inferred = 'tax-due';
    if (command.type === 'shareOffer' && (m.shares.length >= 3 || m.shares.filter(s => !s.mine).reduce((n, s) => n + s.percent, 0) + command.percent > 49)) inferred = 'limit';
    const finalReason = reason ?? (inferred ? fantasyPropertyText(inferred, locale) : undefined);
    return <ReasonButton className="fr-btn" disabled={busy || !!finalReason} reason={blocked(finalReason)} onClick={() => queue(command, summary)}>{label}</ReasonButton>;
  };
  const input = (label: string, value: string, setter: (value: string) => void, min = 1, max = 1_000_000) => <label>{label}<input type="number" min={min} max={max} value={value} onChange={e => setter(e.target.value)} /></label>;
  const invalid = say('값을 확인해 주세요.', 'Check the entered value.', '入力した値を確認してください。');
  return <div className="fr-property-management">
    {!!m.level && <p className="fr-muted">{m.blueprint && names(m.blueprint)} · {say(`개축 ${m.level}단계`, `Upgrade ${m.level}`, `改築${m.level}段階`)}</p>}
    {m.bargain && <p className="fr-muted">{say('중개 견적', 'Broker quote', '仲介見積もり')} {m.bargain.price}G · D100 {m.bargain.roll}/{m.bargain.target}</p>}
    {!!m.credit && button(say(`보관금 ${m.credit}G 받기`, `Claim ${m.credit}G`, `預り金${m.credit}Gを受領`), { type: 'claim', ...base() })}
    {m.shareOffer?.forMe && button(say(`${m.shareOffer.percent}% 공동명의 수락`, `Accept ${m.shareOffer.percent}% co-ownership`, `${m.shareOffer.percent}%の共同名義を承諾`), { type: 'shareAccept', ...base() }, say(`${plot.names[locale]} 지분 ${m.shareOffer.percent}%를 받습니다.`, `Accept ${m.shareOffer.percent}% of ${plot.names[locale]}.`, `${plot.names[locale]}の持分${m.shareOffer.percent}%を受け取ります。`))}
    {m.lease?.forMe && !m.lease.active && button(say(`임대 수락 · ${m.lease.rent * m.lease.days}G`, `Accept lease · ${m.lease.rent * m.lease.days}G`, `賃貸を承諾・${m.lease.rent * m.lease.days}G`), { type: 'leaseAccept', ...base() }, say(`${m.lease.days}일간 ${m.lease.rent * m.lease.days}G를 선불로 냅니다.`, `Prepay ${m.lease.rent * m.lease.days}G for ${m.lease.days} days.`, `${m.lease.days}日分${m.lease.rent * m.lease.days}Gを前払いします。`), c.gold < m.lease.rent * m.lease.days ? fantasyPropertyText('insufficient-gold', locale) : undefined)}
    {m.tenant && <details><summary>{say('임대 계약', 'Lease contract', '賃貸契約')}</summary><p>{say(`세계 시각 ${m.lease!.endsAt.toFixed(1)}까지`, `Until world hour ${m.lease!.endsAt.toFixed(1)}`, `世界時刻${m.lease!.endsAt.toFixed(1)}まで`)}</p>{button(say('임대 종료', 'End lease', '賃貸を終了'), { type: 'leaseEnd', ...base() }, say('임대를 종료합니다. 남은 기간의 임대료는 환불되지 않습니다.', 'End the lease. Prepaid rent is not refunded for unused time.', '賃貸を終了します。残り期間の前払家賃は返金されません。'))}</details>}
    {(m.manager || plot.ownedByMe) && <details><summary>{say('소유·계약', 'Ownership and contracts', '所有・契約')}</summary>
      <p>{m.shares.map(s => `${s.name} ${s.percent}%${s.estate ? ` · ${say('유산', 'Estate', '遺産')}` : ''}`).join(' / ')}</p>
      {m.sale && <><p>{say('매각 동의', 'Sale consent', '売却同意')} {m.sale.approved}/{m.sale.total} · {m.sale.price}G</p>{button(say('이 가격의 매각에 동의', 'Approve this sale price', 'この価格での売却に同意'), { type: 'approveSale', ...base() }, `${m.sale.price}G`, m.sale.mine ? say('이미 동의했습니다.', 'Already approved.', '同意済みです。') : undefined)}</>}
      {!m.manager && button(say('지분 반환', 'Return my share', '持分を返還'), { type: 'leaveShare', ...base() }, say('내 지분을 대표 소유자에게 무상 반환합니다.', 'Return my share to the principal owner without payment.', '自分の持分を代表所有者へ無償返還します。'), occupation)}
      {m.manager && <><label>{say('상대 인물 이름', 'Other traveler’s name', '相手の人物名')}<input maxLength={24} value={target} onChange={e => setTarget(e.target.value)} /></label>
        <details><summary>{say('임대 제안', 'Offer a lease', '賃貸を提案')}</summary>
          <div className="fr-property-fields">{input(say('하루 임대료', 'Daily rent', '一日の家賃'), rent, setRent, 1, 10000)}{input(say('기간 · 세계 일', 'World days', '世界日数'), days, setDays, 1, 15)}</div>
          {button(say('계약 제안 보내기', 'Send lease offer', '賃貸契約を提案'), { type: 'leaseOffer', ...base(), target: target.trim(), rent: Number(rent), days: Number(days) }, say(`${target}에게 ${days}일·하루 ${rent}G 임대를 제안합니다.`, `Offer ${target} ${days} days at ${rent}G per day.`, `${target}へ${days}日間、一日${rent}Gの賃貸を提案します。`), occupation ?? (!target.trim() || !whole(rent, 1, 10000) || !whole(days, 1, 15) ? invalid : m.shares.length > 1 ? fantasyPropertyText('consent', locale) : undefined))}
          {m.lease && <><p>{m.lease.name} · {m.lease.active ? say('계약 중', 'Active', '契約中') : say('수락 대기', 'Awaiting consent', '承諾待ち')}</p>{button(say('임대 제안 취소', 'Cancel lease offer', '賃貸提案を取り消す'), { type: 'leaseEnd', ...base() }, undefined, m.lease.active ? say('유효한 임대는 소유자가 조기 종료할 수 없습니다.', 'The landlord cannot end an active lease early.', '有効な賃貸契約を所有者が途中解除することはできません。') : undefined)}</>}
        </details>
        <details><summary>{say('공동명의 제안', 'Offer co-ownership', '共同名義を提案')}</summary>{input(say('양도 지분 · %', 'Share to grant · %', '譲渡する持分・%'), percent, setPercent, 1, 49)}
          {button(say('지분 제안 보내기', 'Offer a share', '持分を提案'), { type: 'shareOffer', ...base(), target: target.trim(), percent: Number(percent) }, say(`${target}에게 지분 ${percent}%를 무상으로 제안합니다. 수락 후 임의 회수할 수 없습니다.`, `Offer ${target} ${percent}% without payment. An accepted share cannot be revoked.`, `${target}へ持分${percent}%を無償で提案します。承諾後に取り戻すことはできません。`), occupation ?? (!target.trim() || !whole(percent, 1, 49) ? invalid : undefined))}
          {m.shareOffer && button(say('지분 제안 취소', 'Cancel share offer', '持分提案を取り消す'), { type: 'shareRevoke', ...base() })}
        </details></>}
    </details>}
    {(m.manager || plot.ownedByMe) && <details><summary>{say('건물·세금·정비', 'Building, tax and maintenance', '建物・税・整備')}</summary>
      <p>{say('상태', 'Condition', '状態')} {m.condition}/100 · {say('미납 세금', 'Tax due', '未納税')} {m.taxDue}G</p>
      {button(say(`세금 납부 · ${m.taxDue}G`, `Pay tax · ${m.taxDue}G`, `納税・${m.taxDue}G`), { type: 'payTax', ...base() }, undefined, !m.taxDue ? fantasyPropertyText('no-due', locale) : c.gold < m.taxDue ? fantasyPropertyText('insufficient-gold', locale) : undefined)}
      {button(say(`정비 · ${10 + m.level * 5}G · 목재1 철광석1`, `Maintain · ${10 + m.level * 5}G · Wood1 Ore1`, `整備・${10 + m.level * 5}G・木材1 鉱石1`), { type: 'maintain', ...base() }, undefined, m.condition === 100 ? fantasyPropertyText('no-due', locale) : (c.inventory.wood ?? 0) < 1 || (c.inventory.ore ?? 0) < 1 ? fantasyPropertyText('missing-material', locale) : undefined)}
      {m.construction ? <p>{names(m.construction.blueprint)} · {realDuration(Math.max(0, m.construction.endsAt - c.hour), locale)}</p> : m.manager && m.level < 3 && <>
        <label>{say('개축 설계', 'Upgrade blueprint', '改築設計')}<select value={blueprint} onChange={e => setBlueprint(e.target.value as FantasyPropertyBlueprint)}>{FANTASY_PROPERTY_BLUEPRINTS[plot.kind].map(b => <option key={b} value={b}>{names(b)}</option>)}</select></label>
        {button(say(`개축 · ${(m.level + 1) * 40}G · 목재${3 + (m.level + 1) * 2} 철광석${m.level + 1}`, `Build · ${(m.level + 1) * 40}G · Wood${3 + (m.level + 1) * 2} Ore${m.level + 1}`, `改築・${(m.level + 1) * 40}G・木材${3 + (m.level + 1) * 2} 鉱石${m.level + 1}`), { type: 'build', ...base(), blueprint }, `${names(blueprint)} · ${realDuration((m.level + 1) * 4, locale)}`, occupation ?? (m.taxDue ? fantasyPropertyText('tax-due', locale) : undefined))}
      </>}
    </details>}
    {m.manager && (plot.kind === 'farmland' || !!m.automation?.stock) && <details><summary>{say('고용 영업', 'Staffed operation', '雇用営業')}</summary>
      <p>{say('재료', 'Supplies', '材料')} {m.automation?.stock ?? 0} · {say('임금', 'Wages', '賃金')} {m.automation?.wages ?? 0}G</p>
      {input(say('맡길 재료 수량', 'Supplies to stock', '預ける材料の数'), stock, setStock, 1, 99)}
      {plot.kind === 'farmland' && button(say('재료·임금 맡기기', 'Stock supplies and wages', '材料と賃金を預ける'), { type: 'autoStock', ...base(), count: Number(stock) }, say(`재료 ${stock}개와 임금 ${Number(stock) * 2}G를 맡깁니다.`, `Stock ${stock} supplies and ${Number(stock) * 2}G in wages.`, `材料${stock}個と賃金${Number(stock) * 2}Gを預けます。`), occupation ?? (!whole(stock, 1, 99) ? invalid : undefined))}
      {button(say('남은 재료·임금 돌려받기', 'Withdraw unused supplies and wages', '残りの材料と賃金を回収'), { type: 'autoWithdraw', ...base(), count: Number(stock) }, say(`재료 ${stock}개와 미사용 임금 ${Number(stock) * 2}G를 회수합니다.`, `Recover ${stock} supplies and ${Number(stock) * 2}G unused wages.`, `材料${stock}個と未使用賃金${Number(stock) * 2}Gを回収します。`), m.automation?.enabled ? say('고용 영업을 먼저 중지하세요.', 'Pause staffed work first.', '先に雇用営業を停止してください。') : !whole(stock, 1, 99) || (m.automation?.stock ?? 0) < Number(stock) ? invalid : undefined)}
      {plot.kind === 'farmland' && button(m.automation?.enabled ? say('고용 영업 중지', 'Pause staffed work', '雇用営業を停止') : say('고용 영업 시작', 'Start staffed work', '雇用営業を開始'), { type: 'autoToggle', ...base(), enabled: !m.automation?.enabled }, undefined, occupation ?? (!m.automation?.enabled && !m.automation?.stock ? fantasyPropertyText('missing-material', locale) : undefined))}
    </details>}
    {(m.manager || plot.estate || m.auction) && <details><summary>{say('경매', 'Auction', '競売')}</summary>
      {m.auction ? <><p>{m.auction.bidder ?? say('입찰 없음', 'No bids', '入札なし')} · {m.auction.highest}G</p><p>{realDuration(Math.max(0, m.auction.endsAt - c.hour), locale)}</p>
        {!plot.ownedByMe && <>{input(say('입찰액', 'Bid amount', '入札額'), price, setPrice, m.auction.minimum)}{button(say('입찰금 예치', 'Place an escrowed bid', '入札金を預託'), { type: 'bid', ...base(), amount: Number(price) }, say(`${price}G를 예치합니다. 낙찰되지 않으면 반환됩니다.`, `Escrow ${price}G. It is refunded if outbid.`, `${price}Gを預託します。落札しなければ返還されます。`), !whole(price, m.auction.minimum, 1_000_000) ? say(`최소 ${m.auction.minimum}G입니다.`, `Minimum ${m.auction.minimum}G.`, `最低${m.auction.minimum}Gです。`) : c.gold + (m.auction.mine ? m.auction.highest : 0) < Number(price) ? fantasyPropertyText('insufficient-gold', locale) : undefined)}</>}
        {m.manager && button(say('경매 취소', 'Cancel auction', '競売を取り消す'), { type: 'auctionCancel', ...base() }, undefined, m.auction.highest ? say('입찰이 있는 경매는 취소할 수 없습니다.', 'An auction with a bid cannot be cancelled.', '入札済みの競売は取り消せません。') : undefined)}
      </> : <>{input(say('최저 경매가', 'Reserve price', '最低競売価格'), price, setPrice)}{button(plot.estate ? say('유산 공개 경매 열기', 'Open estate auction', '遺産の公開競売を開く') : say('경매 열기', 'Open auction', '競売を開く'), { type: 'auctionStart', ...base(), price: Number(price) }, say(`${price}G부터 하루 동안 공개 경매합니다. 입찰 후 취소할 수 없습니다.`, `Auction for one world day from ${price}G. It cannot be cancelled after a bid.`, `${price}Gから世界一日間競売します。入札後は取り消せません。`), occupation ?? (!whole(price, 1, 1_000_000) ? invalid : undefined))}</>}
    </details>}
    {confirmation && <div className="fr-property-confirm" role="dialog" aria-label={say('계약 확인', 'Confirm property operation', '契約確認')}><p>{confirmation.summary}</p><div className="fr-action-grid"><ReasonButton className="fr-btn primary" disabled={busy || confirmation.command.type !== 'sync' && confirmation.command.revision !== plot.revision} reason={busyReason ?? (confirmation.command.type !== 'sync' && confirmation.command.revision !== plot.revision ? fantasyPropertyText('stale', locale) : undefined)} onClick={() => { onCommand(confirmation.command); setConfirmation(null); }}>{say('확인', 'Confirm', '確認')}</ReasonButton><button className="fr-btn" onClick={() => setConfirmation(null)}>{say('닫기', 'Close', '閉じる')}</button></div></div>}
  </div>;
}
