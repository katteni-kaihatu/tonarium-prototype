import { useState } from 'react';
import type { FantasyProfile } from '../../../shared/fantasy.ts';
import type { NpcLocale } from '../../../shared/npc.ts';
import { fantasyBlackMarketText, type FantasyBlackMarketAction, type FantasyBlackMarketState } from '../../../shared/fantasy-black-market.ts';
import { fantasyBagText } from '../../../shared/fantasy-bags.ts';
import { useLocale } from '../locale.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { FantasyWorkforceMenu } from './FantasyWorkforceMenu.tsx';
import { itemDisplayName } from './fantasy-action-help.ts';
import './fantasy-black-market.css';

interface Props { profile: FantasyProfile; state: FantasyBlackMarketState | null; hour: number; pending: boolean; error: string | null; onCommand: (command: FantasyBlackMarketAction) => void; locale?: NpcLocale }
export function FantasyBlackMarketPanel({ profile, state, hour, pending, error, onCommand, locale: requestedLocale }: Props) {
  const [selectedLocale] = useLocale(), [amounts, setAmounts] = useState<Record<string, string>>({}), locale = requestedLocale ?? selectedLocale;
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale], c = profile.character;
  if (!c || !state?.known) return null;
  const busy = pending || !!profile.activity || !!profile.combatId || !!profile.event || !!profile.death || !!c.downed;
  const reason = pending ? say('요청을 확인 중입니다.', 'Waiting for the request.', '依頼を確認しています。') : busy ? say('현재 일을 마친 뒤 참여하세요.', 'Finish your current activity first.', '今の用事を終えてから参加してください。') : undefined;
  const markets = [...(state.market ? [state.market] : []), ...state.pending.filter(market => market.id !== state.market?.id)];
  return <section className="fr-black-market" aria-label={say('뒷골목 경매', 'Backstreet auction', '裏通りの競売')} aria-busy={pending}>
    <h2>{say('뒷골목 경매', 'Backstreet auction', '裏通りの競売')}</h2>
    <p className="fr-muted">{state.open ? say('등불 아래 사람들이 모여 있습니다.', 'Bidders gather beneath the lanterns.', '灯りの下に買い手が集まっています。') : say('지금은 경매가 열리지 않습니다. 맡겨 둔 낙찰품은 찾아갈 수 있습니다.', 'No auction is gathering now. Won goods can still be collected.', '今は競売が開いていません。預けた落札品は受け取れます。')}</p>
    <p>{say('소지금', 'Your gold', '所持金')} <strong>{c.gold.toLocaleString(locale)} G</strong></p>
    <p className="fr-black-market-note">{say('입찰금은 맡겨 둡니다. 다른 입찰자에게 밀리면 돌려받으며, 낙찰품은 마감 후 짐에 여유가 있을 때 받습니다.', 'Bid gold is held in escrow and returned if you are outbid. Collect won goods after closing when your bag has room.', '入札金は預けます。競り負ければ返金され、落札品は締切後に荷の余裕があるとき受け取れます。')}</p>
    {error && <p role="alert" className="fr-error">{fantasyBlackMarketText(error, locale) ?? fantasyBagText(error, locale) ?? say('요청을 마칠 수 없습니다. 경매의 현재 상태를 확인하세요.', 'The request could not finish. Check the current auction.', '依頼を終えられません。競売の現状を確かめてください。')}</p>}
    {!markets.length && <p className="fr-muted">{say('오늘의 표식과 등불을 기다립니다.', 'You wait for the sign and the lanterns.', '今日の印と灯りを待ちます。')}</p>}
    {markets.map(market => <div className="fr-black-market-lots" key={market.id}>{market.lots.map(lot => {
      const key = `${market.id}:${lot.id}`, raw = amounts[key] ?? String(lot.minimumBid), amount = Number(raw);
      const closed = lot.settled || hour >= lot.endsAt, valid = Number.isSafeInteger(amount) && amount >= lot.minimumBid && amount <= c.gold && amount <= 1_000_000;
      const bidder = lot.yours ? say('나', 'You', 'あなた') : lot.bidder?.names[locale] ?? say('아직 없음', 'No bids yet', 'まだ入札なし');
      const disabledReason = reason ?? (closed ? say('입찰이 마감되었습니다.', 'Bidding has closed.', '入札は締め切りました。') : lot.yours ? say('이미 최고 입찰자입니다.', 'You already hold the highest bid.', 'すでに最高入札者です。') : say(`최소 ${lot.minimumBid}G 이상, 소지금 이내로 입력하세요.`, `Enter at least ${lot.minimumBid} G, within your gold.`, `最低${lot.minimumBid}G以上、所持金以内で入力してください。`));
      return <article className="fr-black-market-lot" key={lot.id}>
        <h3>{itemDisplayName(lot.item, locale)} <small>×{lot.count}</small></h3>
        <div className="fr-black-market-price" aria-live="polite"><strong>{lot.currentBid ? `${lot.currentBid.toLocaleString(locale)} G` : `${lot.minimumBid.toLocaleString(locale)} G`}</strong><span>{lot.currentBid ? say('현재 최고가', 'Current high bid', '現在の最高額') : say('시작가', 'Opening price', '開始額')}</span></div>
        <p>{say('최고 입찰자', 'Highest bidder', '最高入札者')}: {bidder}</p>
        <p className="fr-muted">{closed ? lot.claimed ? say('수령 완료', 'Collected', '受取済み') : lot.yours ? say('낙찰 · 수령 대기', 'Won · awaiting collection', '落札・受取待ち') : say('경매 종료', 'Auction closed', '競売終了') : say(`마감까지 ${Math.max(0, lot.endsAt - hour).toFixed(2)}시간`, `Closes in ${Math.max(0, lot.endsAt - hour).toFixed(2)} hours`, `締切まで${Math.max(0, lot.endsAt - hour).toFixed(2)}時間`)}</p>
        {!closed && <div className="fr-black-market-bid"><label>{say('입찰할 금화', 'Your bid in gold', '入札する金貨')}<input type="number" aria-label={`${itemDisplayName(lot.item, locale)} · ${say('입찰할 금화', 'Your bid in gold', '入札する金貨')}`} min={lot.minimumBid} max={c.gold} step="1" value={raw} disabled={busy || lot.yours} onChange={event => setAmounts(previous => ({ ...previous, [key]: event.target.value }))}/></label><small>{say(`최소 입찰 ${lot.minimumBid}G`, `Minimum bid ${lot.minimumBid} G`, `最低入札${lot.minimumBid}G`)}</small><ReasonButton className="fr-btn" disabled={busy || lot.yours || !valid} reason={disabledReason} onClick={() => onCommand({ type: 'blackMarketBid', market: market.id, lot: lot.id, amount, revision: state.revision })}>{say('금화 맡기고 입찰', 'Place bid in escrow', '金貨を預けて入札')}</ReasonButton></div>}
        {lot.canClaim && <ReasonButton className="fr-btn" disabled={busy} reason={reason} onClick={() => onCommand({ type: 'blackMarketClaim', market: market.id, lot: lot.id, revision: state.revision })}>{say('낙찰품 받기', 'Collect won goods', '落札品を受け取る')}</ReasonButton>}
        <details><summary>{say('경쟁자와 입찰 기록', 'Competitors & bid history', '競争相手と入札記録')}</summary><p>{lot.competitors.map(npc => npc.names[locale]).join(' · ')}</p><ol className="fr-black-market-history">{lot.history.slice(-8).map((entry, index) => <li key={`${entry.at}:${index}`}><span>{entry.bidder.names[locale]}</span><b>{entry.amount.toLocaleString(locale)} G</b></li>)}</ol></details>
      </article>;
    })}</div>)}
    <FantasyWorkforceMenu source="blackMarket"/>
  </section>;
}
