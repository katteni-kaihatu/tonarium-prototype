import type { FantasyAction } from '../shared/fantasy.ts';
import { NPC_PUBLIC, type NpcLocale } from '../shared/npc.ts';
import { FANTASY_ITEMS, FANTASY_QUESTS } from '../shared/fantasy-data.ts';
import { FANTASY_MAPS } from '../shared/fantasy-town.ts';
import { FANTASY_LODGINGS } from '../shared/fantasy-life.ts';
import { fantasyPrice } from '../shared/fantasy-reputation.ts';
import { fantasyQuestEligible } from '../shared/fantasy-access.ts';
import { fantasyQuestText } from '../shared/fantasy-narrative.ts';
import { fantasyGuildRankName } from '../shared/fantasy-adventurer.ts';
import { fantasyRegisteredGuildGrade } from '../shared/fantasy-guild-progression.ts';
import { fantasyNpcTone } from '../shared/fantasy-dialogue-voice.ts';
import { fantasyQuestGrade } from '../shared/fantasy-quest-grades.ts';
import type { FantasyContractBoard, FantasyContractVisibleOffer } from '../shared/fantasy-contracts.ts';
import type { DialogueDynamicContext } from './dialogue-dynamic.ts';
import { FantasyConversationActions, type FantasyConversationActionContext } from './fantasy-conversation-actions.ts';
import { fantasyCriminalContact, fantasyInstitutionEligible, fantasyInstitutionPresent, fantasyQuestInstitution } from '../shared/fantasy-institutions.ts';
import { fantasyUnderworldNpcText, fantasyUnderworldState } from '../shared/fantasy-underworld.ts';

export interface NpcTransactionContext extends FantasyConversationActionContext {
  text: string;
  dynamicFacts?: DialogueDynamicContext;
  rooms?: { room: 'common' | 'private' | 'suite'; available: number; capacity: number }[];
  contractBoard?: FantasyContractBoard;
  namedCommission?: FantasyContractVisibleOffer;
  visit?: boolean;
}
interface Browsing {
  kind: 'goods' | 'rooms' | 'quests'; ids: string[]; revision: number; generation: number;
  lifeStartedAt?: number; location: string; locale: NpcLocale; expiresAt: number;
}
const normalize = (value: string) => value.normalize('NFKC').toLowerCase().trim();
const compact = (value: string) => normalize(value).replace(/[\s\p{P}\p{S}]/gu, '');
const mentions = (query: string, name: string) => {
  const value = normalize(name);
  return /^[a-z0-9 -]+$/u.test(value)
    ? new RegExp(`(^|[^a-z0-9])${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`, 'u').test(query)
    : compact(query).includes(compact(value));
};
const buyIntent = /살게|살래|사겠|사고\s*싶|구매(?:할|해|하겠)|사\s*줘|(?:개|병|묶음)\s*(?:줘|주세요)|\b(?:buy|purchase|take|give me)\b|買(?:う|い|って)|ください/u;
const roomTopic = /객실|숙박|숙소|빈방|방있|방(?:이|은|을|\s|$)|묵|빌릴|빌려|\b(?:rooms?|lodging|stay|rent|suite)\b|部屋|客室|宿泊|泊ま|借り/u;
const questTopic = /의뢰|퀘스트|일거리|지명|\b(?:quests?|contracts?|commission|work|jobs?)\b|依頼|クエスト|指名/u;
const stockTopic = /보급품|포션|야영도구|재고|상품|물건|약초|허브|판매|파는|팔아|팔고|구매|살\s*수|얼마|가격|\b(?:supplies|potions?|camping gear|stock|wares|goods|herbs?|sell|selling|buy|purchase|price|cost)\b|補給品|ポーション|野営道具|在庫|商品|品物|薬草|ハーブ|売|買|価格|値段|いくら/u;
const acceptIntent = /수락|맡을|맡겠|받을게|받고\s*싶|\b(?:accept|take|claim)\b|受け(?:る|ます|たい)|引き受け/u;
const unknown = { handled: false } as const;
const itemName = (id: string, locale: NpcLocale) => FANTASY_ITEMS.find(item => item.id === id)?.names?.[locale] ?? FANTASY_MAPS.find(map => map.item === id)?.name[locale] ?? id;
const roomAliases: Record<string, string[]> = { common: ['공동실', '다인실'], private: ['개인실', '1인실'], suite: ['특실'] };
const koreanQuantities: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };
const koreanTopic = (name: string) => {
  const code = name.codePointAt(name.length - 1) ?? 0;
  return `${name}${code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0 ? '은' : '는'}`;
};
const wordQuantities: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
function wordQuantity(query: string): number | undefined {
  const japanese = query.match(/([一二三四五六七八九十百千]+)\s*(?:個|本|つ)/u)?.[1];
  if (japanese) {
    if (japanese.length === 1) return wordQuantities[japanese] ?? NaN;
    const tens = japanese.match(/^([一二三四五六七八九])?十([一二三四五六七八九])?$/u);
    return tens ? (tens[1] ? wordQuantities[tens[1]] : 1) * 10 + (tens[2] ? wordQuantities[tens[2]] : 0) : NaN;
  }
  const english = query.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)(?:[- ]+(one|two|three|four|five|six|seven|eight|nine))?\b/u);
  if (!english) return undefined;
  const larger: Record<string, number> = { eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100 };
  return (wordQuantities[english[1]] ?? larger[english[1]]) + (english[2] ? wordQuantities[english[2]] : 0);
}

/** 在庫・客室・掲示からだけ行動を作り、確定は既存の確認窓口に任せる。 */
export class NpcTransactions {
  private browsing = new Map<string, Browsing>();
  constructor(private now = Date.now) {}
  clear(user: string) { for (const key of this.browsing.keys()) if (JSON.parse(key)[0] === user) this.browsing.delete(key); }
  chat(context: NpcTransactionContext, actions: FantasyConversationActions): { handled: boolean; text?: string } {
    const { user, locale, profile, speaker } = context, c = profile.character;
    const npc = NPC_PUBLIC.find(npc => npc.id === speaker), query = normalize(context.text);
    if (!c || !npc || npc.travelOnly || npc.homeLocation !== c.location || profile.death || c.hp <= 0 || c.downed || profile.activity || profile.combatId) return unknown;
    const key = JSON.stringify([user, speaker]);
    const polite = ['trade', 'scholar', 'priest'].includes(fantasyNpcTone(speaker));
    const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
    let prior = this.browsing.get(key);
    if (prior && (prior.expiresAt <= this.now() || prior.revision !== profile.revision || prior.generation !== (profile.generation ?? 1) || prior.lifeStartedAt !== c.lifeStartedAt || prior.location !== c.location || prior.locale !== locale)) { this.browsing.delete(key); prior = undefined; }
    const remember = (kind: Browsing['kind'], ids: string[]) => {
      for (const [id, value] of this.browsing) if (value.expiresAt <= this.now()) this.browsing.delete(id);
      if (this.browsing.size >= 5000) this.browsing.delete(this.browsing.keys().next().value!);
      this.browsing.set(key, { kind, ids, revision: profile.revision, generation: profile.generation ?? 1, lifeStartedAt: c.lifeStartedAt, location: c.location, locale, expiresAt: this.now() + 120_000 });
    };
    const reply = (text: string) => { actions.clear(user, speaker); return { handled: true, text }; };
    const propose = (choices: { action: FantasyAction; label: string }[], prefix = '') => {
      this.browsing.delete(key);
      return { handled: true, text: prefix + actions.propose({ ...context, query: undefined }, choices).text };
    };
    const number = query.match(/^(?:option\s*|선택\s*)?(\d+)\s*(?:번|番|번으로|番目)?[.!。]?$/u);
    const selectedId = (kind: Browsing['kind']) => prior?.kind === kind && number ? prior.ids[Number(number[1]) - 1] : undefined;
    const referent = /그(?:거|것)|그걸|그방|그\s*방|그\s*의뢰|\b(?:it|that|those|this one)\b|それ|その(?:部屋|依頼|品)/u.test(query);

    if (fantasyCriminalContact(speaker) && /신뢰|공적|\b(?:trust|merit)\b|信用|功績/u.test(query)) {
      const status = fantasyUnderworldState(c);
      return reply(`${status.title[locale]} · ${say('신뢰', 'Trust', '信用')} ${status.trust} · ${say('공적', 'Merit', '功績')} ${status.merit}\n${fantasyUnderworldNpcText(locale)}`);
    }

    if (npc.building === 'inn' && (roomTopic.test(query) || FANTASY_LODGINGS.some(room => [...Object.values(room.name), ...roomAliases[room.id]].some(name => mentions(query, name))) || prior?.kind === 'rooms' && (number || referent))) {
      const rooms = context.rooms;
      if (!rooms) return reply(say('지금 빈방을 확인하고 있어. 잠시 뒤에 다시 물어봐 줘.', 'I am checking the vacant rooms. Ask me again in a moment.', 'いま空室を確認しています。少し待ってからまたお尋ねください。'));
      const named = FANTASY_LODGINGS.filter(room => [room.id, ...Object.values(room.name), ...roomAliases[room.id]].some(name => mentions(query, name)) || room.id === selectedId('rooms') || referent && prior?.kind === 'rooms' && prior.ids.length === 1 && room.id === prior.ids[0]);
      if (named.length === 1) {
        const room = named[0], vacancy = rooms.find(entry => entry.room === room.id)?.available ?? 0;
        if (vacancy <= 0) return reply(say('그 방은 지금 다 차 있어. 다른 방을 골라 줄래?', 'That room type is full just now. Would you like another?', 'そのお部屋はいま満室です。別のお部屋はいかがですか？'));
        return propose([{ action: { type: 'lodge', room: room.id }, label: room.name[locale] }], say(`그 방은 ${vacancy}실 남아 있어. `, `There ${vacancy === 1 ? 'is' : 'are'} ${vacancy} left. `, `空室は${vacancy}室あります。`));
      }
      const listed = FANTASY_LODGINGS.map(room => {
        const vacancy = rooms.find(entry => entry.room === room.id)?.available ?? 0;
        const price = fantasyPrice({ ...c, hour: context.dynamicFacts?.hour ?? c.hour }, room.cost, 'room');
        return say(`${koreanTopic(room.name.ko)} ${vacancy}실 남았고 ${room.hours}시간에 ${price}G${polite ? '예요' : '야'}.`, `${room.name.en}: ${vacancy} available, ${price}G for ${room.hours} hours.`, `${room.name.ja}は空室${vacancy}室、${room.hours}時間で${price}Gです。`);
      });
      remember('rooms', FANTASY_LODGINGS.map(room => room.id));
      return reply(listed.map((line, index) => `${index + 1}. ${line}`).join('\n') + '\n' + say('어느 방으로 할까?', 'Which room would you like?', 'どのお部屋にしますか？'));
    }

    if (context.visit || questTopic.test(query) || prior?.kind === 'quests' && (number || referent || acceptIntent.test(query))) {
      if (!context.visit && /배우|가르|수련|\b(?:learn|teach|train)\b|学|教/u.test(query)) return unknown;
      const source = npc.building === 'guild' ? 'guild' : npc.building === 'temple' ? 'temple' : fantasyCriminalContact(speaker) ? 'underworld' : 'personal';
      if (!fantasyInstitutionEligible(c, source) || !fantasyInstitutionPresent({ ...c, hour: context.dynamicFacts?.hour ?? c.hour }, source)) return reply(say('지금은 이 의뢰를 직접 맡을 조건이 맞지 않아. 현재 직업과 등록 상태를 확인해 줘.', 'You do not currently meet the conditions to take these contracts. Check your profession and registration.', '今はこの依頼を直接引き受ける条件が整っていません。職業と登録を確かめてください。'));
      const board = context.contractBoard;
      if (!board || board.location !== c.location) return reply(say('의뢰장을 확인하고 있어. 잠시 뒤에 다시 와 줘.', 'I am checking the contracts. Come back in a moment.', '依頼書を確認しています。少し後でまたお越しください。'));
      const grade = fantasyRegisteredGuildGrade(c);
      const available = [...board.offers, ...(context.namedCommission && !board.offers.some(offer => offer.id === context.namedCommission!.id) ? [context.namedCommission] : [])].filter(offer => {
        const quest = FANTASY_QUESTS.find(quest => quest.id === offer.quest);
        return quest && fantasyQuestInstitution(quest) === source && (source === 'guild' || offer.issuer === speaker) && offer.available && !offer.mine && board.hour < offer.expiresAt && offer.boardLocation === c.location && fantasyQuestEligible(c, quest) && !c.quests.includes(quest.id) && !c.completed.includes(quest.id);
      });
      const named = available.filter(offer => {
        const quest = FANTASY_QUESTS.find(quest => quest.id === offer.quest)!;
        return [quest.id, ...(['ko', 'en', 'ja'] as const).map(language => fantasyQuestText(quest, language).name)].some(name => mentions(query, name)) || offer.id === selectedId('quests') || referent && prior?.kind === 'quests' && prior.ids.length === 1 && offer.id === prior.ids[0];
      });
      const commission = context.namedCommission && available.find(offer => offer.id === context.namedCommission!.id);
      const requestedCommission = /지명|\bnamed\b|指名/u.test(query) ? available.filter(offer => offer.recipient === user) : [];
      const chosen = named.length ? named : context.visit && commission ? [commission] : requestedCommission.length ? requestedCommission : acceptIntent.test(query) && prior?.kind === 'quests' && prior.ids.length === 1 ? available.filter(offer => offer.id === prior!.ids[0]) : [];
      const description = (offer: FantasyContractVisibleOffer) => {
        const quest = FANTASY_QUESTS.find(quest => quest.id === offer.quest)!;
        const title = fantasyQuestText(quest, locale).name, rank = fantasyGuildRankName(fantasyQuestGrade(quest), locale);
        if (source !== 'guild') return say(`『${title}』의 보수는 ${offer.gold}G야. ${quest.dialogue?.ko ?? fantasyQuestText(quest, 'ko').description}`, `“${title}” pays ${offer.gold}G. ${quest.dialogue?.en ?? fantasyQuestText(quest, 'en').description}`, `『${title}』の報酬は${offer.gold}Gです。${quest.dialogue?.ja ?? fantasyQuestText(quest, 'ja').description}`);
        return say(`『${title}』, ${rank}급 의뢰고 보수는 ${offer.gold}G${polite ? '예요' : '야'}.`, `“${title}” is a ${rank} contract paying ${offer.gold}G.`, `『${title}』は${rank}級の依頼で、報酬は${offer.gold}Gです。`);
      };
      if (chosen.length) return propose(chosen.map(offer => ({ action: { type: 'accept', quest: offer.quest, offer: offer.id }, label: fantasyQuestText(FANTASY_QUESTS.find(quest => quest.id === offer.quest)!, locale).name })), (context.visit && commission ? say(`${c.name}, 너를 지명한 의뢰가 들어왔어. 오늘 맡아 볼래? `, `${c.name}, a client asked for you by name. Would you hear today's commission? `, `${c.name}さん、あなたを指名した依頼が届いています。今日のお仕事、いかがですか？`) : '') + chosen.map(description).join(' ') + '\n');
      const recommended = available.filter(offer => source !== 'guild' || fantasyQuestGrade(FANTASY_QUESTS.find(quest => quest.id === offer.quest)!) <= grade).sort((a, b) => fantasyQuestGrade(FANTASY_QUESTS.find(quest => quest.id === b.quest)!) - fantasyQuestGrade(FANTASY_QUESTS.find(quest => quest.id === a.quest)!)).slice(0, 5);
      if (!recommended.length) return reply(source === 'guild' ? say('지금 네 등급에 맞춰 권할 새 의뢰는 없어. 다음 게시를 기다려 줘.', 'I have no new contracts suited to your rank just now. Check the next postings.', 'いまの等級に合う新しい依頼はありません。次の掲示をお待ちください。') : say('지금 내가 새로 맡길 의뢰는 없어. 다음에 다시 물어봐 줘.', 'I have no new requests for you just now. Ask me again later.', 'いま新しく頼める依頼はありません。また後で尋ねてください。'));
      remember('quests', recommended.map(offer => offer.id));
      return reply(recommended.map((offer, index) => `${index + 1}. ${description(offer)}`).join('\n') + '\n' + say('맡고 싶은 의뢰의 이름이나 번호를 알려 줘.', 'Tell me the name or number of the contract you want.', '引き受けたい依頼の名前か番号を教えてください。'));
    }

    const current = context.dynamicFacts?.location === c.location ? context.dynamicFacts : undefined;
    const building = current?.shops.find(shop => shop.building === npc.building)?.building;
    const lots = current?.shops.filter(shop => shop.building === npc.building).flatMap(shop => shop.lots.filter(lot => lot.count > 0)) ?? [];
    const stock = [...new Set(lots.map(lot => lot.item))];
    const quantityOnly = /^(?:[+-]?\d+(?:\.\d+)?|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|一|二|三|四|五|六|七|八|九|十)\s*(?:개|병|묶음|個|本|つ)(?:만)?(?:요|줘|주세요|ください)?[.!。]?$/u.test(query);
    const named = stock.filter(id => [id, itemName(id, 'ko'), itemName(id, 'en'), itemName(id, 'ja')].some(name => mentions(query, name)) || id === selectedId('goods') || (referent || quantityOnly) && prior?.kind === 'goods' && prior.ids.length === 1 && id === prior.ids[0]);
    if (!stockTopic.test(query) && !named.length && !(prior?.kind === 'goods' && (buyIntent.test(query) || quantityOnly))) return unknown;
    if (!current) return unknown;
    const herbs = /약초|허브|\bherbs?\b|薬草|ハーブ/u.test(query);
    const filtered = named.length ? named : prior?.kind === 'goods' && (referent || quantityOnly) ? stock.filter(id => prior!.ids.includes(id)) : herbs ? stock.filter(id => FANTASY_ITEMS.find(item => item.id === id)?.category === 'herb') : stock;
    if (!filtered.length) return reply(say('그 물건은 지금 여기서 팔고 있지 않아.', 'I have none of those for sale here just now.', 'その品物はいまここでは扱っていません。'));
    if (buyIntent.test(query) || selectedId('goods') || quantityOnly && prior?.kind === 'goods') {
      const countText = number ? undefined : query.match(/([+-]?\d+(?:\.\d+)?)\s*(?:개|병|묶음|個|本|つ)/u) ?? query.match(/\b(?:buy|purchase|take|give me)\s+([+-]?\d+(?:\.\d+)?)/u) ?? query.match(/(?:^|\s)([+-]?\d+(?:\.\d+)?)\s*(?:please)?[.!]?$/u);
      const koreanCount = query.match(/(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*(?:개|병|묶음)/u)?.[1];
      const count = countText ? Number(countText[1]) : koreanCount ? koreanQuantities[koreanCount] : wordQuantity(query) ?? 1;
      if (!Number.isSafeInteger(count) || count < 1 || count > 99) return reply(say('수량은 1개에서 99개 사이로 알려 줘.', 'Tell me a quantity from 1 to 99.', '数量は1個から99個で教えてください。'));
      if (filtered.length === 1) {
        const id = filtered[0], lot = lots.find(lot => lot.item === id)!;
        if (count > lot.count) return reply(say(`지금 한 번에 준비할 수 있는 건 ${lot.count}개야. 수량을 다시 알려 줘.`, `I can supply ${lot.count} from this lot. Tell me the quantity again.`, `この在庫からご用意できるのは${lot.count}個です。数量をもう一度教えてください。`));
        if (!building) return unknown;
        const action: FantasyAction = { type: 'buy', item: id, count, building };
        const quote = context.marketQuote?.(action);
        if (!quote || quote.key === 'unavailable') return reply(say('재고나 값이 달라졌어. 다시 확인해 줄게.', 'The stock or price changed. Let me check again.', '在庫か値段が変わりました。もう一度確認します。'));
        return propose([{ action, label: `${itemName(id, locale)} ×${count}` }]);
      }
    }
    remember('goods', filtered);
    return reply(filtered.map((id, index) => {
      const itemLots = lots.filter(lot => lot.item === id), total = itemLots.reduce((sum, lot) => sum + lot.count, 0), prices = [...new Set(itemLots.map(lot => lot.unitPrice))].sort((a, b) => a - b).join(' / '), name = itemName(id, locale);
      return `${index + 1}. ` + say(`${koreanTopic(name)} 한 개에 ${prices}G이고 ${total}개 ${polite ? '남아 있어요' : '남았어'}.`, `${name}: ${prices}G each, ${total} in stock.`, `${name}は1個${prices}Gで、在庫は${total}個です。`);
    }).join('\n') + '\n' + say(polite ? '필요한 물건과 수량을 말씀해 주세요.' : '필요한 물건과 수량을 말해 줘.', 'Tell me which item and how many you need.', 'ほしい品物と数量を教えてください。'));
  }
}
