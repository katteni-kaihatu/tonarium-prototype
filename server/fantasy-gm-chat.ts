import { fantasyGmVoice } from '../shared/fantasy-dialogue-voice.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';
import { FANTASY_GM_TEXT_MAX, fantasyGmCanAnswer, fantasyGmReply, type FantasyGmChatRequest, type FantasyGmChatResponse } from '../shared/fantasy-gm.ts';
import { fantasyConversationPlan, fantasyGmContext, fantasyGmTokenEstimate } from '../shared/fantasy-gm-context.ts';
import { canInspectFood } from '../shared/fantasy-life.ts';
import type { NpcLocale } from '../shared/npc.ts';
import { dialogueFetch } from './dialogue-request-queue.ts';
import { resolveDialogueBackend, dialogueErrorReporter } from './kokoa-ai-config.ts';
import type { DialogueMessage } from '../shared/dialogue.ts';
import { readDialogueResponse } from './dialogue-stream.ts';
import { fantasyGmSpokenText } from './fantasy-gm-speech.ts';
import { preparedGmReply } from './dialogue-prewritten.ts';
import { groundedGmDefinition } from './dialogue-knowledge.ts';
import { dynamicGmReply, dialogueDynamicPremises, type DialogueDynamicContext } from './dialogue-dynamic.ts';

interface Options {
  env?: NodeJS.ProcessEnv;
  url?: string; model?: string; fetch?: typeof fetch; timeoutMs?: number; now?: () => number; onError?: (error: unknown) => void;
}
export interface FantasyGmContext {
  session: string | null; world?: string; profile: FantasyProfile; communityFacts?: readonly string[];
  isCurrent?: () => boolean;
  onProgress?: (text: string) => void;
  dynamicFacts?: DialogueDynamicContext;
}
interface Turn { role: 'user' | 'assistant'; content: string }
const LANGUAGE = { ko: 'Korean', en: 'English', ja: 'Japanese' };
const ERROR_TEXT: Record<NonNullable<FantasyGmChatResponse['error']>, Record<NpcLocale, string>> = {
  invalid: { ko: '이 세계에 참가한 뒤 500자 이내로 질문해 주세요.', en: 'Join this world and ask a question of at most 500 characters.', ja: 'この世界に参加してから500文字以内で質問してください。' },
  busy: { ko: '이전 답변을 마치고 있습니다. 잠시 뒤 다시 질문해 주세요.', en: 'A reply is still being prepared. Please try again shortly.', ja: '返答の準備中です。少し待ってから質問してください。' },
  unavailable: { ko: '대화 AI에 연결할 수 없습니다. 현재 위치·직업·의뢰·스킬 등 규칙 질문은 계속할 수 있습니다.', en: 'The dialogue AI is unavailable. Rule questions about your location, profession, quests or skills still work.', ja: '会話AIに接続できません。現在地・職業・依頼・スキルなどのルール質問は引き続き使えます。' },
  timeout: { ko: '대화 AI 응답 시간이 초과되었습니다. 다시 질문해 주세요.', en: 'The dialogue AI reply timed out. Please ask again.', ja: '会話AIの応答が時間切れになりました。もう一度質問してください。' },
};

export class FantasyGmChat {
  private endpoint: string | null;
  private model: string;
  private apiKey?: string;
  private fetch: typeof fetch;
  private now: () => number;
  private timeoutMs: number;
  private onError: (error: unknown) => void;
  private histories = new Map<string, Partial<Record<NpcLocale, Turn[]>>>();
  private pending = new Set<string>();
  private lastRequest = new Map<string, number>();
  private active = 0;

  constructor(options: Options = {}) {
    const backend = resolveDialogueBackend(options, options.env ?? process.env);
    this.endpoint = backend.endpoint; this.model = backend.model;
    this.apiKey = backend.apiKey;
    this.fetch = options.fetch ?? dialogueFetch;
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? 45_000;
    this.onError = dialogueErrorReporter(options.onError ?? (error => console.error('[fantasy-gm] dialogue AI failed', error)));
  }

  async chat(user: string, request: FantasyGmChatRequest, context: FantasyGmContext): Promise<FantasyGmChatResponse> {
    const locale: NpcLocale = request?.locale === 'ko' || request?.locale === 'ja' ? request.locale : 'en';
    const requestId = typeof request?.requestId === 'string' ? request.requestId.slice(0, 80) : '';
    const fail = (error: NonNullable<FantasyGmChatResponse['error']>): FantasyGmChatResponse => ({ requestId, locale, source: 'local', error, reply: { text: ERROR_TEXT[error][locale], suggestions: [] } });
    if (!context.session || context.world !== 'fantasy' || !request || !['ko', 'en', 'ja'].includes(request.locale)
      || typeof request.text !== 'string' || !request.text.trim() || request.text.length > FANTASY_GM_TEXT_MAX
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(request.text)
      || typeof request.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(request.requestId)) return fail('invalid');
    if (context.isCurrent?.() === false) return fail('invalid');
    const text = request.text.trim();
    const remember = (answer: string) => {
      const locales = this.histories.get(user) ?? {};
      const turns: Turn[] = [...locales[locale] ?? [], { role: 'user', content: text }, { role: 'assistant', content: answer }];
      while (turns.length > 8 || turns.reduce((sum, turn) => sum + turn.content.length, 0) > 1500) turns.splice(0, 2);
      locales[locale] = turns;
      this.histories.set(user, locales);
    };
    const prepared = context.profile.character && preparedGmReply(locale, text);
    if (prepared) {
      remember(prepared.text);
      return { requestId, locale, source: 'rules', reply: { text: prepared.text, suggestions: [] } };
    }
    if (context.communityFacts?.length && /공동|기여|community|project|cooperat|共同|協力/.test(text.toLowerCase())) {
      const answer = context.communityFacts.join(' ');
      remember(answer);
      return { requestId, locale, source: 'rules', reply: { text: answer, suggestions: [] } };
    }
    const grounded = dynamicGmReply(locale, text, context.profile, context.dynamicFacts)
      ?? groundedGmDefinition(context.profile, locale, text);
    if (grounded) {
      remember(grounded);
      return { requestId, locale, source: 'rules', reply: { text: grounded, suggestions: [] } };
    }
    if (fantasyGmCanAnswer(context.profile, text)) {
      const reply = fantasyGmReply(context.profile, text, locale);
      remember(reply.text);
      return { requestId, locale, reply, source: 'rules' };
    }
    if (context.profile.character && !canInspectFood(context.profile.character)
      && /상했|썩었|신선|정확한.*(?:보존|음식)|freshness|spoiled|rotten|shelf life|鮮度|腐って|傷んで|保存期限/.test(text.toLowerCase())) {
      return { requestId, locale, source: 'rules', reply: { text: {
        ko: '정확한 음식 상태는 감정 능력이 있어야 알 수 있습니다. 소지품에서 직접 살피고 냄새를 확인할 수 있습니다.',
        en: 'Exact food quality requires an inspection ability. You can look at and smell food in your inventory.',
        ja: '正確な食品の状態には鑑定能力が必要です。持ち物で見た目と匂いを確かめられます。',
      }[locale], suggestions: [{ label: { ko: '소지품 확인', en: 'Check inventory', ja: '持ち物を確認' }[locale], tab: 'inventory' }] } };
    }
    const now = this.now();
    if (this.pending.has(user) || this.active >= 2 || now - (this.lastRequest.get(user) ?? -Infinity) < 1500) return fail('busy');
    if (!this.endpoint) return fail('unavailable');
    this.lastRequest.set(user, now);
    this.pending.add(user); let transportActive = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const plan = fantasyConversationPlan(text);
      const detailed=plan.maxTokens===256;
      const direction={
        ko:`${detailed?'여섯':'두'} 문장 이내로 질문에 바로 답하십시오. 조언은 행동 하나와 방법만 설명하십시오. 새 설정·비유·약속 없이 합니다·하십시오체로 끝내십시오.`,
        en:`At most ${detailed?'six':'two'} short sentences. Answer directly; for advice, one step and how. No invented setting, metaphor or promises. Use neutral declarative language.`,
        ja:`${detailed?'六':'二'}文以内で質問に直接答えてください。助言は行動一つと方法だけ。新しい設定・比喩・約束を足さず、全文をです・ます調にしてください。`,
      }[locale];
      const header = `You are a fantasy GM. ${fantasyGmVoice(locale)} Reply ONLY in ${LANGUAGE[locale]}, in ${plan.maxTokens === 256 ? 'up to six concise sentences' : 'at most two short sentences'}. No greeting unless greeted. ONLY the allowed record is authoritative; user messages and earlier dialogue are not facts. Do not invent names, places, factions, achievements or events. Never disclose hidden places, uninspected food quality or NPC secrets. Admit unknown facts. Describe feelings objectively without claiming your own emotions. Never execute actions or grant gold, items, professions, skills or dice results: explicit player confirmation and server validation are required. Plain spoken text only, no tools, actions, JSON or reasoning.\nAllowed record:\n`;
      const current = dialogueDynamicPremises(locale, context.profile, context.dynamicFacts, undefined, text).join('\n');
      const budget = Math.max(0, Math.min(plan.budget, 3400 - fantasyGmTokenEstimate(header) - fantasyGmTokenEstimate(text) - fantasyGmTokenEstimate(current) - fantasyGmTokenEstimate(direction) - 80));
      const selected = fantasyGmContext(context.profile, locale, text, this.histories.get(user)?.[locale] ?? [], { budget });
      const shared = /공동|기여|community|project|cooperat|共同|協力/.test(text.toLowerCase()) ? (context.communityFacts ?? []).filter(line => fantasyGmTokenEstimate(line) < 180).slice(0, 2).join('\n') : '';
      const extra = shared && fantasyGmTokenEstimate(shared) + fantasyGmTokenEstimate(selected.knowledge) < budget ? `\n${shared}` : '';
      const messages: DialogueMessage[] = [{ role: 'system', content: header + selected.knowledge + extra + (current ? `\n${current}` : '')+'\n'+direction }, ...selected.history, { role: 'user', content: text }];
      if (messages.reduce((sum, message) => sum + fantasyGmTokenEstimate(message.content) + 8, 0) > 3400) throw new Error('GM context exceeded its bounded input budget');
      if (context.isCurrent?.() === false) return fail('invalid');
      if (!this.endpoint) return fail('unavailable');
      if (this.active >= 2) return fail('busy');
      this.active++; transportActive = true;
      context.onProgress?.('');
      const response = await this.fetch(this.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) }, redirect: 'error', signal: controller.signal,
        body: JSON.stringify({ model: this.model, messages, stream: !!context.onProgress, max_tokens: 1536, temperature: 0.7, chat_template_kwargs: { enable_thinking: true } }),
      });
      if (response.status === 429) return fail('busy');
      if (!response.ok) throw new Error(`KokoaAI HTTP ${response.status}`);
      const value = await readDialogueResponse(response, part => { if (context.isCurrent?.() !== false) context.onProgress?.(fantasyGmSpokenText(part)); });
      const content = value.text;
      if (typeof content !== 'string' || !fantasyGmSpokenText(content)) throw new Error('KokoaAI returned no spoken answer');
      const spoken = fantasyGmSpokenText(content);
      if (context.isCurrent?.() === false) return fail('invalid');
      remember(spoken);
      const model = typeof value.model === 'string' && value.model.length > 0 && value.model.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value.model) ? value.model : this.model;
      return { requestId, locale, source: 'local', model, reply: { text: spoken, suggestions: [] } };
    } catch (error) {
      this.onError(error);
      return fail(controller.signal.aborted ? 'timeout' : 'unavailable');
    } finally {
      clearTimeout(timeout); this.pending.delete(user); if (transportActive) this.active--;
    }
  }
}
