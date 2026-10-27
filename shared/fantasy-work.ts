import type { FantasyActivity, FantasyWorkProgress } from './fantasy.ts';
import { FANTASY_JOBS } from './fantasy-data.ts';
import type { NpcLocale } from './npc.ts';

export const FANTASY_WORK_INTERVAL = .25;
export const FANTASY_WORK_STEPS = 16;
type Names = [string, string, string];
const TASKS: Record<string, Names> = {
  unassigned: ['마을 일손 돕기', 'Helping townsfolk', '町の手伝い'],
  adventurer: ['의뢰품 운반', 'Carrying contract supplies', '依頼品の運搬'],
  merchant: ['손님과 거래', 'Serving a customer', '客との商い'],
  blacksmith: ['쇠붙이 두드리기', 'Hammering a fitting', '金具の鍛造'],
  cook: ['주문한 요리 준비', 'Preparing an order', '注文の調理'],
  alchemist: ['시약 조제', 'Preparing a reagent', '試薬の調合'],
  hunter: ['사냥감 흔적 추적', 'Following quarry tracks', '獲物の追跡'],
  bard: ['거리 공연', 'A street performance', '街角の演奏'],
  mage: ['마력 도구 점검', 'Inspecting a magic tool', '魔道具の点検'],
  leader: ['일손과 경비 배치', 'Organizing workers and guards', '人手と警備の配置'],
  thief: ['소매치기', 'Pickpocketing', 'すり'],
  smuggler: ['밀수품 운반', 'Moving contraband', '密輸品の運搬'],
  assassin: ['은밀한 의뢰 수행', 'A covert assignment', '密かな依頼の遂行'],
  bandit: ['행인 금품 갈취', 'Waylaying a traveler', '旅人からの略奪'],
  spy: ['은밀한 정보 수집', 'Gathering intelligence', '密かな情報収集'],
  crimeboss: ['조직의 뒷거래 조율', 'Coordinating a shady deal', '組織の裏取引の調整'],
  priest: ['신전의 돌봄 봉사', 'Caring for temple visitors', '神殿での世話'],
  warrior: ['경비 근무', 'Guard duty', '警備の仕事'],
  knight: ['행렬 호위', 'Escorting a procession', '行列の護衛'],
  spearfighter: ['창술 경비', 'Spear watch', '槍での警備'],
  archer: ['망루 경계', 'Keeping watch from a tower', '見張り台での警戒'],
  scout: ['주변 정찰', 'Scouting the surroundings', '周囲の偵察'],
  pugilist: ['훈련 상대 돕기', 'Assisting a sparring partner', '稽古相手の手伝い'],
  spellblade: ['마력 무기 경비', 'Guarding with a spellblade', '魔剣での警備'],
  shieldbearer: ['짐꾼의 안전 확보', 'Protecting porters', '荷運び人の護衛'],
  summoner: ['계약 동료와 운반 돕기', 'Hauling with a contracted companion', '契約した仲間との運搬'],
  carpenter: ['목재 이음새 다듬기', 'Fitting a wooden joint', '木材の継ぎ目の加工'],
  tailor: ['주문 의복 바느질', 'Sewing a clothing order', '注文の衣服の縫製'],
  weaver: ['베틀 작업', 'Working the loom', '機織り'],
  leatherworker: ['가죽 손질', 'Dressing leather', '革の手入れ'],
  gemcutter: ['보석 면 연마', 'Polishing a gemstone facet', '宝石の研磨'],
  herbalist: ['약초 선별', 'Sorting medicinal herbs', '薬草の選別'],
  farmer: ['공동 밭 돌보기', 'Tending a shared field', '共同の畑の世話'],
  fisher: ['공동 어장 살피기', 'Working a shared fishing ground', '共同の漁場の世話'],
  baker: ['빵 굽기', 'Baking bread', 'パン焼き'],
  potter: ['도자기 빚기', 'Shaping pottery', '陶器作り'],
  shipwright: ['선체 이음새 보수', 'Repairing a hull joint', '船体の継ぎ目の補修'],
  scribe: ['의뢰 문서 필사', 'Copying a commissioned document', '依頼文書の筆写'],
};
const named = (job: string, locale: NpcLocale) => TASKS[job]?.[locale === 'ko' ? 0 : locale === 'en' ? 1 : 2]
  ?? FANTASY_JOBS.find(value => value.id === job)?.names[locale] ?? job;

export const newFantasyWorkProgress = (): FantasyWorkProgress => ({ completed: 0, successes: 0, gold: 0, xp: 0, totalSteps: FANTASY_WORK_STEPS });
export const fantasyWorkSteps = (work: FantasyWorkProgress): number => work.totalSteps ?? 8;
export const fantasyWorkInterval = (activity: Pick<FantasyActivity, 'startedAt' | 'endsAt' | 'work'>): number =>
  (activity.endsAt - activity.startedAt) / (activity.work ? fantasyWorkSteps(activity.work) : FANTASY_WORK_STEPS);
export function validFantasyWorkProgress(value: unknown): value is FantasyWorkProgress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const steps = v.totalSteps ?? 8;
  return [4, 5].includes(Object.keys(v).length) && Object.keys(v).every(key => ['completed', 'successes', 'gold', 'xp', 'totalSteps'].includes(key))
    && [8, 16].includes(Number(steps)) && (v.totalSteps === undefined || v.totalSteps === 8 || v.totalSteps === 16)
    && ['completed', 'successes', 'gold', 'xp'].every(key => Number.isSafeInteger(v[key]) && Number(v[key]) >= 0 && Number(v[key]) <= 1_000_000)
    && Number(v.completed) <= Number(steps) && Number(v.successes) <= Number(v.completed);
}
export function fantasyWorkStepRewards(work: FantasyWorkProgress, success: boolean): { gold: number; xp: number } {
  const step = work.completed + 1, steps = fantasyWorkSteps(work), last = step === steps;
  if (steps === 8) {
    const even = step % 2 === 0;
    return { gold: success ? 1 + (even ? 1 : 0) + (last ? 2 : 0) : (even ? 1 : 0) + (last ? 1 : 0),
      xp: (success || even ? 1 : 0) + (last && work.successes + Number(success) >= 4 ? 2 : 0) };
  }
  const portion = (budget: number) => Math.ceil(step * budget / steps) - Math.ceil((step - 1) * budget / steps);
  return { gold: portion(success ? 14 : 5), xp: portion(success ? 8 : 4) + (last && work.successes + Number(success) >= steps / 2 ? 2 : 0) };
}
export function fantasyWorkTickLog(job: string, tick: number, success: boolean, gold: number, xp: number, steps = FANTASY_WORK_STEPS): string {
  return `仕事の経過［${job}］${tick}/${steps}：${success ? '成功' : '失敗'}、金貨+${gold}枚、経験値+${xp}。`;
}
export function fantasyWorkSummaryLog(job: string, work: FantasyWorkProgress): string {
  return `仕事の集計［${job}］：成功${work.successes}/${work.completed}、金貨${work.gold}枚、経験値${work.xp}（途中の受取分を含む）。`;
}
export function fantasyWorkLogText(text: string, locale: NpcLocale): string | undefined {
  const tick = /^仕事の経過［([a-z-]+)］(\d+)\/(8|16)：(成功|失敗)、金貨\+(\d+)枚、経験値\+(\d+)。$/.exec(text);
  if (tick) {
    const [, job, step, steps, status, gold, xp] = tick, success = status === '成功', name = named(job, locale);
    return { ko: `${name} ${success ? '성공' : '실패'} (${step}/${steps}) · G+${gold} · XP+${xp}`,
      en: `${name}: ${success ? 'success' : 'failure'} (${step}/${steps}) · G+${gold} · XP+${xp}`,
      ja: `${name}${status}（${step}/${steps}）・G+${gold}・XP+${xp}` }[locale];
  }
  const total = /^仕事の集計［([a-z-]+)］：成功(\d+)\/(\d+)、金貨(\d+)枚、経験値(\d+)（途中の受取分を含む）。$/.exec(text);
  if (total) {
    const [, job, successes, steps, gold, xp] = total, name = named(job, locale);
    return { ko: `${name} 종합: ${successes}/${steps}회 성공 · 총 G+${gold}, XP+${xp} (중간에 받은 보상 포함)`,
      en: `${name} summary: ${successes}/${steps} successes · total G+${gold}, XP+${xp} (includes earlier rewards)`,
      ja: `${name}の集計：成功${successes}/${steps}回・計G+${gold}、XP+${xp}（途中の受取分を含む）` }[locale];
  }
  return undefined;
}
