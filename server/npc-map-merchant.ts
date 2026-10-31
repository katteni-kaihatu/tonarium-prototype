import type { NpcLocale } from '../shared/npc.ts';
import type { FantasyEconomyMerchantView } from '../shared/fantasy-economy.ts';
import { FANTASY_MAPS } from '../shared/fantasy-town.ts';
import { FANTASY_DUNGEONS } from '../shared/fantasy-dungeon-catalog.ts';
const normal = (text: string) => text.normalize('NFKC').toLowerCase();
const topic = /지도|탐사도|지도값|재고|남은|남았|몇.*남|가격|얼마|판매|파는|팔아|구매|\b(?:maps?|charts?|remaining|how many.*left|how many.*have|stock|wares|sell|selling|buy|purchase|price|cost|available)\b|地図|探索図|在庫|残[りっ]|売[るりっ]|買|値段|価格|いくら/;
const name = (item: string, locale: NpcLocale) => FANTASY_MAPS.find(map => map.item === item)?.name[locale] ?? item;
export function npcMapMerchantFacts(merchant: FantasyEconomyMerchantView | undefined, locale: NpcLocale): string[] {
  const facts = ['You are a roadside cartographer, not a permanent Hearth shop.', 'Only supplied current stock is authoritative.', 'Charts show the site and entrance; promise no magic, treasure, safety or instant travel.'];
  if (!merchant) return [...facts, 'Current road stock and prices have not been verified; do not invent any offers.'];
  return [...facts, `Current road ${merchant.road}; world day ${merchant.day}; stock revision ${merchant.revision}.`, ...(merchant.offers.length ? merchant.offers.map(offer => `Actual map ${offer.item}: ${name(offer.item,locale)}; remaining ${offer.count}; unit price ${offer.unitPrice} gold.`) : ['All charts in this road/day stock are sold out.'])];
}
export function npcMapMerchantReply(locale: NpcLocale, text: string, merchant: FantasyEconomyMerchantView | undefined): string | undefined {
  const query = normal(text); if (!topic.test(query)) return;
  if (!merchant) return {ko:'지금 펼친 지도의 재고와 가격을 다시 확인해야 해요.',en:'I need to verify the stock and prices of the charts I have here.',ja:'いま広げている地図の在庫と値段を確かめ直す必要があります。'}[locale];
  const mentioned = FANTASY_MAPS.filter(map => query.includes(normal(map.item)) || Object.values(map.name).some(title => query.includes(normal(title)))
    || !!map.dungeon && (query.includes(normal(map.dungeon)) || Object.values(FANTASY_DUNGEONS.find(site=>site.id===map.dungeon)?.names ?? {}).some(title=>query.includes(normal(title)))));
  const offers = merchant.offers.filter(offer => offer.count > 0 && (!mentioned.length || mentioned.some(map=>map.item===offer.item)));
  if (!offers.length) return mentioned.length ? {ko:'그 지도는 오늘 제 짐에 남아 있지 않아요.',en:'I have no copies of that chart left in today’s pack.',ja:'その地図は、今日の荷物にはもう残っていません。'}[locale] : {ko:'오늘 이 길에 가져온 지도는 모두 팔렸어요.',en:'All the charts I brought to this road today have been sold.',ja:'今日この道へ持ってきた地図は、すべて売り切れました。'}[locale];
  return offers.map(offer=>({ko:`${name(offer.item,locale)}는 ${offer.unitPrice}금화이고 ${offer.count}장 남았어요.`,en:`${name(offer.item,locale)} costs ${offer.unitPrice} gold; I have ${offer.count} ${offer.count===1?'copy':'copies'} left.`,ja:`${name(offer.item,locale)}は${offer.unitPrice}枚の金貨で、残り${offer.count}枚です。`})[locale]).join(' ');
}

// 配信中の推論も含め、売買の断定は検証済み在庫から描画する。
export function npcMapMerchantUnverifiedSpeech(text: string): boolean {
  return /\b(?:sell|selling|stock|price|cost|gold|teleport(?:ation|s|ed|ing)?|instant travel)\b|have.*\b(?:copy|copies)\b|판매|팔[아고려]|가격|금화|골드|남았|순간이동|마법(?:의\s*)?지도|売[るりっ]|値段|価格|金貨|残り|転移|魔法地図/u.test(normal(text));
}
