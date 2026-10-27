import type { FantasyAction, FantasyProfile, FantasyResult } from '../shared/fantasy.ts';
import { fantasyCanHaggle, type FantasyTradeService } from '../shared/fantasy-reputation.ts';
import { fantasyBuildings } from '../shared/fantasy-town.ts';
import { NPC_PUBLIC, type NpcLocale } from '../shared/npc.ts';

export interface FantasyBargainingRequest {
  user: string; npcId: string; text: string; locale: NpcLocale; profile: FantasyProfile; revision?: number;
}
export interface FantasyBargainingResponse {
  handled: boolean; text?: string; source?: 'canon'; result?: FantasyResult;
}
type Haggle = Extract<FantasyAction, { type: 'haggle' }>;
interface Pending {
  npc: string; location: string; generation: number; lifeStartedAt?: number; revision: number;
  expires: number; service?: FantasyTradeService;
}
const LABELS: Record<FantasyTradeService, Record<NpcLocale, string>> = {
  room: { ko: '객실값', en: 'room prices', ja: '客室代' },
  food: { ko: '식사비', en: 'meal prices', ja: '食事代' },
  goods: { ko: '물품 가격', en: 'goods prices', ja: '品物の値段' },
};
const YES = /^(?:응|네|예|좋아|좋아요|해줘|해주세요|해\s*봐|진행해|승인|확인|yes|y|ok|okay|please do|go ahead|do it|sure|はい|うん|お願い|お願いします|やって|いいよ|やってください)$/;
const NO = /^(?:아니|아니요|싫어|취소|안할래|됐어|그만|no|cancel|never mind|いいえ|やめる|やめて|やめます|キャンセル)$/;
const INTENT = /흥정|깎아|깎을|깎고|깎자|네고|할인\s*(?:해|부탁|가능)|(?:가격|값|식사비).*(?:내려|낮춰)|negotiate|haggl|bargain|discount|(?:lower|reduce).*(?:price|cost)|cheaper|値引|値切|安く|まけて|交渉/;
const EXPLANATION = /(?:흥정|할인|네고).*(?:뭐|무엇|뜻|설명|방법|하는\s*법|어떻게|에\s*대해)|(?:what (?:is|are|does)|how (?:does|do|to)|explain|meaning|tell me about).*(?:haggl|bargain|discount|negotiat)|(?:交渉|値引き|値切り)(?:とは|って何)|(?:交渉|値引き).*(?:説明|方法|仕組み)/;
function services(text: string): FantasyTradeService[] {
  return [
    /객실|숙박|방값|room|lodging|客室|部屋|宿泊|^방$/.test(text) ? 'room' : undefined,
    /식사|식비|음식|밥값|meal|food|dining|食事|料理/.test(text) ? 'food' : undefined,
    /물품|물건|상품|goods|items?|merchandise|品物|商品/.test(text) ? 'goods' : undefined,
  ].filter((service): service is FantasyTradeService => !!service);
}

/** 会話の確認だけを保持し、状態変更は常に呼出元の保存処理へ委譲する。 */
export class FantasyBargaining {
  private pending = new Map<string, Pending>();
  private now: () => number;
  constructor(options: { now?: () => number } = {}) { this.now = options.now ?? Date.now; }

  clear(user: string): void { this.pending.delete(user); }

  chat(request: FantasyBargainingRequest, apply: (revision: number, action: Haggle) => FantasyResult): FantasyBargainingResponse {
    const { user, npcId, profile } = request;
    const locale: NpcLocale = ['ko', 'en', 'ja'].includes(request.locale) ? request.locale : 'en';
    const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
    const response = (text: string, result?: FantasyResult): FantasyBargainingResponse => ({ handled: true, source: 'canon', text, ...(result ? { result } : {}) });
    const cancel = () => response(say('흥정 제안을 취소했습니다. 원하면 다시 말해 주세요.', 'The bargaining proposal was cancelled. Ask again whenever you wish.', '値段交渉の提案を取り消しました。希望するときは改めて話してください。'));
    if (typeof user !== 'string' || typeof request.text !== 'string' || request.text.length > 800) return { handled: false };
    const query = request.text.normalize('NFKC').toLowerCase().trim().replace(/[.!?。！？]+$/, '').trim();
    let pending = this.pending.get(user);
    const now = this.now();
    for (const [owner, prior] of this.pending) if (owner !== user && prior.expires <= now) this.pending.delete(owner);
    const c = profile.character;
    if (pending && (pending.expires <= now || !c || profile.death || pending.npc !== npcId || pending.location !== c.location
      || pending.generation !== (profile.generation ?? 1) || pending.lifeStartedAt !== c.lifeStartedAt || pending.revision !== profile.revision)) {
      this.pending.delete(user); return cancel();
    }
    if (pending && NO.test(query)) { this.pending.delete(user); return cancel(); }
    const intent = INTENT.test(query) && !EXPLANATION.test(query);
    const selection = pending && !pending.service && query.length <= 24 && !/뭐|무엇|어디|왜|what|where|why|とは|何|どこ/.test(query) ? services(query) : [];
    const approval = !!pending?.service && YES.test(query);
    if (!intent && !selection.length && !approval) {
      if (pending) this.pending.delete(user);
      return { handled: false };
    }
    const npc = NPC_PUBLIC.find(npc => npc.id === npcId);
    const local = c && npc && npc.homeLocation === c.location && fantasyBuildings(c).some(building => building.id === npc.building);
    if (!c || profile.death || c.hp <= 0 || !local || profile.activity || request.revision !== undefined && request.revision !== profile.revision) {
      this.pending.delete(user);
      return response(say('지금은 가격을 의논하기 어렵겠어. 하던 일을 마치고 가게에서 다시 이야기하자.', 'Now is not a good time to discuss prices. Finish what you are doing, then meet me at the shop.', '今は値段の相談が難しそうです。用事を済ませてから店で話しましょう。'));
    }
    const available: FantasyTradeService[] = npc.building === 'inn' ? ['room', 'food'] : npc.building === 'restaurant' ? ['food']
      : ['market', 'blacksmith', 'alchemist', 'shipyard', 'archaeology'].includes(npc.building) ? ['goods'] : [];
    const chosen = approval ? [pending!.service!] : selection.length ? selection : services(query);
    if (!available.length || chosen.some(service => !available.includes(service))) {
      this.pending.delete(user);
      return response(say('제가 맡은 서비스의 가격만 흥정할 수 있습니다.', 'I can negotiate only prices for the services I provide.', '私が扱っているサービスの値段だけ交渉できます。'));
    }
    const service = chosen.length === 1 ? chosen[0] : available.length === 1 ? available[0] : undefined;
    const stamp: Pending = { npc: npcId, location: c.location, generation: profile.generation ?? 1, lifeStartedAt: c.lifeStartedAt,
      revision: profile.revision, expires: now + 120_000, ...(service ? { service } : {}) };
    if (!service) {
      this.pending.set(user, stamp);
      return response(say('객실값과 식사비 중 무엇을 흥정할까요? 원하는 서비스를 말해 주세요.', 'Would you like to negotiate room or meal prices? Tell me which service.', '客室代と食事代のどちらを交渉しますか？希望するサービスを教えてください。'));
    }
    if (!fantasyCanHaggle(c, service)) {
      this.pending.delete(user);
      return response(say('가격 이야기는 방금 했잖아. 조금 시간이 지난 뒤에 다시 이야기하자.', 'We only just discussed the price. Let us leave it a while before trying again.', '値段の話はしたばかりですよ。少し時間をおいてから、また話しましょう。'));
    }
    if (!approval) {
      this.pending.set(user, stamp);
      return response(say(`${LABELS[service].ko} 흥정을 시작할까요? 괜찮다면 말씀해 주세요. 이야기가 잘 되면 조금 깎아 드릴게요.`, `Shall we negotiate ${LABELS[service].en}? If you agree, let me know. We may be able to settle on a better price.`, `${LABELS[service].ja}の交渉を始めますか？よければ教えてください。お話がまとまれば、少しお安くします。`));
    }
    // 承認を先に消費し、同じ返事や再入で二重実行しない。
    this.pending.delete(user);
    let result: FantasyResult;
    try { result = apply(pending!.revision, { type: 'haggle', service }); }
    catch { return response(say('잠깐만. 지금은 약속을 정하기 어렵겠어. 조금 뒤에 다시 이야기하자.', 'One moment. I cannot settle the arrangement right now. Let us talk again shortly.', '少し待ってください。今は約束を決められそうにありません。あとで話しましょう。')); }
    if (!result.changed || result.error) return response(say('사정이 달라져서 아까 이야기대로 하기는 어렵겠어. 다시 의논하자.', 'Things have changed, so I cannot keep to that arrangement. Let us discuss it again.', '事情が変わって、先ほどの話のとおりにはできそうにありません。もう一度相談しましょう。'), result);
    const bargain = result.profile.character?.bargains?.[service];
    if (!bargain || bargain.location !== c.location) return response(say('가격 약속이 엇갈린 것 같네. 다시 이야기하자.', 'It seems we have crossed wires about the price. Let us talk it through again.', '値段の話が食い違ったようですね。もう一度相談しましょう。'), result);
    return response(bargain.discount > 0
      ? say(`좋아. ${LABELS[service].ko}은 ${Math.round(bargain.discount * 100)}% 깎아 줄게.`, `Agreed: ${Math.round(bargain.discount * 100)}% off ${LABELS[service].en}.`, `わかりました。${LABELS[service].ja}を${Math.round(bargain.discount * 100)}%引きにしましょう。`)
      : say('미안하지만 지금은 더 깎아 주기 어렵겠어. 나중에 다시 이야기하자.', 'I am sorry, but I cannot lower the price any further just now. Let us talk another time.', 'すみませんが、今はこれ以上お安くできません。また今度お話ししましょう。'), result);
  }
}
