import type { FantasyCharacter } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import type { FantasyGmReply } from './fantasy-gm.ts';
import { fantasyEscortOffers, fantasyEscortTransportError } from './fantasy-escort.ts';
import { fantasyKnownLocations } from './fantasy-town.ts';
import { fantasyTermName } from './fantasy-lore.ts';

export function fantasyEscortGuidance(c: FantasyCharacter, locale: NpcLocale): FantasyGmReply {
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  const known = fantasyKnownLocations(c), name = (id: string) => known.includes(id) ? fantasyTermName(id, locale) : say('미지의 정착지', 'Unknown settlement', '未知の集落');
  const a = c.escort;
  if (a) return { text: say(`호위 배정: ${name(a.from)} → ${name(a.destination)}. 실제 약 ${a.hours * 2}분, 이동비 0 G, 도착 후 +${a.reward} G.`, `Escort: ${name(a.from)} → ${name(a.destination)}. About ${a.hours * 2} real minutes, no fare, +${a.reward} G on arrival.`, `護衛：${name(a.from)} → ${name(a.destination)}。実時間約${a.hours * 2}分、移動費0 G、到着後+${a.reward} G。`), suggestions: fantasyEscortTransportError(c, a.destination) ? [{ label: say('받은 호위 확인', 'View escort', '受注した護衛を確認'), tab: 'quests' }] : [{ label: say('호위하며 출발', 'Depart as escort', '護衛して出発'), action: { type: 'travel', destination: a.destination, transport: 'escort' } }] };
  return { text: say('전투 직업은 길드에서 육로 호위를 배정받을 수 있습니다. 이동비는 없고 실제 도착한 뒤 보수를 받습니다. 같은 구간의 다음 배정은 잠시 기다려야 합니다.', 'Combat professions can accept overland escorts at a guild. There is no fare; pay comes after arrival. Another assignment on the same route requires a wait.', '戦闘職はギルドで陸路の護衛を受けられます。移動費は不要で報酬は到着後です。同じ区間の次便には待ち時間があります。'), suggestions: fantasyEscortOffers(c).filter(offer => offer.available).map(offer => ({ label: `${name(offer.destination)} · +${offer.reward} G`, action: { type: 'escortAccept' as const, destination: offer.destination } })) };
}
