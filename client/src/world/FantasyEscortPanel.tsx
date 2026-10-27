import type { FantasyAction, FantasyCharacter } from '../../../shared/fantasy.ts';
import { fantasyEscortOffers, fantasyEscortTransportError } from '../../../shared/fantasy-escort.ts';
import { fantasyKnownLocations } from '../../../shared/fantasy-town.ts';
import { fantasyTermName } from '../../../shared/fantasy-lore.ts';
import { useLocale } from '../locale.ts';
import { requestFantasyCombat } from './fantasy-combat-transport.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { fantasyErrorText } from './fantasy-copy.ts';

export function FantasyEscortPanel({ c, guild = false, blocked, onAction, onSelect }: { c: FantasyCharacter; guild?: boolean; blocked: boolean; onAction: (action: FantasyAction) => void; onSelect?: (id: string) => void }) {
  const [locale] = useLocale(), known = fantasyKnownLocations(c), contract = c.escort;
  const t = {
    ko: { title: '호위 의뢰', unknown: '미지의 정착지', empty: '지금 배정받을 수 있는 호위가 없습니다. 전투 직업과 알려진 육로를 확인하세요.', accept: '호위 배정받기', leave: '호위하며 출발', abandon: '배정 포기', pay: '도착 시 보수', minutes: '실제 분', origin: '출발지', cost: '이동 비용 0 G' },
    en: { title: 'Escort assignments', unknown: 'Unknown settlement', empty: 'No escorts are available. Check your combat profession and known overland routes.', accept: 'Accept assignment', leave: 'Depart as escort', abandon: 'Abandon assignment', pay: 'Pay on arrival', minutes: 'real min', origin: 'Departure', cost: 'Travel cost 0 G' },
    ja: { title: '護衛依頼', unknown: '未知の集落', empty: '今は割り当てられる護衛がありません。戦闘職と既知の陸路を確認してください。', accept: '護衛を受ける', leave: '護衛して出発', abandon: '辞退する', pay: '到着時の報酬', minutes: '実時間の分', origin: '出発地', cost: '移動費0 G' },
  }[locale];
  const name = (id: string) => known.includes(id) ? fantasyTermName(id, locale) : t.unknown;
  if (!guild && !contract) return null;
  const offers = guild && !contract ? fantasyEscortOffers(c) : [];
  const error = contract ? fantasyEscortTransportError(c, contract.destination) : undefined;
  return <details className="fr-fold fr-escort-quests" open={!!contract}><summary>{t.title}</summary>
    {contract ? <article className="fr-card"><p>{t.origin}: {name(contract.from)} → {name(contract.destination)}</p><p>{t.pay}: +{contract.reward} G · {contract.hours * 2} {t.minutes}</p><small>{t.cost}</small>
      {onSelect && known.includes(contract.destination) && <ReasonButton className="fr-text-button" onClick={() => onSelect(contract.destination)}>{name(contract.destination)} ↗</ReasonButton>}
      <div className="fr-action-grid">{contract.defense==='pending'&&<ReasonButton className="fr-btn primary" disabled={blocked} onClick={()=>requestFantasyCombat({type:'start',source:'escort',target:contract.id})}>{{ko:'호위대 지키기',en:'Defend the convoy',ja:'護衛隊を守る'}[locale]}</ReasonButton>}<ReasonButton className="fr-btn" disabled={blocked || !!error} reason={error ? fantasyErrorText(error, locale) : undefined} onClick={() => onAction({ type: 'travel', destination: contract.destination, transport: 'escort' })}>{t.leave}</ReasonButton><ReasonButton className="fr-text-button" disabled={blocked} onClick={() => onAction({ type: 'escortAbandon' })}>{t.abandon}</ReasonButton></div>
    </article> : offers.length ? offers.map(offer => <article className="fr-card" key={offer.destination}><p>{name(offer.destination)}</p><small>{offer.hours * 2} {t.minutes} · {t.pay} +{offer.reward} G</small><ReasonButton className="fr-btn" disabled={blocked || !offer.available} reason={offer.reason ? fantasyErrorText(offer.reason, locale) : undefined} onClick={() => onAction({ type: 'escortAccept', destination: offer.destination })}>{t.accept}</ReasonButton></article>) : <p>{t.empty}</p>}
  </details>;
}
