import type { FantasyProfile } from '../shared/fantasy.ts';
import type { NpcLocale } from '../shared/npc.ts';
import { NPC_PUBLIC } from '../shared/npc.ts';
import type { FantasyPropertyCommand, FantasyPropertyState } from '../shared/fantasy-property.ts';
interface Context { user: string; npc: string; text: string; locale: NpcLocale; profile: FantasyProfile; state: FantasyPropertyState; requestId: string }
interface Pending { mode: 'selection' | 'quote'; generation: number; lifeStartedAt?: number; location: string; locale: NpcLocale; expires: number; plot?: string; price?: number; plotRevision?: number; profileRevision?: number }
interface Applied { error?: string; updates?: { user: string; profile: FantasyProfile }[] }
const affirmative = /^(네|예|응|좋아|좋아요|확인|진행해줘|구매할게|살게|yes|confirm|ok|okay|go ahead|buy it|はい|うん|お願いします|買います)[.!。\s]*$/;
const negative = /^(아니|아니요|취소|취소해줘|그만|안할래|no|cancel|no thanks|never mind|いいえ|キャンセル|やめて)[.!。\s]*$/;
const intent = (query: string) => /흥정|깎|할인|haggle|bargain|discount|値引|値切|交渉/.test(query) && /부동산|농지|경작지|업장|주거|집값|땅값|토지|property|farmland|business|house|land|不動産|農地|店舗|住宅|土地/.test(query)
  && !/뭐|무엇|뜻|방법|어떻게|what (?:is|does)|how (?:does|to)|explain|とは|って何|仕組み|方法/.test(query);
const kinds = (query: string) => [/농지|경작지|farmland|農地/.test(query) ? 'farmland' : undefined, /업장|business|店舗/.test(query) ? 'commercial' : undefined, /주거|집값|house|住宅/.test(query) ? 'residence' : undefined].filter((kind): kind is 'farmland' | 'commercial' | 'residence' => !!kind);
export class FantasyPropertyDialogue {
  private pending = new Map<string, Pending>();
  constructor(private now = Date.now) {}
  clear(user: string) { for (const key of this.pending.keys()) if (JSON.parse(key)[0] === user) this.pending.delete(key); }
  chat(context: Context, apply: (command: FantasyPropertyCommand) => Applied, current: () => FantasyPropertyState): { handled: boolean; text?: string } {
    const { user, npc, profile, locale } = context, c = profile.character;
    const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
    const key = JSON.stringify([user, npc]), query = context.text.normalize('NFKC').trim().toLowerCase(), waiting = this.pending.get(key);
    const speaker = NPC_PUBLIC.find(p => p.id === npc);
    if (!c || !speaker || speaker.homeLocation !== c.location || !['guild', 'market', 'residence'].includes(speaker.building)) return { handled: false };
    const changed = () => ({ handled: true, text: say('견적이 바뀌었어. 다시 물어봐 줘.', 'The quote changed. Please ask again.', '見積もりが変わりました。もう一度お尋ねください。') });
    if (waiting && negative.test(query)) { this.pending.delete(key); return { handled: true, text: say('알겠어. 이번 거래는 진행하지 않을게.', 'All right. We will leave this purchase for now.', 'わかりました。今回の取引は見送りましょう。') }; }
    if (profile.death || profile.activity || profile.combatId || profile.event || c.hp <= 0) {
      this.pending.delete(key);
      return waiting || intent(query) ? { handled: true, text: say('하던 일을 마치고 준비가 되면 다시 이야기하자.', 'Let us talk again when you have finished and are ready.', '用事を済ませ、準備が整ってから話しましょう。') } : { handled: false };
    }
    if (waiting && (waiting.expires <= this.now() || waiting.generation !== (profile.generation ?? 1) || waiting.lifeStartedAt !== c.lifeStartedAt || waiting.location !== c.location || waiting.locale !== locale
      || waiting.profileRevision !== undefined && waiting.profileRevision !== profile.revision)) { this.pending.delete(key); return changed(); }
    if (waiting?.mode === 'quote' && affirmative.test(query)) {
      this.pending.delete(key);
      const plot = current().plots.find(p => p.id === waiting.plot);
      if (!plot || plot.ownerName || !plot.listed || plot.revision !== waiting.plotRevision || plot.management?.bargain?.price !== waiting.price) return changed();
      const result = apply({ type: 'acceptBargain', plot: plot.id, revision: plot.revision, requestId: context.requestId });
      return { handled: true, text: result.error ? say('지금은 그 거래를 마칠 수 없어.', 'That purchase cannot be completed now.', '今はその取引を終えられません。') : say('대금과 소유권 이전을 마쳤어.', 'Payment and transfer of ownership are complete.', '支払いと所有権の移転が終わりました。') };
    }
    if (waiting?.mode === 'selection' && affirmative.test(query)) return { handled: true, text: say('농지·업장·주거 중 하나를 먼저 알려줘.', 'First tell me: farmland, a business, or a home.', 'まず農地・店舗・住宅のどれかを教えてください。') };
    const selected = kinds(query), selecting = waiting?.mode === 'selection' && selected.length > 0 && query.length <= 40 && !/무엇|뭐|어디|왜|what|where|why|とは|何|どこ/.test(query);
    if (!intent(query) && !selecting) return { handled: false };
    this.pending.delete(key);
    const candidates = selected.length > 1 ? [] : current().plots.filter(p => p.location === c.location && !p.ownerName && p.listed && (!selected.length || p.kind === selected[0]));
    const pending: Pending = { mode: 'selection', generation: profile.generation ?? 1, lifeStartedAt: c.lifeStartedAt, location: c.location, locale, expires: this.now() + 120000 };
    if (candidates.length !== 1) { this.pending.set(key, pending); while (this.pending.size > 512) this.pending.delete(this.pending.keys().next().value!); return { handled: true, text: say('농지·업장·주거 중 어떤 매물 가격을 알아볼까?', 'Which listing: farmland, a business, or a home?', '農地・店舗・住宅の、どの物件でしょうか？') }; }
    const plot = candidates[0], result = apply({ type: 'bargain', plot: plot.id, revision: plot.revision, requestId: context.requestId });
    const updated = current().plots.find(p => p.id === plot.id), quote = updated?.management?.bargain;
    if (result.error || !quote || !updated || updated.ownerName || !updated.listed) return { handled: true, text: say('지금은 새 견적을 내기 어려워. 조금 뒤 다시 와 줘.', 'I cannot offer a new quote now. Please return later.', '今は新しい見積もりを出せません。少し後でお越しください。') };
    this.pending.set(key, { ...pending, mode: 'quote', plot: plot.id, price: quote.price, plotRevision: updated.revision, profileRevision: result.updates?.find(update => update.user === user)?.profile.revision });
    while (this.pending.size > 512) this.pending.delete(this.pending.keys().next().value!);
    return { handled: true, text: say(`${plot.names.ko}은 ${quote.price}G로 제안할게. 이 금액으로 구매할까?`, `The offer for ${plot.names.en} is ${quote.price}G. Shall I arrange the purchase?`, `${plot.names.ja}は${quote.price}Gです。この金額で購入しますか？`) };
  }
}
