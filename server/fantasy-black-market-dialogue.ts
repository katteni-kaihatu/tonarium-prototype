import type { FantasyProfile } from '../shared/fantasy.ts';
import { NPC_PUBLIC, type NpcLocale } from '../shared/npc.ts';
import { fantasyBlackMarketClue, type FantasyBlackMarketAction } from '../shared/fantasy-black-market.ts';

export function fantasyBlackMarketDialogue(profile: FantasyProfile, npcId: string, text: string, locale: NpcLocale): { handled: boolean; text?: string; command?: FantasyBlackMarketAction } {
  const c = profile.character, npc = NPC_PUBLIC.find(npc => npc.id === npcId), query = text.normalize('NFKC').trim().toLowerCase();
  if (!c || profile.death || c.hp <= 0 || c.downed || !npc || npc.travelOnly || npc.building !== 'residence' || npc.homeLocation !== c.location) return { handled: false };
  const rumorRequest = /소문/.test(query) && /알려|있|듣|가르쳐/.test(query) || /\b(?:rumou?rs|gossip)\b/.test(query) && /\b(?:any|tell|heard|share)\b/.test(query) || /噂/.test(query) && /教え|聞|ある/.test(query);
  if (!/암시장|뒷골목\s*경매|야간\s*경매|black\s*market|backstreet\s*auction|night\s*auction|闇市|裏通り.*競売/.test(query) && !rumorRequest
    || /관심\s*없|필요\s*없|알려주지\s*마|not interested|do not want|don't want|いらない|興味.*ない|教えなく/.test(query)
    || /뭐야|무엇|what is|what's|とは|って何/.test(query)
    || !rumorRequest && !/어디|알려|안내|소개|소문|찾|where|tell|show|find|heard|教え|どこ|案内|噂/.test(query)) return { handled: false };
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  if (c.blackMarketClues?.includes(c.location)) return { handled: true, text: say('이미 그 표식을 알고 있군요. 밤에 뒷골목을 살펴보세요. 언제나 장이 서는 건 아니에요. 낙찰한 물건은 맡아 두니 짐을 비우고 찾아가면 돼요.', 'You already know the sign. Look along the backstreets at night; the auction does not open every evening. Won goods wait at the collection desk until you have room for them.', 'もうその印を知っていますね。夜の裏通りを確かめてください。毎晩開くわけではありません。落札品は預かっているので、荷を空けて受け取れます。') };
  const clue = fantasyBlackMarketClue(c, npcId, locale);
  return clue.eligible ? { handled: true, text: clue.message, command: { type: 'blackMarketLearn', npc: npcId } }
    : { handled: true, text: say('서로를 조금 더 알아간 뒤에 조용한 이야기도 나누죠. 이 마을 사람들은 함께한 일을 오래 기억해요.', 'Let us know each other a little better before sharing quiet matters. People here remember the work we do together.', 'もう少し互いを知ってから、静かな話もしましょう。この町の人は、共にした仕事を長く覚えています。') };
}
