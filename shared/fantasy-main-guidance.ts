import type { FantasyCharacter } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { fantasyMainProgress, fantasyMainStage, fantasyMainTrial } from './fantasy-main-trials.ts';
export { FANTASY_MAIN_APPROACHES } from './fantasy-main-trials.ts';
import { fantasyKnownLocations } from './fantasy-town.ts';
import { fantasyTermName } from './fantasy-lore.ts';
import { FANTASY_QUESTS } from './fantasy-data.ts';

type Approach = 'observe' | 'analyze' | 'restore';

export function fantasyMainApproachLabel(kind: 'field' | 'archive', approach: Approach, locale: NpcLocale): string {
  const labels = kind === 'field'
    ? { observe: ['흔적 살피기', 'Survey traces', '痕跡を調べる'], analyze: ['구조 분석', 'Analyze the structure', '構造を分析する'], restore: ['도구로 복원', 'Restore with tools', '道具で復元する'] }
    : { observe: ['증언과 흔적 대조', 'Compare accounts and traces', '証言と痕跡を照合する'], analyze: ['기록 해독', 'Decipher records', '記録を解読する'], restore: ['기록 복원', 'Restore records', '記録を復元する'] };
  return labels[approach][locale === 'ko' ? 0 : locale === 'en' ? 1 : 2];
}

export function fantasyMainGuidance(character: FantasyCharacter, questId: string, locale: NpcLocale): string | undefined {
  const trial = fantasyMainTrial(questId);
  if (!trial) return undefined;
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  if (character.completed.includes(questId)) return say('조사와 보고를 마쳤습니다.', 'Investigation and report completed.', '調査と報告は完了しています。');
  const recommendation = say(`권장 레벨 ${trial.recommendedLevel}`, `Recommended level ${trial.recommendedLevel}`, `推奨レベル${trial.recommendedLevel}`);
  if (!character.quests.includes(questId)) return `${recommendation}. ${say('수락한 뒤 현장 조사와 증거 대조가 필요합니다. 물품은 조사용 재료입니다.', 'Accept first, then investigate and cross-check evidence. Goods are investigation supplies.', '受注後に現地調査と証拠の照合が必要です。品物は調査用の資材です。')}`;
  const step = fantasyMainProgress(character, questId), stage = fantasyMainStage(character, questId);
  const progress = say(`조사 ${step}/${trial.stages.length}`, `Investigation ${step}/${trial.stages.length}`, `調査${step}/${trial.stages.length}`);
  if (!stage) return `${recommendation} · ${progress}. ${FANTASY_QUESTS.find(quest => quest.id === questId)?.reportAt ? say('현장 조사를 마쳤습니다. 재료를 갖추고 섬에서 항해 일지를 완성하세요.', 'The field tasks are complete. Bring the supplies and finish the voyage journal on the island.', '現地の調査を終えました。資材を揃え、島で航海日誌を完成させてください。') : say('조사를 마쳤습니다. 재료를 갖춰 의뢰인에게 보고하세요.', 'Investigation complete. Bring the supplies and report to the issuer.', '調査完了。資材を揃えて依頼人に報告してください。')}`;
  const location = fantasyKnownLocations(character).includes(stage.location) ? fantasyTermName(stage.location, locale) : say('미지의 장소', 'Unknown place', '未知の場所');
  return `${recommendation} · ${progress}. ${stage.labels[locale]} — ${location}. ${say('한 번에 실제 약 1분. 실패해도 확보한 단서는 남습니다.', 'About one real minute per attempt. Previously secured clues survive failure.', '1回に実時間約1分。失敗しても確保した手掛かりは残ります。')}`;
}
