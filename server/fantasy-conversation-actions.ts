import { fantasyRankBenefitActionValid, fantasyRankBenefitActionError, fantasyRankBenefits } from '../shared/fantasy-rank-benefits.ts';
import { fantasyRankBookClaimError } from '../shared/fantasy-rank-rewards.ts';
import type { FantasyAction, FantasyProfile, FantasyResult } from '../shared/fantasy.ts';
import { FANTASY_WORLD_TIME_RATE } from '../shared/fantasy.ts';
import type { NpcId, NpcLocale } from '../shared/npc.ts';
import { NPC_PUBLIC } from '../shared/npc.ts';
import { FANTASY_EVENTS, FANTASY_ITEMS, FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_QUESTS, FANTASY_RECIPES } from '../shared/fantasy-data.ts';
import { fantasyActionHours, fantasySkills, fantasyTransports } from '../shared/fantasy-engine.ts';
import { FANTASY_DINING, FANTASY_LODGINGS } from '../shared/fantasy-life.ts';
import { FANTASY_MAPS } from '../shared/fantasy-town.ts';
import { fantasyPrice } from '../shared/fantasy-reputation.ts';
import { fantasyCraftInputs } from '../shared/fantasy-equipment.ts';
import { FANTASY_BOAT_OPTIONS } from '../shared/fantasy-gathering.ts';
import { FANTASY_ALCHEMY_FORMULAS, FANTASY_COMPANIONS, FANTASY_MAGIC_COMBINATIONS } from '../shared/fantasy-specializations.ts';
import { isFantasyAction } from './fantasy-store.ts';
import { fantasyMainStage } from '../shared/fantasy-main-trials.ts';
import { fantasyEscortAcceptError } from '../shared/fantasy-escort.ts';
import { fantasyVoyageFinishError } from '../shared/fantasy-voyage-ending.ts';
import { fantasyNpcTone } from '../shared/fantasy-dialogue-voice.ts';

export interface FantasyConversationActionContext {
  user: string; speaker: 'gm' | NpcId; locale: NpcLocale; profile: FantasyProfile; query?: string;
  marketQuote?: (action: FantasyAction) => { text: string; key: string } | undefined;
}
export interface FantasyConversationActionChoice { action: FantasyAction; label: string }
export interface FantasyConversationConfirmation { handled: boolean; text?: string; result?: FantasyResult }
interface Pending {
  choices: FantasyConversationActionChoice[]; selected?: number; expiresAt: number; locale: NpcLocale;
  revision: number; generation: number; lifeStartedAt?: number; location?: string; quote?: string; marketKey?: string;
}
const TTL = 120_000;
const ALLOWED = new Set(['rankBenefitClaim','rankBenefitReturn','rankBookClaim','draw', 'keep', 'skip', 'travel', 'explore', 'work', 'craft', 'accept', 'complete', 'abandon', 'sell', 'buy', 'use', 'skill', 'event', 'rest', 'lodge', 'eat', 'job', 'learn', 'equip', 'unequip', 'haggle', 'read', 'gather', 'hunt', 'skin', 'fish', 'boat', 'command', 'magicPrepare', 'magicCast', 'alchemy', 'wear', 'terrain', 'investigate', 'escortAccept', 'escortAbandon', 'finishVoyage']);
const normalized = (text: string) => text.normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
const yes = (text: string) => /^(?:yes|yesplease|confirm|confirmed|doit|goahead|ok|okay|sure|응|응해줘|응진행해|응진행해줘|네|네해주세요|네부탁해요|예|좋아|좋아요|확인|진행해|진행해줘|해주세요|부탁해요|はい|うん|お願いします|お願い|実行して|進めて)$/.test(normalized(text));
const no = (text: string) => /^(?:no|nothanks|cancel|stop|never mind|nevermind|아니|아니요|취소|취소해|취소해줘|그만|안할래|いいえ|キャンセル|やめて|中止)$/.test(normalized(text));
function transactionYes(text: string, action: FantasyAction): boolean {
  const query = normalized(text);
  if (action.type === 'buy') return /^(?:살게|살게요|구매할게|구매할게요|구매해줘|그거줘|그거주세요|그걸로주세요|그걸살게|buyit|illbuyit|takethose|買います|それを買います|それください)$/u.test(query);
  if (action.type === 'lodge') return /^(?:빌릴게|빌릴게요|묵을게|묵을게요|그방으로할게|그방으로해주세요|예약해줘|rentit|bookit|illtaketheroom|泊まります|その部屋でお願いします)$/u.test(query);
  if (action.type === 'accept') return /^(?:맡을게|맡을게요|수락할게|수락할게요|수락해줘|그의뢰받을게|acceptit|illtakeit|takethecontract|受けます|引き受けます|その依頼を受けます)$/u.test(query);
  return false;
}

function rankInstitutionAllows(context: FantasyConversationActionContext, action: FantasyAction): boolean {
  if(!['rankBookClaim','rankBenefitClaim','rankBenefitReturn'].includes(action.type))return true;
  const c=context.profile.character,npc=NPC_PUBLIC.find(npc=>npc.id===context.speaker);if(!c||!npc||npc.homeLocation!==c.location)return false;
  if(action.type==='rankBookClaim')return npc.building===(action.source==='priest'?'temple':'guild')&&!fantasyRankBookClaimError(c,action.source,action.skill);
  if(fantasyRankBenefitActionValid(action)){
    const benefit=[...fantasyRankBenefits(c,'adventurer'),...fantasyRankBenefits(c,'priest')].find(benefit=>benefit.claim===action.benefit);
    return !!benefit&&npc.building===(benefit.source==='priest'?'temple':'guild')&&!fantasyRankBenefitActionError(c,action);
  }
  return false;
}

function registered(action: FantasyAction, profile: FantasyProfile): boolean {
  if (action.type === 'job') return FANTASY_JOBS.some(job => job.id === action.job);
  if (action.type === 'travel') return FANTASY_LOCATIONS.some(place => place.id === action.destination);
  if (action.type === 'craft') return FANTASY_RECIPES.some(recipe => recipe.id === action.recipe);
  if (['accept', 'complete', 'abandon'].includes(action.type) && 'quest' in action) return FANTASY_QUESTS.some(quest => quest.id === action.quest);
  if (['buy', 'sell', 'use', 'equip', 'wear'].includes(action.type) && 'item' in action) return FANTASY_ITEMS.some(item => item.id === action.item) || FANTASY_MAPS.some(map => map.item === action.item);
  if (action.type === 'skill') return !!profile.character && fantasySkills(profile.character).some(skill => skill.id === action.skill && skill.kind === 'active');
  if (action.type === 'event') return FANTASY_EVENTS.some(event => event.id === profile.event && event.choices.some(choice => choice.id === action.choice));
  if (action.type === 'investigate') return !!profile.character?.quests.includes(action.quest) && fantasyMainStage(profile.character, action.quest)?.location === profile.character.location;
  if (action.type === 'escortAccept') return !!profile.character && !fantasyEscortAcceptError(profile.character, action.destination);
  if (action.type === 'escortAbandon') return !!profile.character?.escort;
  if (action.type === 'finishVoyage') return !!profile.character && !fantasyVoyageFinishError(profile.character);
  return true;
}

function selection(text: string, choices: FantasyConversationActionChoice[]): number | undefined {
  const number = text.normalize('NFKC').trim().match(/^(?:(?:option|number|선택|선택지)\s*)?(\d+)\s*(?:번|번으로|번째|番|番目|号)?[.!。]?$/i);
  if (number) { const index = Number(number[1]) - 1; return index >= 0 && index < choices.length ? index : -1; }
  const query = normalized(text);
  if (query.length < 2) return undefined;
  const ignore = new Set(['이동', '선택', '하기', '도착', '진행', 'travel', 'please', 'start', 'with', 'the', 'for']);
  const words = (text.normalize('NFKC').toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter(word => !ignore.has(word));
  const matches = choices.flatMap((choice, index) => {
    const label = normalized(choice.label);
    const labelWords = (choice.label.normalize('NFKC').toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter(word => !ignore.has(word));
    return label.includes(query) || query.includes(label) || words.some(word => labelWords.includes(word)) || labelWords.some(word => query.includes(normalized(word))) ? [index] : [];
  });
  return matches.length === 1 ? matches[0] : matches.length > 1 ? -1 : undefined;
}

/** 正式ルールが作った提案だけを渡す。モデルの自由文から行動を作成しない。 */
export class FantasyConversationActions {
  private pending = new Map<string, Pending>();
  private now: () => number;
  constructor(options: { now?: () => number } = {}) { this.now = options.now ?? Date.now; }
  private key(context: Pick<FantasyConversationActionContext, 'user' | 'speaker'>) { return JSON.stringify([context.user, context.speaker]); }
  clear(user: string, speaker?: 'gm' | NpcId): void {
    for (const key of this.pending.keys()) { const [owner, source] = JSON.parse(key); if (owner === user && (!speaker || source === speaker)) this.pending.delete(key); }
  }
  private say(locale: NpcLocale, ko: string, en: string, ja: string) { return { ko, en, ja }[locale]; }
  private voice(context: FantasyConversationActionContext, gm: [string, string, string], npc: [string, string, string]) {
    return this.say(context.locale, ...(context.speaker === 'gm' ? gm : npc));
  }
  private valid(context: FantasyConversationActionContext): boolean {
    return !!context.user && context.user.length <= 128 && ['ko', 'en', 'ja'].includes(context.locale)
      && (context.speaker === 'gm' || NPC_PUBLIC.some(npc => npc.id === context.speaker));
  }
  private quote(context: FantasyConversationActionContext, action: FantasyAction): string {
    const polite = context.speaker !== 'gm' && ['trade','scholar','priest'].includes(fantasyNpcTone(context.speaker));
    if (action.type === 'buy' || action.type === 'sell') {
      const quoted = context.marketQuote?.(action);
      if (quoted) {
        if (context.speaker === 'gm') return quoted.text;
        const amount = quoted.text.match(/^(\d+) G · (?:즉시|Immediate|即時)$/u)?.[1];
        return amount ? this.say(context.locale,
          action.type === 'sell' ? `그 물건은 ${amount}G에 사들일게${polite ? '요' : ''}. 거래는 바로 할 수 있어${polite ? '요' : ''}.` : `값은 ${amount}G${polite ? '예요' : '야'}. 거래는 바로 할 수 있어${polite ? '요' : ''}.`,
          action.type === 'sell' ? `I can pay you ${amount}G for it, and we can trade right away.` : `That will be ${amount}G, and we can trade right away.`,
          action.type === 'sell' ? `${amount}Gで買い取ります。すぐに取引できますよ。` : `${amount}Gになります。すぐに取引できますよ。`)
          : quoted.key === 'unavailable' ? this.say(context.locale,'그 물건은 지금 거래하기 어려워.','I can’t trade that item just now.','その品物は今は取引できません。') : quoted.text;
      }
    }
    if(action.type==='rankBookClaim')return this.say(context.locale,'무료 교본 한 권입니다. 선택 후에는 바꿀 수 없습니다. 이 교본을 받으시겠어요?','This one manual is free. The choice cannot be changed afterward. Would you like it?','無料の教本1冊です。選んだ後の変更はできません。この教本を受け取りますか？');
    if(fantasyRankBenefitActionValid(action)&&context.profile.character){
      const c=context.profile.character,benefit=[...fantasyRankBenefits(c,'adventurer'),...fantasyRankBenefits(c,'priest')].find(entry=>entry.claim===action.benefit);
      if(action.type==='rankBenefitReturn')return this.say(context.locale,'길드 대여품 두 개를 돌려받고 보증금 30G를 환급해 드릴게요.','Return both guild loan items and I will refund the 30G deposit.','ギルド貸出品を両方返すと、保証金30Gを返金します。');
      if(benefit)return benefit.descriptions[context.locale];
    }
    if (action.type === 'accept' && context.speaker !== 'gm') return this.say(context.locale,'맡는 데 따로 비용은 없어. 일을 마친 뒤 보고해 줘.','There is no acceptance fee. Report back when the work is done.','受注に費用はかかりません。仕事が終わったら報告してください。');
    const c = context.profile.character, locale = context.locale;
    const item = (id: string) => FANTASY_ITEMS.find(item => item.id === id);
    const name = (id: string) => item(id)?.names?.[locale] ?? FANTASY_MAPS.find(map => map.item === id)?.name[locale] ?? item(id)?.name ?? id;
    const hours = fantasyActionHours(context.profile, action);
    let gold = 0, mp = 0, inputs: Record<string, number> = {};
    if (c) {
      if (action.type === 'travel') gold = fantasyTransports(c, action.destination).find(route => route.id === action.transport)?.cost ?? 0;
      if (action.type === 'learn') gold = 5;
      if (action.type === 'buy') gold = fantasyPrice(c, item(action.item)?.price ?? FANTASY_MAPS.find(map => map.item === action.item)?.price ?? 0, 'goods');
      if (action.type === 'lodge') gold = fantasyPrice(c, FANTASY_LODGINGS.find(room => room.id === action.room)?.cost ?? 0, 'room');
      if (action.type === 'eat') gold = fantasyPrice(c, FANTASY_DINING.find(meal => meal.id === action.meal)?.cost ?? 0, 'food');
      if (action.type === 'boat') gold = FANTASY_BOAT_OPTIONS.find(boat => boat.mode === action.mode)?.price ?? 0;
      if (action.type === 'skill') mp = fantasySkills(c).find(skill => skill.id === action.skill)?.mp ?? 0;
      if (action.type === 'craft') { const recipe = FANTASY_RECIPES.find(recipe => recipe.id === action.recipe); if (recipe) inputs = fantasyCraftInputs(c, recipe, action.material, action.gem).inputs; }
      if (action.type === 'alchemy') inputs = Object.fromEntries(Object.entries(FANTASY_ALCHEMY_FORMULAS.find(formula => formula.id === action.formula)?.inputs ?? {}).filter(([, amount]) => typeof amount === 'number'));
      if (action.type === 'command') {
        const member = FANTASY_COMPANIONS.find(member => member.id === action.member);
        if (member && ['hire', 'recontract'].includes(action.operation)) { gold = action.operation === 'hire' ? member.cost : Math.ceil(member.cost / 2); mp = member.mp; }
        if (action.operation === 'recover') inputs = { potion: 1 };
        if (action.operation === 'mission' && action.kind === 'summons') mp = (c.specialization?.companies?.summons?.members ?? []).filter(member => member.assigned && member.condition === 'ready').length * 2;
      }
      if (action.type === 'magicCast') { const saved = c.specialization?.spells?.find(spell => spell.slot === action.slot); mp = FANTASY_MAGIC_COMBINATIONS.find(combo => combo.element === saved?.element && combo.form === saved?.form)?.mp ?? 0; }
    }
    const realMinutes = Number((hours * 60 / FANTASY_WORLD_TIME_RATE).toFixed(2));
    const time = hours ? this.voice(context, [`게임 ${hours}시간 / 실제 약 ${realMinutes}분`, `${hours} game h / about ${realMinutes} real min`, `ゲーム${hours}時間 / 実時間約${realMinutes}分`], [`${hours}시간`, `${hours} hours`, `${hours}時間`]) : this.say(locale, '즉시', 'Immediate', '即時');
    const materials = Object.entries(inputs).map(([id, count]) => `${name(id)}×${count}`).join(', ');
    if (context.speaker !== 'gm') {
      const supplies = Object.entries(inputs).map(([id,count])=>this.say(locale,`${name(id)} ${count}개`,`${count} ${name(id)}`,`${name(id)}を${count}個`)).join(this.say(locale,', ', ', ', '、'));
      return this.say(locale,
        `${gold ? `돈은 ${gold}G가 들어${polite ? '요' : ''}.` : `돈은 따로 들지 않아${polite ? '요' : ''}.`} ${hours ? `${hours}시간쯤 걸려${polite ? '요' : ''}.` : `바로 할 수 있어${polite ? '요' : ''}.`}${mp ? ` 마나는 ${mp}만큼 써야 해${polite ? '요' : ''}.` : ''}${supplies ? ` 재료로 ${supplies}가 필요해${polite ? '요' : ''}.` : ''}`,
        `${gold ? `It costs ${gold}G.` : 'There’s no gold cost.'} ${hours ? `It takes about ${hours} ${hours === 1 ? 'hour' : 'hours'}.` : 'We can do it right away.'}${mp ? ` You’ll need ${mp} mana.` : ''}${supplies ? ` You’ll also need ${supplies}.` : ''}`,
        `${gold ? `費用は${gold}Gです。` : 'お金はかかりませんよ。'}${hours ? `${hours}時間ほどかかります。` : 'すぐにできます。'}${mp ? `マナを${mp}使います。` : ''}${supplies ? `材料は${supplies}が必要です。` : ''}`);
    }
    return `${gold} G · ${time}${mp ? ` · ${context.speaker === 'gm' ? `${mp} MP` : this.say(locale, `마나 ${mp}`, `${mp} mana`, `マナ${mp}`)}` : ''}${materials ? ` · ${materials}` : ''}`;
  }
  private question(context: FantasyConversationActionContext, pending: Pending): string {
    if (pending.selected === undefined) return this.voice(context, ['원하는 행동의 번호나 이름을 말해 주세요.', 'Say the number or name of the action you want.', '希望する行動の番号か名前を教えてください。'], ['어느 것을 원해? 이름이나 번호로 알려줘.', 'Which would you like? Tell me its name or number.', 'どれにしますか？名前か番号を教えてください。']) + '\n' + pending.choices.map((choice, index) => `${index + 1}. ${choice.label}`).join('\n');
    const choice = pending.choices[pending.selected];
    if (context.speaker !== 'gm' && ['trade','scholar','priest'].includes(fantasyNpcTone(context.speaker))) return this.say(context.locale, `「${choice.label}」 말씀이시죠? ${pending.quote} 이대로 준비해 드릴까요?`, `You'd like "${choice.label}"? ${pending.quote} Shall I arrange that for you?`, `「${choice.label}」ですね。${pending.quote}この内容で用意しましょうか？`);
    return this.voice(context, [`「${choice.label}」을 진행할까요? (${pending.quote})\n원하면 "응", 취소하려면 "취소"라고 말해 주세요.`, `Start "${choice.label}"? (${pending.quote})\nReply "yes" or "cancel".`, `「${choice.label}」を始めますか？（${pending.quote}）\n「はい」か「キャンセル」で答えてください。`], [`「${choice.label}」 말이지? ${pending.quote} 이대로 진행할까?`, `You'd like "${choice.label}"? ${pending.quote} Shall we go ahead?`, `「${choice.label}」ですね。${pending.quote}このまま進めますか？`]);
  }
  propose(context: FantasyConversationActionContext, proposals: readonly FantasyConversationActionChoice[]): { text: string } {
    const key = this.key(context); this.pending.delete(key);
    if (!this.valid(context)) return { text: '' };
    if (context.profile.activity || context.profile.character?.returnLantern || context.profile.death) return { text: this.voice(context, ['지금은 새 게임 행동을 시작할 수 없습니다.', 'You cannot start another gameplay action now.', '今は新しいゲーム行動を始められません。'], ['지금은 다른 일을 시작하기 어렵겠어. 준비가 되면 다시 이야기하자.', 'Let us wait until you are ready to begin something else.', '今は別のことを始めるのは難しそうですね。準備が整ってから話しましょう。']) };
    const choices = proposals.filter(choice => choice && typeof choice.label === 'string' && choice.label.trim() && choice.label.length <= 200 && isFantasyAction(choice.action) && ALLOWED.has(choice.action.type) && registered(choice.action, context.profile) && rankInstitutionAllows(context,choice.action)
      && (context.speaker === 'gm' || !['job', 'learn'].includes(choice.action.type) || 'npcId' in choice.action && choice.action.npcId === context.speaker && (choice.action.type !== 'job' || choice.action.via === 'npc'))).slice(0, 20).map(choice => ({ action: structuredClone(choice.action), label: choice.label.trim() }));
    if (!choices.length) return { text: '' };
    const candidate = choices.length === 1 ? 0 : context.query ? selection(context.query, choices) : undefined;
    const selected = candidate !== undefined && candidate >= 0 ? candidate : undefined;
    const pending: Pending = { choices, selected, expiresAt: this.now() + TTL, locale: context.locale, revision: context.profile.revision, generation: context.profile.generation ?? 1, lifeStartedAt: context.profile.character?.lifeStartedAt, location: context.profile.character?.location };
    if (selected !== undefined) { pending.quote = this.quote(context, choices[selected].action); pending.marketKey = context.marketQuote?.(choices[selected].action)?.key; }
    for (const [id, value] of this.pending) if (value.expiresAt <= this.now()) this.pending.delete(id);
    if (this.pending.size >= 5000) this.pending.delete(this.pending.keys().next().value!);
    this.pending.set(key, pending);
    return { text: this.question(context, pending) };
  }
  confirm(context: FantasyConversationActionContext & { text: string }, apply: (revision: number, action: FantasyAction) => FantasyResult): FantasyConversationConfirmation {
    const key = this.key(context), pending = this.pending.get(key);
    if (!pending || !this.valid(context)) return { handled: false };
    if (no(context.text)) { this.pending.delete(key); return { handled: true, text: this.voice(context, ['행동을 취소했습니다.', 'Action canceled.', '行動を取り消しました。'], ['알겠어. 이번에는 진행하지 않을게.', 'All right. We will leave it for now.', 'わかりました。今回は見送りましょう。']) }; }
    const selected = pending.selected === undefined ? selection(context.text, pending.choices) : undefined;
    if (!yes(context.text) && !(pending.selected !== undefined && transactionYes(context.text, pending.choices[pending.selected].action)) && selected === undefined) return { handled: false };
    const c = context.profile.character;
    if (this.now() >= pending.expiresAt || pending.locale !== context.locale || pending.revision !== context.profile.revision || pending.generation !== (context.profile.generation ?? 1) || pending.lifeStartedAt !== c?.lifeStartedAt || pending.location !== c?.location) {
      this.pending.delete(key);
      return { handled: true, text: this.voice(context, ['시간이 지났거나 상태가 바뀌었습니다. 행동을 다시 요청해 주세요.', 'The proposal expired or your state changed. Ask for the action again.', '提案の期限が切れたか状態が変わりました。行動をもう一度頼んでください。'], ['아까와 사정이 달라졌네. 원하는 것을 다시 말해 줄래?', 'Things have changed since we spoke. Could you tell me what you need again?', '先ほどとは事情が変わりましたね。希望をもう一度教えてもらえますか？']) };
    }
    if (context.profile.activity || context.profile.character?.returnLantern || context.profile.death) { this.pending.delete(key); return { handled: true, text: this.voice(context, ['지금은 새 게임 행동을 시작할 수 없습니다.', 'You cannot start another gameplay action now.', '今は新しいゲーム行動を始められません。'], ['지금은 다른 일을 시작하기 어렵겠어. 준비가 되면 다시 이야기하자.', 'Let us wait until you are ready to begin something else.', '今は別のことを始めるのは難しそうですね。準備が整ってから話しましょう。']) }; }
    if (pending.selected === undefined) {
      if (selected !== undefined && selected >= 0) { pending.selected = selected; pending.quote = this.quote(context, pending.choices[selected].action); pending.marketKey = context.marketQuote?.(pending.choices[selected].action)?.key; }
      return { handled: true, text: this.question(context, pending) };
    }
    this.pending.delete(key);
    const choice = pending.choices[pending.selected];
    if (this.quote(context, choice.action) !== pending.quote || context.marketQuote?.(choice.action)?.key !== pending.marketKey) return { handled: true, text: this.say(context.locale, '비용이나 시간이 바뀌었습니다. 행동을 다시 요청해 주세요.', 'The cost or duration changed. Ask for the action again.', '費用か時間が変わりました。行動をもう一度頼んでください。') };
    const result = apply(pending.revision, structuredClone(choice.action));
    return { handled: true, result, text: context.speaker === 'gm' ? result.error ?? this.say(context.locale, '확인한 행동을 요청했습니다.', 'The confirmed action was requested.', '確認した行動を依頼しました。') : result.error ? this.say(context.locale, '지금은 그렇게 도와주기 어렵겠어. 준비를 갖추고 다시 이야기하자.', 'I cannot arrange that just now. Let us talk again when you are ready.', '今はそうするのは難しそうです。準備を整えてから話しましょう。') : this.say(context.locale, '좋아. 이야기한 대로 준비할게.', 'All right. I will arrange what we agreed.', 'では、お話ししたとおりに用意します。') };
  }
}
