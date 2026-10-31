import type { FantasyAction, FantasyCharacter } from '../../../shared/fantasy.ts';
import type { NpcLocale } from '../../../shared/npc.ts';
import { FANTASY_LOCATIONS } from '../../../shared/fantasy-data.ts';
import { FANTASY_TERMS } from '../../../shared/fantasy-lore.ts';
import { fantasyExpeditionQuote, fantasyExpeditionText, FANTASY_EXPEDITION_SMUGGLING_FEE } from '../../../shared/fantasy-expedition.ts';
import { ReasonButton } from './FantasyActionButton.tsx';

export interface FantasyExpeditionPanelProps { c: FantasyCharacter; route: 'guild' | 'smuggler'; locale: NpcLocale; blocked: boolean; onAction: (action: FantasyAction) => void }
export function FantasyExpeditionPanel({ c, route, locale, blocked, onAction }: FantasyExpeditionPanelProps) {
  const quote = fantasyExpeditionQuote(c, route), smuggler = route === 'smuggler';
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  const departure = FANTASY_TERMS.find(term => term.category === 'place' && term.id === quote.departure)?.names[locale]
    ?? FANTASY_LOCATIONS.find(place => place.id === quote.departure)?.names?.[locale]
    ?? FANTASY_LOCATIONS.find(place => place.id === quote.departure)?.name ?? quote.departure;
  const title = smuggler ? say('비밀 밀항', 'Illegal passage', '秘密の密航') : say('미개척 대륙 원정', 'Uncharted expedition', '未開拓大陸への遠征');
  const reason = blocked ? say('요청을 처리하고 있습니다.', 'The request is being processed.', '依頼を処理しています。')
    : quote.reason ? fantasyExpeditionText(quote.reason, locale) ?? quote.reason : undefined;
  return <section className="fr-card" aria-label={title} aria-busy={blocked}>
    <h3>{title}</h3>
    <p>{smuggler
      ? say('현재 범죄 직업이며 전투 역량이 골드(4등급) 이상이어야 합니다. 연락책을 통해 불법 항로에 합류합니다.', 'Requires a current criminal profession and combat power equivalent to Gold (grade 4) or higher. The contact arranges an illegal passage.', '現在の犯罪職とゴールド（4級）以上相当の戦力が必要です。連絡役を通して違法な航路に加わります。')
      : say('길드에 등록된 골드(4등급) 이상 모험가와 동등한 신전 등급의 사제를 모집합니다.', 'Recruiting registered Gold (grade 4) adventurers or higher, and priests of equivalent temple rank.', 'ギルドに登録したゴールド（4級）以上の冒険者と、同等の神殿階級の司祭を募集しています。')}</p>
    <p className="fr-muted">{say('상륙지 한 곳의 보급품은 소량뿐입니다. 내륙에서는 야영하며 사냥·채집·낚시로 식량을 마련하세요.', 'The single landing has limited supplies. Camp inland and obtain food through hunting, gathering and fishing.', '上陸地一か所の補給品は少量です。内陸では野営し、狩猟・採集・釣りで食料を確保してください。')}</p>
    <p>{say('출항 항구', 'Departure harbor', '出航する港')}: {departure}</p>
    {smuggler && <p>{FANTASY_EXPEDITION_SMUGGLING_FEE} G · {say('밀항 준비금이며 배삯은 별도입니다.', 'Arrangement fee; passage fare is separate.', '密航の手配料です。船賃は別です。')}</p>}
    {quote.enlisted
      ? <p role="status">{say('참가 등록 완료. 출항 항구에서 상륙지행 배편을 선택하세요.', 'Enlisted. Choose the passage to the landing at the departure harbor.', '参加登録済み。出航する港で上陸地への船便を選んでください。')}</p>
      : <>{reason && <p className="fr-muted">{reason}</p>}<ReasonButton type="button" className="fr-btn" disabled={blocked || !quote.eligible} reason={reason} onClick={() => onAction({ type: 'expeditionJoin', route })}>{smuggler ? say('밀항 준비하기', 'Arrange illegal passage', '密航を手配する') : say('원정에 참가하기', 'Join the expedition', '遠征に参加する')}</ReasonButton></>}
  </section>;
}
