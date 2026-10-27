import type { NpcLocale } from '../shared/npc.ts';

const META = /\b(?:AI|NPC|LLM|WebLLM|ChatGPT|GPT|Qwen|browser|server|player|game|gameplay|developer|programmer|interface|database|system prompt|model|world bible|canonical glossary|canon|provided context|training data|official (?:world )?(?:records|settings)|prototype|tokens?|click|buttons?)\b|인공지능|챗봇|브라우저|서버|플레이어|게임|프롬프트|공식\s*(?:설정|기록)|설정집|시스템|버튼|토큰|모델|학습\s*데이터|제공된\s*(?:문맥|맥락|정보)|인터페이스|클릭|화면\s*(?:아래|위|상단|하단)|データベース|ブラウザ|サーバー|プレイヤー|ゲーム|プロンプト|公式(?:設定|記録)|設定集|システム|ボタン|トークン|モデル|学習データ|提供された(?:文脈|情報)|クリック|画面(?:下|上)/i;

export function npcBreaksFourthWall(text: string): boolean {
  return META.test(text.normalize('NFKC')) || /\b(?:UI|software|prompts?|computer program|source code|fourth wall)\b|스킬창|인벤토리|메뉴창|메뉴에서|메뉴를\s*(?:열|켜|선택)|상태\s*창|제4의\s*벽|프로그래밍|open (?:the |your )?(?:inventory|status|skill|settings|quest)?\s*(?:menu|screen|window)|ステータス画面|スキル画面|メニュー(?:を開|から選)|インベントリ/i.test(text)
    || /^[\[{]/.test(text.trim()) || /```|<(?:tool_call|script)\b/i.test(text);
}

export function npcInWorldFallback(locale: NpcLocale): string {
  return {
    ko: '내가 직접 아는 일만 이야기할게. 궁금한 것을 조금 다르게 물어봐 줄래?',
    en: 'Let me speak only of what I know firsthand. Could you put your question another way?',
    ja: '私が直接知っていることだけお話しします。少し言い換えて聞いてもらえますか？',
  }[locale];
}
