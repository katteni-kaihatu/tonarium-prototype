import type { NpcLocale } from '../../../shared/npc.ts';
import { fantasyCombatErrorText, type FantasyCombatError } from '../../../shared/fantasy-combat.ts';
import { fantasyErrorText } from './fantasy-copy.ts';

const ERROR_CODES = ['invalid', 'stale', 'not-active', 'not-owner', 'already-ordered', 'down', 'target', 'range', 'mana', 'item', 'unnecessary', 'blocked', 'capacity', 'silenced', 'cooldown', 'carrying'];
export function combatError(text: string, locale: NpcLocale) {
  if (ERROR_CODES.includes(text)) return fantasyCombatErrorText(text as FantasyCombatError, locale);
  const words: Record<string, [string, string]> = {
    unavailable: ['지금 전투 요청을 처리할 수 없어요. 다시 확인해 주세요.', 'Combat is unavailable. Refresh and try again.'],
    busy: ['현재 행동이나 전투를 먼저 마쳐 주세요.', 'Finish the current activity or combat first.'],
    'save-failed': ['저장에 실패해 행동이 확정되지 않았어요. 다시 시도해 주세요.', 'Saving failed; the action was not committed. Try again.'],
    'not-in-world': ['같은 판타지 세계에 참가해야 해요.', 'Join the same fantasy session first.'],
    'not-ready': ['파티원 모두 같은 전투에 준비해야 해요.', 'All party members must ready for the same battle.'],
    '生きている人物で戦闘に参加してください。': ['살아 있는 인물로 참가하세요.', 'A living character is required.'],
    'すでに戦闘中です。': ['이미 전투 중이에요.', 'You are already in combat.'],
    '現在の行動や出来事を先に終えてください。': ['현재 활동이나 사건을 먼저 마쳐 주세요.', 'Finish the current activity or encounter first.'],
    'ここではその相手と戦えません。': ['이곳에서 싸울 수 있는 상대가 아니에요.', 'That opponent is unavailable here.'],
    '危険を確認してから挑んでください。': ['위험을 확인한 뒤 도전해 주세요.', 'Confirm the danger before challenging.'],
    'この場所で危険の兆しを先に調べてください。': ['이곳의 위험한 흔적부터 살펴보세요.', 'Inspect the dangerous signs here first.'],
    'この強敵はまだ再戦に応じません。': ['아직 다시 도전할 수 없어요. 처치 후 게임 하루가 필요해요.', 'Wait one game day after a victory before challenging again.'],
    '戦闘を終えるか離脱してから行動してください。': ['전투를 끝내거나 퇴각한 뒤 행동할 수 있어요.', 'Finish combat or retreat before taking another activity.'],
  };
  if (locale === 'ja') return ({unavailable:'いまは戦闘を処理できません。再確認してください。',busy:'いまの行動や戦闘を先に終えてください。','save-failed':'保存に失敗し、行動は確定していません。もう一度お試しください。','not-in-world':'同じファンタジー世界に参加してください。','not-ready':'全員が同じ戦闘に準備してください。'} as Record<string,string>)[text]??text;
  if (words[text]) return words[text][locale === 'ko' ? 0 : 1];
  const translated = fantasyErrorText(text, locale);
  return /[ぁ-んァ-ン]/.test(translated) ? { ko: '전투 조건이 바뀌었어요. 현재 상태를 다시 확인해 주세요.', en: 'Combat conditions changed. Check the current state.' }[locale] : translated;
}
