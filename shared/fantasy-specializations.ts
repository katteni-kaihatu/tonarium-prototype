import { fantasyHasJob } from './fantasy-careers.ts';
import { fantasyMagicKnown, initializeFantasyMagicKnowledge, validFantasyMagicKnowledge } from './fantasy-magic-discovery.ts';
import type { FantasyAction, FantasyCharacter, FantasyProfile, FantasyResult, FantasyStat, FantasyStats } from './fantasy.ts';
import { FANTASY_ITEMS, FANTASY_LOCATIONS } from './fantasy-data.ts';
import { fantasyBuildings } from './fantasy-town.ts';
import type { NpcLocale } from './npc.ts';
import { fantasyManaAfterSkill, fantasyManaSkillError } from './fantasy-mana.ts';
import { fantasyCircleKnowledge, fantasyCircleNodeCapacity, fantasyCompileCircle, grantFantasyCircleBasics, validFantasyCircleKnowledge, validFantasyCircleShape, type FantasyCircleRecipe, FANTASY_CIRCLE_CORES, FANTASY_CIRCLE_RUNES } from './fantasy-magic-circle.ts';
import { FANTASY_PATH_SUMMONS, fantasyCompanionAvailable } from './fantasy-summon-paths.ts';
import { FANTASY_WORKER_COMPANIONS, fantasyIsWorkerCompanion, fantasyHasWorkerCompany } from './fantasy-worker-companions.ts';
import { fantasyAlchemyFormulaKnown, fantasyAlchemyUnidentifiedFormulaName, learnFantasyAlchemyFormula } from './fantasy-alchemy-discovery.ts';
export { fantasyCompanionAvailable } from './fantasy-summon-paths.ts';

type Names = Record<NpcLocale, string>;
const l = (ko: string, en: string, ja: string): Names => ({ ko, en, ja });
export type FantasyCompanyKind = 'troop' | 'syndicate' | 'summons';
export interface FantasyCompanion { id: string; condition: 'ready' | 'injured' | 'absent'; hp: number; assigned: boolean; missions: number; workerLevel?: number }
export interface FantasyPreparedSpell { slot: number; element: 'flame' | 'tide' | 'gale' | 'stone' | 'light'; form: 'bolt' | 'veil' | 'mend'; circle?: FantasyCircleRecipe }
export interface FantasySpecializationState { companies?: Partial<Record<FantasyCompanyKind, { members: FantasyCompanion[] }>>; spells?: FantasyPreparedSpell[] }
export type FantasySpecializationAction =
  | { type: 'command'; kind: FantasyCompanyKind; operation: 'hire' | 'assign' | 'dismiss' | 'mission' | 'recover' | 'recontract'; member?: string }
  | { type: 'magicPrepare'; slot: number; element: string; form: string }
  | { type: 'magicCompose'; slot: number; core: string; runes: string[] }
  | { type: 'magicCast'; slot: number }
  | { type: 'alchemy'; formula: string };
export interface FantasySpecializationContext {
  stats: FantasyStats;
  check: (profile: FantasyProfile, stat: FantasyStat, dc: number, label: string, rng: () => number) => boolean;
  addItem: (profile: FantasyProfile, item: string, count: number) => void;
  hurt: (profile: FantasyProfile, amount: number) => void;
}
const JOBS: Record<FantasyCompanyKind, string> = { troop: 'leader', syndicate: 'crimeboss', summons: 'summoner' };
const random = (rng: () => number) => Math.max(0, Math.min(1 - Number.EPSILON, Number(rng()) || 0));
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, low: number, high: number): value is number => Number.isSafeInteger(value) && Number(value) >= low && Number(value) <= high;

export const FANTASY_COMPANIONS: { id: string; kind: FantasyCompanyKind; names: Names; role: Names; cost: number; mp: number; hp: number; check: number; guard: number; requiresPath?: string }[] = [
  ...FANTASY_PATH_SUMMONS,
  ...FANTASY_WORKER_COMPANIONS,
  { id: 'troop-guard', kind: 'troop', names: l('방패 호위병', 'Shield Escort', '盾の護衛'), role: l('호위', 'Guard', '護衛'), cost: 10, mp: 0, hp: 30, check: 0, guard: 2 },
  { id: 'troop-scout', kind: 'troop', names: l('길잡이 정찰병', 'Trail Scout', '道の斥候'), role: l('정찰', 'Scout', '偵察'), cost: 12, mp: 0, hp: 24, check: 1, guard: 0 },
  { id: 'troop-carrier', kind: 'troop', names: l('짐꾼 대원', 'Company Porter', '荷運びの隊員'), role: l('지원', 'Support', '支援'), cost: 8, mp: 0, hp: 28, check: 1, guard: 0 },
  { id: 'troop-veteran', kind: 'troop', names: l('노련한 호위병', 'Veteran Escort', '熟練の護衛'), role: l('방호', 'Protection', '防護'), cost: 18, mp: 0, hp: 36, check: 1, guard: 1 },
  { id: 'syndicate-runner', kind: 'syndicate', names: l('연락 담당', 'Organization Runner', '連絡係'), role: l('연락', 'Liaison', '連絡'), cost: 10, mp: 0, hp: 24, check: 1, guard: 0 },
  { id: 'syndicate-lookout', kind: 'syndicate', names: l('망보기 담당', 'Organization Lookout', '見張り役'), role: l('관찰', 'Observation', '観察'), cost: 12, mp: 0, hp: 24, check: 1, guard: 0 },
  { id: 'syndicate-keeper', kind: 'syndicate', names: l('물자 담당', 'Supply Keeper', '物資係'), role: l('보급', 'Supplies', '補給'), cost: 8, mp: 0, hp: 28, check: 0, guard: 2 },
  { id: 'syndicate-mediator', kind: 'syndicate', names: l('조정 담당', 'Organization Mediator', '調整役'), role: l('조정', 'Coordination', '調整'), cost: 18, mp: 0, hp: 30, check: 1, guard: 1 },
  { id: 'summon-wisp', kind: 'summons', names: l('계약의 등불정령', 'Contract Wisp', '契約の灯精'), role: l('관측', 'Observation', '観測'), cost: 10, mp: 6, hp: 20, check: 1, guard: 0 },
  { id: 'summon-stone', kind: 'summons', names: l('계약의 돌지기', 'Contract Stoneward', '契約の石守'), role: l('방호', 'Protection', '防護'), cost: 14, mp: 8, hp: 32, check: 0, guard: 2 },
  { id: 'summon-gale', kind: 'summons', names: l('계약의 바람지기', 'Contract Windward', '契約の風守'), role: l('길잡이', 'Guide', '道案内'), cost: 16, mp: 8, hp: 22, check: 1, guard: 1 },
];
export const FANTASY_MAGIC_ELEMENTS = [
  { id: 'flame', names: l('불', 'Flame', '火') }, { id: 'tide', names: l('물', 'Water', '水') },
  { id: 'gale', names: l('바람', 'Wind', '風') }, { id: 'stone', names: l('돌', 'Stone', '石') }, { id: 'light', names: l('빛', 'Light', '光') },
];
export const FANTASY_MAGIC_FORMS = [{ id: 'bolt', names: l('집중', 'Focus', '集中') }, { id: 'veil', names: l('장막', 'Veil', '帳') }, { id: 'mend', names: l('회복', 'Mending', '癒やし') }];
export const FANTASY_MAGIC_COMBINATIONS: { element: FantasyPreparedSpell['element']; form: FantasyPreparedSpell['form']; names: Names; mp: number; effect: 'check' | 'guard' | 'heal'; power: number; stat?: FantasyStat }[] = [
  { element: 'flame', form: 'bolt', names: l('화염 집중', 'Flame Focus', '火の集中'), mp: 7, effect: 'check', stat: 'strength', power: 4 },
  { element: 'flame', form: 'veil', names: l('온기 장막', 'Warmth Veil', '温もりの帳'), mp: 9, effect: 'guard', power: 8 },
  { element: 'tide', form: 'veil', names: l('물결 장막', 'Tidal Veil', '水の帳'), mp: 8, effect: 'guard', power: 7 },
  { element: 'tide', form: 'mend', names: l('물결 회복', 'Tidal Mending', '水の癒やし'), mp: 10, effect: 'heal', power: 22 },
  { element: 'gale', form: 'bolt', names: l('바람 집중', 'Wind Focus', '風の集中'), mp: 7, effect: 'check', stat: 'agility', power: 4 },
  { element: 'stone', form: 'bolt', names: l('대지 집중', 'Earth Focus', '大地の集中'), mp: 8, effect: 'check', stat: 'vitality', power: 4 },
  { element: 'stone', form: 'veil', names: l('돌의 방호', 'Stone Veil', '石の帳'), mp: 11, effect: 'guard', power: 10 },
  { element: 'light', form: 'bolt', names: l('빛의 집중', 'Light Focus', '光の集中'), mp: 8, effect: 'check', stat: 'intelligence', power: 4 },
  { element: 'light', form: 'mend', names: l('빛의 회복', 'Light Mending', '光の癒やし'), mp: 12, effect: 'heal', power: 28 },
];
export const FANTASY_ALCHEMY_FORMULAS = [
  { id: 'healing', names: l('회복약 조합', 'Healing Mixture', '回復薬の調合'), inputs: { herb: 2, redleaf: 1 }, output: 'hp-potion-1', family: 'hp-potion', dc: 11 },
  { id: 'mana', names: l('마력약 조합', 'Mana Mixture', '魔力薬の調合'), inputs: { moonmint: 2, crystal: 1 }, output: 'mp-potion-1', family: 'mp-potion', dc: 12 },
  { id: 'fatigue', names: l('피로회복약 조합', 'Restorative Mixture', '疲労回復薬の調合'), inputs: { sunroot: 1, spice: 1 }, output: 'fatigue-potion-1', family: 'fatigue-potion', dc: 12 },
  { id: 'antidote', names: l('해독약 조합', 'Antidote Mixture', '解毒薬の調合'), inputs: { herb: 1, silverweed: 1 }, output: 'antidote', family: '', dc: 10 },
];

const ERRORS: [string, Names][] = [
  ['職業の管理記録を確認できません。', l('직업 관리 기록을 확인할 수 없습니다.', 'The profession management record is unavailable.', '職業の管理記録を確認できません。')],
  ['現在の職業ではその仲間を指揮できません。', l('현재 직업으로는 해당 동료를 지휘할 수 없습니다.', 'Your current profession cannot command those companions.', '現在の職業ではその仲間を指揮できません。')],
  ['その雇用・契約はできません。', l('그 고용·계약은 진행할 수 없습니다.', 'That recruitment or agreement is unavailable.', 'その雇用・契約はできません。')],
  ['現在の熟練度では仲間の定員です。', l('현재 숙련도에서 동료 정원에 도달했습니다.', 'You have reached the companion capacity for your proficiency.', '現在の熟練度では仲間の定員です。')],
  ['この場所では仲間を募ったり契約したりできません。', l('현재 장소에서는 동료를 모집하거나 계약할 수 없습니다.', 'You cannot recruit or make that agreement here.', 'この場所では仲間を募ったり契約したりできません。')],
  ['雇用・契約に必要な金貨やMPが足りません。', l('고용·계약에 필요한 금화나 MP가 부족합니다.', 'You lack the gold or MP needed for this agreement.', '雇用・契約に必要な金貨やMPが足りません。')],
  ['編成できる元気な仲間を選んでください。', l('편성할 수 있는 건강한 동료를 선택해 주세요.', 'Choose a healthy companion who can be assigned.', '編成できる元気な仲間を選んでください。')],
  ['戦闘に編成できる仲間は合計2人までです。', l('전투에 편성할 동료는 모두 합해 2명까지입니다.', 'You may assign at most two battle companions in total.', '戦闘に編成できる仲間は合計2人までです。')],
  ['その仲間はいません。', l('해당 동료가 없습니다.', 'That companion is not in your roster.', 'その仲間はいません。')],
  ['治療が必要な負傷した仲間を選んでください。', l('치료가 필요한 부상 동료를 선택해 주세요.', 'Choose an injured companion who needs treatment.', '治療が必要な負傷した仲間を選んでください。')],
  ['仲間の治療には宿屋か神殿と回復薬1個が必要です。', l('동료 치료에는 여관 또는 신전과 회복 물약 1개가 필요합니다.', 'Treating a companion requires an inn or temple and one recovery potion.', '仲間の治療には宿屋か神殿と回復薬1個が必要です。')],
  ['任務に参加する仲間を編成してください。', l('임무에 참여할 동료를 편성해 주세요.', 'Assign companions before starting a mission.', '任務に参加する仲間を編成してください。')],
  ['その仲間への指示は登録されていません。', l('등록되지 않은 동료 지시입니다.', 'That companion instruction is not registered.', 'その仲間への指示は登録されていません。')],
  ['現在の職業・保存枠ではその魔法を合成できません。', l('현재 직업이나 저장 칸으로 해당 마법을 합성할 수 없습니다.', 'Your profession or available slot cannot prepare that spell.', '現在の職業・保存枠ではその魔法を合成できません。')],
  ['使える合成魔法、または必要なMPがありません。', l('사용 가능한 합성 마법이 없거나 MP가 부족합니다.', 'No usable prepared spell is available, or MP is insufficient.', '使える合成魔法、または必要なMPがありません。')],
  ['この魔法には戦闘中の対象が必要です。', l('이 마법에는 전투 중 대상이 필요합니다.', 'This spell requires a target during combat.', 'この魔法には戦闘中の対象が必要です。')],
  ['回復や一時強化を適用する余地がありません。', l('회복이나 일시 강화를 적용할 여지가 없습니다.', 'There is no room for that healing or temporary buff.', '回復や一時強化を適用する余地がありません。')],
  ['この職業・場所ではその錬金調合ができません。', l('현재 직업·장소에서는 해당 연금 조합을 할 수 없습니다.', 'Your profession or location cannot make that mixture.', 'この職業・場所ではその錬金調合ができません。')],
  ['錬金調合の材料が足りません。', l('연금 조합 재료가 부족합니다.', 'The alchemy ingredients are insufficient.', '錬金調合の材料が足りません。')],
  ['調合結果の品物を確認できません。', l('조합 결과 아이템을 확인할 수 없습니다.', 'The resulting item is not registered.', '調合結果の品物を確認できません。')],
  ['仲間の編成を更新した。', l('동료 편성을 변경했습니다.', 'The companion formation was updated.', '仲間の編成を更新した。')],
  ['仲間との契約を終了した。', l('동료와의 계약을 종료했습니다.', 'The companion agreement ended.', '仲間との契約を終了した。')],
  ['現地任務は中止となった。仲間の状態を確認してください。', l('현지 임무가 중단되었습니다. 동료 상태를 확인해 주세요.', 'The local mission was stopped. Check your companions.', '現地任務は中止となった。仲間の状態を確認してください。')],
];
export function fantasySpecializationText(text: string, locale: NpcLocale): string | undefined {
  const exact = ERRORS.find(([source]) => source === text); if (exact) return exact[1][locale];
  const say = (ko: string, en: string, ja = text) => ({ ko, en, ja })[locale];
  const unknownAlchemyFailure = text.match(/^未確認の配合 ([1-4])は安定せず中止した。最初の材料を1個失った。$/);
  if (unknownAlchemyFailure) {
    const formula = FANTASY_ALCHEMY_FORMULAS[Number(unknownAlchemyFailure[1]) - 1], name = fantasyAlchemyUnidentifiedFormulaName(formula.id, locale);
    return say(`${name}: 안정되지 않아 중단했습니다. 첫 재료 1개를 잃었습니다.`, `${name}: unstable mixture stopped; one unit of the first ingredient was lost.`);
  }
  const circleLog = text.match(/^(.+)(を第(\d+)枠へ保存した。|を使った。MP(\d+)を消費。)$/);
  if (circleLog) {
    const [coreName, ...runeNames] = circleLog[1].split(' · '), core = FANTASY_CIRCLE_CORES.find(core => core.names.ja === coreName);
    const runes = runeNames.map(name => FANTASY_CIRCLE_RUNES.find(rune => rune.names.ja === name));
    if (core && runes.every(Boolean)) {
      const name = [core.names[locale], ...runes.map(rune => rune!.names[locale])].join(' · ');
      return circleLog[3] ? say(`${name}을 ${circleLog[3]}번 칸에 저장했습니다.`, `${name} was saved in slot ${circleLog[3]}.`) : say(`${name} 사용: MP${circleLog[4]} 소비.`, `${name} cast: spent ${circleLog[4]} MP.`);
    }
  }
  const entity = [...FANTASY_COMPANIONS, ...FANTASY_MAGIC_COMBINATIONS, ...FANTASY_ALCHEMY_FORMULAS].find(entity => text.startsWith(entity.names.ja));
  if (entity) {
    const name = entity.names[locale]; let match: RegExpMatchArray | null;
    if ((match = text.match(/と(再契約した|契約した)。金貨(\d+)枚・MP(\d+)。$/))) return say(`${name}과 ${match[1] === '再契約した' ? '재계약' : '계약'}했습니다. ${match[2]}G · MP${match[3]}.`, `${name}: agreement ${match[1] === '再契約した' ? 'renewed' : 'made'}. ${match[2]}G · MP${match[3]}.`);
    if (text.includes('負傷した。治療で復帰できる。')) return say(`${name}: 부상했습니다. 치료 후 복귀할 수 있습니다.`, `${name}: injured; treatment allows a return.`);
    if (text.includes('離脱した。再契約で復帰できる。')) return say(`${name}: 이탈했습니다. 재계약으로 복귀할 수 있습니다.`, `${name}: departed; renewing the agreement allows a return.`);
    if (text.includes('の負傷を治療した。')) return say(`${name}의 부상을 치료했습니다. 회복 물약 1개 사용.`, `${name}'s injury was treated using one recovery potion.`);
    if ((match = text.match(/を第(\d+)枠へ保存した。$/))) return say(`${name}을 ${match[1]}번 칸에 저장했습니다.`, `${name} was saved in slot ${match[1]}.`);
    if ((match = text.match(/を使った。MP(\d+)を消費。$/))) return say(`${name} 사용: MP${match[1]} 소비.`, `${name} cast: spent ${match[1]} MP.`);
    if (text.endsWith('は安定せず中止した。最初の材料を1個失った。')) return say(`${name}: 안정되지 않아 중단했습니다. 첫 재료 1개를 잃었습니다.`, `${name}: unstable mixture stopped; one unit of the first ingredient was lost.`);
    const item = FANTASY_ITEMS.find(item => text.endsWith(`：${item.name}を1個調合した。`));
    if (item) return say(`${name}: ${item.names?.[locale] ?? item.name} 1개 조합.`, `${name}: made one ${item.names?.[locale] ?? item.name}.`);
  }
  const reward = text.match(/^仲間との現地任務を終え、金貨(\d+)枚を得た。$/);
  if (reward) return say(`동료와 현지 임무를 마치고 ${reward[1]}G를 받았습니다.`, `The local mission with companions earned ${reward[1]}G.`);
  return undefined;
}

export function fantasySpellCapacity(character: Pick<FantasyCharacter, 'jobXp'> & Partial<Pick<FantasyCharacter, 'job'>>): number {
  const xp = character.jobXp[character.job === 'priest' ? 'priest' : 'mage'] ?? 0; return xp >= 100 ? 3 : xp >= 30 ? 2 : 1;
}
export function fantasyCanPrepareMagic(character: FantasyCharacter, element: string, form: string, slot = 1): boolean {
  const combo = FANTASY_MAGIC_COMBINATIONS.find(combo => combo.element === element && combo.form === form);
  const profession = character.job === 'mage' && combo?.effect!=='heal' || character.job === 'priest' && ['tide', 'light'].includes(element) && (combo?.effect === 'heal' || combo?.effect === 'guard');
  return !!combo && profession && integer(slot, 1, fantasySpellCapacity(character)) && fantasyMagicKnown(character, element, form);
}
export function fantasyCompanyCapacity(character: Pick<FantasyCharacter, 'jobXp'>, kind: FantasyCompanyKind): number {
  const xp = character.jobXp[JOBS[kind]] ?? 0; return (kind === 'summons' ? 1 : 2) + (xp >= 100 ? 2 : xp >= 30 ? 1 : 0);
}
export function fantasyActiveCompanions(character: FantasyCharacter): { kind: FantasyCompanyKind; member: FantasyCompanion }[] {
  return (Object.entries(character.specialization?.companies ?? {}) as [FantasyCompanyKind, { members: FantasyCompanion[] }][])
    .flatMap(([kind, company]) => company.members.filter(member => member.assigned && member.condition === 'ready' && member.hp > 0 && fantasyCompanionAvailable(character, member.id)).map(member => ({ kind, member }))).slice(0, 2);
}
export function fantasyCompanionBonus(character: FantasyCharacter): { check: number; guard: number } {
  const active = fantasyActiveCompanions(character), summons = active.filter(entry => entry.kind === 'summons');
  const summonReady = !summons.length || character.mp >= summons.length * 2 && !fantasyManaSkillError(character, 'specialization');
  return active.filter(entry => entry.kind !== 'summons' || summonReady).reduce((bonus, { member }) => {
    const definition = FANTASY_COMPANIONS.find(template => template.id === member.id);
    return { check: Math.min(3, bonus.check + (definition?.check ?? 0)), guard: Math.min(4, bonus.guard + (definition?.guard ?? 0)) };
  }, { check: 0, guard: 0 });
}
function addLog(profile: FantasyProfile, text: string, success = true) {
  profile.log.push({ id: (profile.log.at(-1)?.id ?? 0) + 1, hour: profile.character!.hour, text, kind: success ? 'success' : 'failure' });
  profile.log = profile.log.slice(-100);
}
export function settleFantasyCompanions(profile: FantasyProfile, success: boolean, rng: () => number): number {
  const c = profile.character; if (!c) return 0;
  const active = fantasyActiveCompanions(c), summons = active.filter(entry => entry.kind === 'summons');
  let mp = summons.length * 2;
  if (c.mp < mp || mp > 0 && !!fantasyManaSkillError(c, 'specialization')) { for (const { member } of summons) member.assigned = false; mp = 0; }
  c.mp -= mp;
  if (mp > 0) { const spent = fantasyManaAfterSkill(c, 'specialization', mp); c.mana = spent.mana; c.fatigue = spent.fatigue; }
  for (const { member } of active) {
    if (!member.assigned) continue;
    member.missions = Math.min(Number.MAX_SAFE_INTEGER, member.missions + 1);
    if (success) continue;
    member.hp = Math.max(0, member.hp - 8 - Math.floor(random(rng) * 8));
    if (member.hp === 0 || random(rng) < .25) member.condition = 'absent';
    else member.condition = 'injured';
    member.assigned = false;
    addLog(profile, `${FANTASY_COMPANIONS.find(template => template.id === member.id)!.names.ja}：${member.condition === 'absent' ? '離脱した。再契約で復帰できる。' : '負傷した。治療で復帰できる。'}`, false);
  }
  return mp;
}
export function fantasyCompanionRescue(character: FantasyCharacter): boolean {
  return fantasyCompanionBonus(character).guard > 0;
}
export function fantasySpecializationSummary(character: FantasyCharacter, locale: NpcLocale): string {
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  const kind = (Object.keys(JOBS) as FantasyCompanyKind[]).find(kind => JOBS[kind] === character.job) ?? (fantasyHasWorkerCompany(character) ? 'troop' : undefined);
  if (kind) {
    const members = (character.specialization?.companies?.[kind]?.members ?? []).filter(member => fantasyCompanionAvailable(character, member.id));
    const title = { troop: l('부대', 'Company', '部隊'), syndicate: l('조직', 'Organization', '組織'), summons: l('소환 계약', 'Summoning contracts', '召喚契約') }[kind][locale];
    return `${title}: ${members.length}/${fantasyCompanyCapacity(character, kind)}. ${members.map(member => `${FANTASY_COMPANIONS.find(template => template.id === member.id)?.names[locale] ?? '?'} HP${member.hp} ${member.condition === 'ready' ? say('대기', 'ready', '待機') : member.condition === 'injured' ? say('부상', 'injured', '負傷') : say('이탈', 'absent', '離脱')}${member.assigned ? say('·편성', '·assigned', '・編成中') : ''}`).join(', ')} ${say('편성한 건강한 동료는 탐사와 임무의 판정·방호를 돕습니다. 실패 후 부상은 치료하고 이탈은 재계약합니다.', 'Assigned healthy companions aid checks and protection in exploration and missions. Treat injuries and renew agreements after departure.', '編成した元気な仲間は探索と任務の判定・防護を助けます。負傷は治療し、離脱は再契約します。')}`;
  }
  if (character.job === 'mage' || character.job === 'priest') return say(`마법진 저장 칸 ${fantasySpellCapacity(character)}/3, 룬 자리 ${fantasyCircleNodeCapacity(character)}개. 배운 중심 문양에 룬을 배치하면 위력·MP·사거리·범위가 바뀝니다. 공격은 전투 중에 시전합니다.`, `Circle spell slots ${fantasySpellCapacity(character)}/3; ${fantasyCircleNodeCapacity(character)} rune nodes. Place learned runes around a known core to change power, MP, reach and area. Cast attacks during combat.`, `魔法陣の保存枠${fantasySpellCapacity(character)}/3、ルーン枠${fantasyCircleNodeCapacity(character)}個。学んだ核とルーンで威力・MP・射程・範囲が変わります。攻撃術は戦闘で使用します。`);
  if (fantasyHasJob(character,'alchemist')) return say('연금 조합은 현지 연금 공방에서 실제 재료를 소비해 약을 만듭니다. 재료 등급과 숙련이 품질의 중심이며 무작위 편차는 작습니다.', 'Alchemy mixtures consume actual ingredients at a local workshop. Material grades and proficiency determine quality, with only small random variation.', '錬金調合は現地の工房で実際の材料を使って薬を作ります。品質は材料と熟練が中心で、乱数の差は小さくなります。');
  return say('지도자는 부대, 범죄조직두목은 조직, 소환술사는 소환 계약, 마법사는 마법 합성, 연금술사는 전용 조합 메뉴를 사용합니다.', 'Leaders manage a company, crime bosses an organization, summoners contracts, mages prepared spells, and alchemists mixtures.', '指導者は部隊、裏社会の頭領は組織、召喚士は契約、魔術師は合成魔法、錬金術師は専用調合を扱います。');
}
export function validFantasySpecialization(character: Pick<FantasyCharacter, 'specialization' | 'jobXp'> & Partial<Pick<FantasyCharacter, 'magicKnowledge' | 'readBooks' | 'circleKnowledge' | 'job' | 'jobPaths' | 'hour' | 'lastPrayerDay'>>): boolean {
  if (!validFantasyMagicKnowledge(character) || !validFantasyCircleKnowledge(character)) return false;
  const state = character.specialization;
  if (state === undefined) return true;
  if (!record(state) || Object.keys(state).some(key => !['companies', 'spells'].includes(key))) return false;
  if (state.companies !== undefined) {
    if (!record(state.companies) || Object.keys(state.companies).some(key => !Object.hasOwn(JOBS, key))) return false;
    for (const kind of Object.keys(state.companies) as FantasyCompanyKind[]) {
      const company = state.companies[kind];
      if (!record(company) || Object.keys(company).length !== 1 || !Array.isArray(company.members) || company.members.length > FANTASY_COMPANIONS.filter(template => template.kind === kind).length
        || company.members.filter(member => record(member) && typeof member.id === 'string' && !fantasyIsWorkerCompanion(member.id) && fantasyCompanionAvailable({ ...character, job: JOBS[kind] }, member.id)).length > fantasyCompanyCapacity(character, kind)
        || company.members.filter(member => record(member) && typeof member.id === 'string' && fantasyIsWorkerCompanion(member.id)).length > fantasyCompanyCapacity(character, 'troop')) return false;
      const ids = new Set<string>();
      for (const member of company.members) {
        if (!record(member) || ![5, 6].includes(Object.keys(member).length) || Object.keys(member).some(key => !['id', 'condition', 'hp', 'assigned', 'missions', 'workerLevel'].includes(key)) || typeof member.id !== 'string' || ids.has(member.id)) return false;
        if (Object.hasOwn(member, 'workerLevel') && (!fantasyIsWorkerCompanion(member.id) || !integer(member.workerLevel, 1, 6))) return false;
        const template = FANTASY_COMPANIONS.find(template => template.id === member.id && template.kind === kind);
        if (!template || !['ready', 'injured', 'absent'].includes(String(member.condition)) || !integer(member.hp, 0, template.hp)
          || typeof member.assigned !== 'boolean' || !integer(member.missions, 0, Number.MAX_SAFE_INTEGER)
          || (member.condition !== 'ready' || member.hp === 0) && member.assigned || member.condition === 'ready' && member.hp === 0) return false;
        ids.add(member.id);
      }
    }
  }
  if (state.spells !== undefined) {
    const capacity = Math.max(fantasySpellCapacity({ ...character, job: 'mage' }), fantasySpellCapacity({ ...character, job: 'priest' }));
    if (!Array.isArray(state.spells) || state.spells.length > capacity || new Set(state.spells.map(spell => spell?.slot)).size !== state.spells.length) return false;
    if (!state.spells.every(spell => record(spell) && Object.keys(spell).every(key => ['slot', 'element', 'form', 'circle'].includes(key)) && integer(spell.slot, 1, capacity)
      && FANTASY_MAGIC_COMBINATIONS.some(combo => combo.element === spell.element && combo.form === spell.form)
      && (spell.circle === undefined ? fantasyMagicKnown(character, String(spell.element), String(spell.form)) : validFantasyCircleShape(spell.circle)
        && spell.circle.runes.length <= Math.max(fantasyCircleNodeCapacity({ ...character, job: 'mage' }), fantasyCircleNodeCapacity({ ...character, job: 'priest' }))
        && fantasyCircleKnowledge(character).cores.includes(spell.circle.core) && spell.circle.runes.every(id => fantasyCircleKnowledge(character).runes.includes(id))))) return false;
  }
  return true;
}
export function fantasySpecializationHours(_profile: FantasyProfile, action: FantasyAction | FantasySpecializationAction): number {
  if (action.type === 'command') return action.operation === 'mission' ? 4 : ['hire', 'recover', 'recontract'].includes(action.operation) ? 2 : 0;
  return action.type === 'magicPrepare' || action.type === 'magicCompose' ? 1 : action.type === 'alchemy' ? 3 : 0;
}
const facilities = (c: FantasyCharacter, kinds: string[]) => fantasyBuildings(c).some(building => kinds.includes(building.id));

export function applyFantasySpecialization(profile: FantasyProfile, action: FantasyAction | FantasySpecializationAction, rng: () => number, context?: FantasySpecializationContext): FantasyResult | undefined {
  if (!['command', 'magicPrepare', 'magicCompose', 'magicCast', 'alchemy'].includes(action.type)) return undefined;
  const fail = (error: string): FantasyResult => ({ profile, error, changed: false });
  if (!profile.character || !context || !validFantasySpecialization(profile.character)) return fail('職業の管理記録を確認できません。');
  const next = structuredClone(profile); const c = next.character!;
  const state = c.specialization ??= {};
  if (action.type === 'command') {
    const workerCommand = action.kind === 'troop' && action.operation !== 'hire' && (action.member ? fantasyIsWorkerCompanion(action.member) : action.operation === 'mission' && fantasyHasWorkerCompany(c));
    if (!Object.hasOwn(JOBS, action.kind) || c.job !== JOBS[action.kind] && !workerCommand) return fail('現在の職業ではその仲間を指揮できません。');
    const company = (state.companies ??= {})[action.kind] ??= { members: [] };
    const member = company.members.find(member => member.id === action.member);
    const template = FANTASY_COMPANIONS.find(template => template.id === action.member && template.kind === action.kind);
    if (action.operation === 'hire' || action.operation === 'recontract') {
      if (action.operation === 'hire' && !!template && fantasyIsWorkerCompanion(template.id)) return fail('その雇用・契約はできません。');
      if (!template || !fantasyCompanionAvailable(c, template.id) || action.operation === 'hire' && member || action.operation === 'recontract' && member?.condition !== 'absent') return fail('その雇用・契約はできません。');
      if (action.operation === 'hire' && company.members.filter(member => fantasyCompanionAvailable(c, member.id)).length >= fantasyCompanyCapacity(c, action.kind)) return fail('現在の熟練度では仲間の定員です。');
      if (!facilities(c, action.kind === 'troop' ? ['guild'] : action.kind === 'summons' ? ['tower', 'library'] : ['market', 'guild'])) return fail('この場所では仲間を募ったり契約したりできません。');
      const cost = action.operation === 'hire' ? template.cost : Math.ceil(template.cost / 2);
      if (c.gold < cost || c.mp < template.mp) return fail('雇用・契約に必要な金貨やMPが足りません。');
      if (template.mp > 0) { const error = fantasyManaSkillError(c, 'specialization'); if (error) return fail(error); }
      c.gold -= cost; c.mp -= template.mp;
      if (template.mp > 0) { const spent = fantasyManaAfterSkill(c, 'specialization', template.mp); c.mana = spent.mana; c.fatigue = spent.fatigue; if (spent.hpDamage) context.hurt(next, spent.hpDamage); }
      if (member) Object.assign(member, { condition: 'ready', hp: template.hp, assigned: false });
      else company.members.push({ id: template.id, condition: 'ready', hp: template.hp, assigned: false, missions: 0 });
      addLog(next, `${template.names.ja}と${action.operation === 'hire' ? '契約した' : '再契約した'}。金貨${cost}枚・MP${template.mp}。`);
    } else if (action.operation === 'assign') {
      if (!member || member.condition !== 'ready' || !member.hp || !member.assigned && !fantasyCompanionAvailable(c, member.id)) return fail('編成できる元気な仲間を選んでください。');
      if (!member.assigned && fantasyActiveCompanions(c).length >= 2) return fail('戦闘に編成できる仲間は合計2人までです。');
      member.assigned = !member.assigned; addLog(next, '仲間の編成を更新した。');
    } else if (action.operation === 'dismiss') {
      if (!member) return fail('その仲間はいません。');
      company.members = company.members.filter(entry => entry !== member); addLog(next, '仲間との契約を終了した。');
    } else if (action.operation === 'recover') {
      if (!member || !template || member.condition !== 'injured') return fail('治療が必要な負傷した仲間を選んでください。');
      if (!facilities(c, ['inn', 'temple']) || (c.inventory.potion ?? 0) < 1) return fail('仲間の治療には宿屋か神殿と回復薬1個が必要です。');
      c.inventory.potion--; member.hp = template.hp; member.condition = 'ready'; member.assigned = false; addLog(next, `${template.names.ja}の負傷を治療した。回復薬1個を使用。`);
    } else if (action.operation === 'mission') {
      const active = company.members.filter(member => member.assigned && member.condition === 'ready' && fantasyCompanionAvailable(c, member.id));
      if (!active.length) return fail('任務に参加する仲間を編成してください。');
      const danger = FANTASY_LOCATIONS.find(place => place.id === c.location)?.danger ?? 0;
      const success = context.check(next, action.kind === 'summons' ? 'intelligence' : 'charisma', 11 + danger, '仲間との現地任務', rng);
      if (success) { const reward = 6 + active.length * 2; c.gold += reward; addLog(next, `仲間との現地任務を終え、金貨${reward}枚を得た。`); }
      else addLog(next, '現地任務は中止となった。仲間の状態を確認してください。', false);
      settleFantasyCompanions(next, success, rng);
    } else return fail('その仲間への指示は登録されていません。');
  } else if (action.type === 'magicPrepare') {
    const combo = FANTASY_MAGIC_COMBINATIONS.find(combo => combo.element === action.element && combo.form === action.form);
    if (!combo || !fantasyCanPrepareMagic(c, action.element, action.form, action.slot)) return fail('現在の職業・保存枠ではその魔法を合成できません。');
    initializeFantasyMagicKnowledge(c);
    state.spells = [...(state.spells ?? []).filter(spell => spell.slot !== action.slot), { slot: action.slot, element: combo.element, form: combo.form }].sort((a, b) => a.slot - b.slot);
    addLog(next, `${combo.names.ja}を第${action.slot}枠へ保存した。`);
  } else if (action.type === 'magicCompose') {
    const compiled = fantasyCompileCircle(c, action.core, action.runes);
    if (!compiled || !integer(action.slot, 1, fantasySpellCapacity(c))) return fail('現在の職業・保存枠ではその魔法を合成できません。');
    grantFantasyCircleBasics(c);
    c.circleKnowledge = fantasyCircleKnowledge(c);
    // 旧形式のキーは保存互換のため残し、効果には使用しない。
    const element: FantasyPreparedSpell['element'] = ['flame', 'tide', 'gale', 'stone'].includes(compiled.core) ? compiled.core as FantasyPreparedSpell['element'] : 'light';
    const form: FantasyPreparedSpell['form'] = ['heal', 'miracle'].includes(compiled.kind) ? 'mend' : ['guard', 'blessing', 'cleanse'].includes(compiled.kind) && element !== 'light' ? 'veil' : 'bolt';
    state.spells = [...(state.spells ?? []).filter(spell => spell.slot !== action.slot), { slot: action.slot, element, form, circle: { core: compiled.core, runes: compiled.runes } }].sort((a, b) => a.slot - b.slot);
    addLog(next, `${compiled.names.ja}を第${action.slot}枠へ保存した。`);
  } else if (action.type === 'magicCast') {
    const spell = state.spells?.find(spell => spell.slot === action.slot);
    if (spell?.circle) {
      const compiled = fantasyCompileCircle(c, spell.circle.core, spell.circle.runes);
      if (!compiled || !integer(action.slot, 1, fantasySpellCapacity(c)) || c.mp < compiled.mp) return fail('使える合成魔法、または必要なMPがありません。');
      if (compiled.kind === 'attack' || compiled.kind === 'miracle') return fail('この魔法には戦闘中の対象が必要です。');
      const error = fantasyManaSkillError(c, 'specialization'); if (error) return fail(error);
      const harmful = (c.effects ?? []).filter(effect => effect.expiresAt > c.hour && ((effect.periodicHp ?? 0) < 0 || (effect.check ?? 0) < 0 || (effect.dicePenalty ?? 0) > 0 || effect.diceFaces !== undefined || Object.values(effect.stats ?? {}).some(value => value < 0)));
      const canHeal = compiled.kind === 'heal' && c.hp < context.stats.hp;
      const canGuard = (['guard', 'blessing'].includes(compiled.kind) || !!compiled.effects.guard) && !c.buff;
      const canCleanse = !!compiled.effects.cleanse && harmful.length > 0;
      if (!canHeal && !canGuard && !canCleanse) return fail('回復や一時強化を適用する余地がありません。');
      c.mp -= compiled.mp;
      if (compiled.kind === 'heal') c.hp = Math.min(context.stats.hp, c.hp + compiled.power);
      if ((compiled.kind === 'guard' || compiled.kind === 'blessing') && !c.buff) c.buff = { effect: 'guard', power: compiled.power, mp: compiled.mp };
      if (compiled.effects.cleanse) c.effects = (c.effects ?? []).filter(effect => !harmful.includes(effect));
      if (compiled.effects.guard && !c.buff) c.buff = { effect: 'guard', power: compiled.effects.guard, mp: compiled.mp };
      const spent = fantasyManaAfterSkill(c, 'specialization', compiled.mp); c.mana = spent.mana; c.fatigue = spent.fatigue;
      if (spent.hpDamage) context.hurt(next, spent.hpDamage);
      addLog(next, `${compiled.names.ja}を使った。MP${compiled.mp}を消費。`);
      return { profile: next, changed: true };
    }
    const combo = spell && FANTASY_MAGIC_COMBINATIONS.find(combo => combo.element === spell.element && combo.form === spell.form);
    if (!combo || !spell || !fantasyCanPrepareMagic(c, spell.element, spell.form, action.slot) || c.mp < combo.mp) return fail('使える合成魔法、または必要なMPがありません。');
    const error = fantasyManaSkillError(c, 'specialization'); if (error) return fail(error);
    if (combo.effect === 'heal' ? c.hp >= context.stats.hp : !!c.buff) return fail('回復や一時強化を適用する余地がありません。');
    c.mp -= combo.mp;
    if (combo.effect === 'heal') c.hp = Math.min(context.stats.hp, c.hp + combo.power);
    else c.buff = { effect: combo.effect, power: combo.power, mp: combo.mp, ...(combo.stat ? { stat: combo.stat } : {}) };
    const spent = fantasyManaAfterSkill(c, 'specialization', combo.mp); c.mana = spent.mana; c.fatigue = spent.fatigue;
    if (spent.hpDamage) context.hurt(next, spent.hpDamage);
    addLog(next, `${combo.names.ja}を使った。MP${combo.mp}を消費。`);
  } else if (action.type === 'alchemy') {
    const formula = FANTASY_ALCHEMY_FORMULAS.find(formula => formula.id === action.formula);
    if (!fantasyHasJob(c,'alchemist') || !facilities(c, ['tower']) || !formula) return fail('この職業・場所ではその錬金調合ができません。');
    const inputs = Object.entries(formula.inputs) as [string, number][];
    if (inputs.some(([id, count]) => !FANTASY_ITEMS.some(item => item.id === id) || (c.inventory[id] ?? 0) < count)) return fail('錬金調合の材料が足りません。');
    const label = fantasyAlchemyFormulaKnown(c, formula.id) ? formula.names.ja : fantasyAlchemyUnidentifiedFormulaName(formula.id, 'ja');
    const success = context.check(next, 'intelligence', formula.dc, label, rng);
    if (success) {
      for (const [id, count] of inputs) c.inventory[id] -= count;
      const material = Math.floor(inputs.reduce((sum, [id, count]) => sum + (FANTASY_ITEMS.find(item => item.id === id)?.tier ?? 1) * count, 0) / inputs.reduce((sum, [, count]) => sum + count, 0));
      const xp = c.jobXp.alchemist ?? 0; const mastery = xp >= 600 ? 2 : xp >= 100 ? 1 : 0;
      const variation = random(rng); const tier = Math.max(1, Math.min(4, material + mastery + (variation > .95 ? 1 : variation < .05 ? -1 : 0)));
      const output = formula.family ? `${formula.family}-${tier}` : formula.output;
      if (!FANTASY_ITEMS.some(item => item.id === output)) return fail('調合結果の品物を確認できません。');
      context.addItem(next, output, 1); learnFantasyAlchemyFormula(c, formula.id); addLog(next, `${formula.names.ja}：${FANTASY_ITEMS.find(item => item.id === output)!.name}を1個調合した。`);
    } else { c.inventory[inputs[0][0]]--; addLog(next, `${label}は安定せず中止した。最初の材料を1個失った。`, false); }
  }
  return { profile: next, changed: true };
}
