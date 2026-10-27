import type { FantasyProfile } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { fantasyGmKnowledge } from './fantasy-gm-knowledge.ts';
import { FANTASY_TERMS } from './fantasy-lore.ts';

export interface FantasyGmHistoryTurn { role: 'user' | 'assistant'; content: string }
export interface FantasyGmContext { knowledge: string; history: FantasyGmHistoryTurn[] }

export function fantasyConversationPlan(query: string): { casual: boolean; budget: number; maxTokens: number } {
  const text = String(query).normalize('NFKC').toLowerCase();
  const detailed = /자세|상세|길게|장문|구체적으로|in detail|detailed|in depth|long explanation|詳しく|詳細|長く/.test(text);
  const factual = /단서|세부퀘스트|clue|手掛かり|소지품|인벤|아이템|장비|무기|방어구|스킬|기술|마나|기맥|수련|퀘스트|의뢰|종족|능력|스탯|상태|지역|지도|시설|재료|신선|보존|영양|새벽너머|미지의\s*섬|소문의\s*섬|항해|안개|철가면|기나긴|잔광력|금화|소지금|inventory|items?|equipment|weapon|armor|skill|mana|strain|quest|race|attributes?|stats?|status|map|building|nutrition|shelf life|beyond.?dawn|uncharted.?island|voyage|ironmask|calendar|gold|持ち物|装備|武器|防具|スキル|マナ|気脈|修練|依頼|種族|能力|状態|地図|施設|栄養|保存期限|暁の向こう|未知の島|航海|鉄仮面|残光暦/.test(text);
  const social = /안녕|반가|고마|감사|기분|마음|긴장|힘들|슬퍼|우울|외로|불안|걱정|행복|인생|친구|사랑|농담|잡담|대화|편안|조용한|hello|\bhi\b|\bhey\b|thank|how are you|how was your|feel|tired|sad|lonely|anxious|nervous|worried|happy|happiness|friend|love|joke|chat|conversation|quiet evening|calm|こんにちは|こんばんは|ありがとう|気分|気持ち|緊張|疲れ|悲し|寂し|不安|心配|幸せ|友達|冗談|雑談|会話|穏やか/.test(text);
  const casual = !detailed && !factual && social;
  return { casual, budget: casual ? 550 : detailed ? 1600 : 1400, maxTokens: detailed ? 256 : casual ? 128 : 160 };
}

/** 質問に一致した正式語の各言語名だけを関連度判定へ渡す。知識そのものは権限済みの記録から選ぶ。 */
export function fantasyQueryNames(query: string): string[] {
  const text = String(query).normalize('NFKC').toLowerCase();
  const compact = text.replace(/\s/g, '');
  return [...new Set(FANTASY_TERMS.filter(term => [term.id, ...Object.values(term.names), ...Object.values(term.aliases ?? {}).flat()].some(name => {
    const normalized = name.normalize('NFKC').toLowerCase();
    return /^[a-z0-9 -]+$/.test(normalized) ? new RegExp(`(^|[^a-z0-9])${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(text) : !!normalized && compact.includes(normalized.replace(/\s/g, ''));
  })).flatMap(term => [term.id, ...Object.values(term.names)]))];
}

/** Deliberately conservative estimate for the local model's multilingual input. */
export function fantasyGmTokenEstimate(text: string): number {
  let tokens = 0;
  for (const character of text) tokens += character.codePointAt(0)! <= 0x7f ? 0.4 : 2;
  return Math.ceil(tokens);
}

/** Select complete authorized facts; the server separately budgets its system instructions and current query. */
export function fantasyGmContext(profile: FantasyProfile, locale: NpcLocale, query: string, history: readonly FantasyGmHistoryTurn[], options: { budget?: number } = {}): FantasyGmContext {
  const plan = fantasyConversationPlan(query);
  const budget = Number.isFinite(options.budget) ? Math.max(0, Math.min(2400, Math.floor(options.budget!))) : plan.budget;
  const normalized = String(query).normalize('NFKC').toLowerCase().slice(0, 1000);
  const words = [...new Set(normalized.match(/[\p{L}\p{N}]{2,}/gu) ?? [])].filter(word => !['what', 'the', 'can', 'you', 'are', 'have', 'this', 'with', 'about', 'how', 'why', 'tell', 'please', 'your', 'my', 'me', 'is', 'it', 'of', 'to', 'do', 'does', 'and', 'that', 'would', 'could', 'should'].includes(word));
  const names = fantasyQueryNames(normalized);
  const groups: [RegExp, RegExp][] = [
    [/마나|기맥|수련|mana|circulat|train|strain|affinity|マナ|気脈|修練|負荷/, /마나 수련|mana training|マナ修練|본인 스킬|Owned skill|自分のスキル/],
    [/장비|장착|무기|방어구|상태이상|버프|독|화상|equipment|equipped|weapon|armor|poison|buff|effect|装備|防具|毒|火傷|効果/, /장착 장비|지속 효과|Equipped item|timed effect|装備中|持続効果/],
    [/새벽너머|미지의\s*섬|소문의\s*섬|항해|안개|철가면|기나긴|잔광력|현력|달력|세계|마나|성별|공개설정|beyond.?dawn|uncharted.?island|voyage|ironmask|calendar|world|mana|gender|history|暁の向こう|未知の島|航海|鉄仮面|残光暦|暦|魔力|性別/, /기초 공개 설정|Public basics|基本の公開設定|직접 확인한 세계의 단서|World evidence you verified|世界の手掛かり/],
    [/소지품|인벤|아이템|물건|재료|음식|먹|식량|inventory|items?|food|eat|nutrition|shelf|meal|持ち物|食[品料事]|栄養|賞味/, /소지품|식품 관찰|식재 감별|Inventory|Food observation|ingredient appraisal|所持品|食品の観察|食材鑑定/],
    [/부대|소환|연금|조합|계절|날씨|온도|밤|company|summon|alchemy|spell|season|weather|night|部隊|召喚|錬金|調合|季節|天気|夜/, /현재 환경|Current environment|現在の環境|부대|조직|소환|마법|연금|compan|summon|spell|alchemy|部隊|召喚|魔法|錬金/],
    [/사건|이벤트|선택|event|choice|事件|選択/, /발생한 사건|미실행 선택지|Current event|Unexecuted choice|発生中の事件|未実行の選択肢/],
    [/약속|선택|promise|choice|約束|選択|단서|세부퀘스트|clue|手掛かり|퀘스트|의뢰|납품|quest|deliver|依頼|納品/, /여정에서 본인이 한 선택|Your own choice on the voyage|旅で自分がした選択|확인한 항해 단서|진행할 항해 조사|Verified voyage clue|Pending voyage investigation|確かめた航海の手掛かり|これから行う航海調査|아는 의뢰|Known quest|自分が知る依頼/],
    [/스킬|기술|마법|skill|magic|ability|スキル|魔法|技/, /본인 스킬|강화|Owned skill|enhancement|自分のスキル|強化/],
    [/신체|체구|유연|날개|좁|몸|체형|body|trait|wing|narrow|small|柔軟|体格|体|翼/, /신체 특성|상황 판정|body trait|situational check|体の特性|状況判定/],
    [/어디|지역|지도|장소|여행|가게|시설|where|place|map|travel|building|shop|地域|地図|場所|旅|施設|店/, /지역|위치|시설|region|location|facilities|地域|現在地|施設/],
    [/npc|린|보린|에리스|rin|borin|eris|인물|주민|대화|リン|ボリン|エリス|人物/, /공개 인물|public NPC|公開人物/],
    [/상태|능력|스탯|내.*정보|attributes?|stats?|status|my profile|my condition|能力|状態|私の情報/, /자기 능력치|Own attributes|自分の能力|마나 수련|mana training|マナ修練|장착 장비|Equipped item|装備中|지속 효과|timed effect|持続効果/],
  ];
  const facts = fantasyGmKnowledge(profile, locale).split('\n').map((text, index) => {
    let priority = 0;
    if (/^(현재 인물:|Current character:|現在の人物:|현재 위치:|Current location:|現在地:|진행 중인 활동:|Current activity:|進行中の行動:|캐릭터 미생성|No character|キャラクターは未作成)/.test(text)) priority += 1500;
    if (index === 0 && !plan.casual && (profile.activity || /시간|시각|날짜|time|clock|date|時刻|時間|日付/.test(normalized))) priority += 1200;
    if (!plan.casual) for (const [question, subject] of groups) if (question.test(normalized) && subject.test(text)) priority += 700;
    const lower = text.normalize('NFKC').toLowerCase();
    if (!plan.casual) {
      for (const word of words) if (lower.includes(word)) priority += 35;
      if (names.some(name => lower.includes(name.normalize('NFKC').toLowerCase()))) priority += 900;
    }
    return { text, index, priority };
  }).filter(fact => fact.priority > 0).sort((a, b) => b.priority - a.priority || a.index - b.index);
  const turns: FantasyGmHistoryTurn[] = [];
  let historyCost = 0;
  const historyLimit = Math.min(plan.casual ? 180 : 300, Math.floor(budget * 0.2));
  for (const turn of history.slice(-4).reverse()) {
    if (!turn || !['user', 'assistant'].includes(turn.role) || typeof turn.content !== 'string' || !turn.content.trim()) continue;
    const cost = fantasyGmTokenEstimate(turn.content) + 8;
    if (historyCost + cost > historyLimit) continue;
    turns.unshift({ role: turn.role, content: turn.content });
    historyCost += cost;
  }
  const selected: typeof facts = [];
  for (const fact of facts) {
    const candidate = [...selected, fact].sort((a, b) => a.index - b.index).map(entry => entry.text).join('\n');
    if (fantasyGmTokenEstimate(candidate) + 8 + historyCost <= budget) selected.push(fact);
  }
  return { knowledge: selected.sort((a, b) => a.index - b.index).map(entry => entry.text).join('\n'), history: turns };
}
