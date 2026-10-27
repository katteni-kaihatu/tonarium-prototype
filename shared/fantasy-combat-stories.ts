import type { FantasyCharacter } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';

type Text = Record<NpcLocale, string>;
export interface FantasyStoryCombat { quest: string; stage: 'field' | 'verify' | 'compare'; enemy: string; key: string; setup: Text }
const t = (ko: string, en: string, ja: string): Text => ({ ko, en, ja });
const scene = (chapter: number, stage: FantasyStoryCombat['stage'], enemy: string, setup: Text): FantasyStoryCombat => {
  const quest = `main-night-${String(chapter).padStart(2, '0')}`;
  return { quest, stage, enemy, key: `story:${quest}:${stage}`, setup };
};
export const FANTASY_STORY_COMBATS: FantasyStoryCombat[] = [
  scene(1, 'field', 'monster-cave-slime', t('망루의 우편칸으로 가는 돌계단을 슬라임이 막고 있다. 눌린 인장을 보존하려면 먼저 계단을 안전하게 확보해야 한다.', 'A slime blocks the stone steps to the dispatch alcove. Secure the steps before examining the fragile seal marks.', '差出印の棚へ続く石段をスライムが塞いでいる。脆い印を調べる前に足場の安全を確保しよう。')),
  scene(3, 'field', 'monster-skeleton-guard', t('벽면 해도 앞에서 낡은 해골 경비병이 움직인다. 벽화를 부수지 않고 통로를 확보한 뒤 실측을 이어 가자.', 'An old skeleton guard stirs before the wall chart. Secure the passage without breaking the mural, then resume measuring it.', '壁の海図の前で古い骸骨衛兵が動き出す。壁画を壊さず通路を確保してから実測を続けよう。')),
  scene(6, 'field', 'monster-venom-spider', t('옛 짜임 표로 이어지는 낮은 길에 독그물거미가 둥지를 틀었다. 표를 꺼내기 전에 길을 막은 거미부터 상대해야 한다.', 'A venom-web spider nests in the low passage to the old woven table. Deal with it before recovering the cloth.', '古い織り表への低い道に毒網蜘蛛が巣を張っている。布を取り出す前に道を塞ぐ蜘蛛に対処しよう。')),
  scene(7, 'verify', 'human-ironmask-marine', t('공방의 흔적을 재검증하려는 때, 철가면 선단의 사병이 납품표를 내놓으라며 길을 막는다. 사람의 종족이 아니라 증거를 빼앗으려는 행동이 이번 충돌의 이유다.', 'An Ironmask marine blocks the workshop and demands the delivery record. This confrontation concerns an attempt to seize evidence, not anyone’s ancestry.', '工房を再検証しようとすると鉄仮面の私兵が納品表を要求して道を塞ぐ。証拠を奪う行動が衝突の理由であり、種族の問題ではない。')),
  scene(10, 'field', 'monster-cliff-wyvern', t('떠도는섬의 관측 받침터에 와이번이 내려앉았다. 별 관측을 이어 갈 수 있도록 받침터를 확보하자.', 'A wyvern has settled on the drifting island’s observation ledge. Secure the platform so the star readings can proceed.', '漂う島の観測足場にワイバーンが降りた。星の観測を続けられるよう足場を確保しよう。')),
  scene(14, 'field', 'monster-marsh-troll', t('갈대 부표를 잇는 둑길에 늪트롤이 나타났다. 수위 표식을 읽으려면 부표와 거리를 유지하며 길을 되찾아야 한다.', 'A marsh troll occupies the causeway between the reed floats. Recover the path without crowding the water markers.', '葦の浮標を繋ぐ堤道に沼トロルが現れた。水位の標から距離を取りながら道を取り戻そう。')),
  scene(16, 'field', 'human-ironmask-marine', t('빼앗긴 해도 사본을 찾자 선단의 사병이 기록을 태우려 한다. 사본을 지킬 수 있도록 그를 저지한 뒤 화물표를 조사하자.', 'An Ironmask marine tries to burn the seized chart copy. Stop the destruction before examining the cargo record.', '奪われた海図の写しを見つけると私兵が記録を燃やそうとする。破棄を阻止してから荷札を調べよう。')),
  scene(17, 'verify', 'monster-obsidian-guardian', t('창립 편지 보관함의 흑요석 수호상이 통로를 봉쇄한다. 강한 방호를 갖춘 상대이므로 장비와 회복을 준비하자. 이를 돌파해도 서명의 정체가 저절로 밝혀지는 것은 아니다. 문서를 지키며 대조를 이어 가자.', 'An obsidian guardian blocks the founders’ letter chest. Prepare equipment and healing for its formidable protection. Passing it will not reveal the signatories by itself; preserve the documents and continue the comparison.', '創立の手紙箱を守る黒曜石の守護像が通路を塞ぐ。強い守りに備えて武具と回復を整えよう。突破だけで署名者は判明しない。文書を守って照合を続けよう。')),
];
export function fantasyStoryCombatRequirement(character: FantasyCharacter, quest: string, stage: string): FantasyStoryCombat | undefined {
  if (character.combatStoryVersion !== 1) return undefined;
  return FANTASY_STORY_COMBATS.find(combat => combat.quest === quest && combat.stage === stage && character.combatVictories?.[combat.key] === undefined);
}
