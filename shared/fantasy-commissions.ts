import type { FantasyCharacter, FantasyProfile, FantasyRecipe, FantasyResult } from './fantasy.ts';
import type { FantasyEmployee, FantasyWorkerProgress } from './fantasy-business.ts';
import { FANTASY_ARTISANS } from './fantasy-artisan-catalog.ts';
import { FANTASY_ITEMS, FANTASY_RECIPES } from './fantasy-data.ts';
import { FANTASY_BUSINESS_JOBS, FANTASY_BUSINESS_WORKERS } from './fantasy-worker-catalog.ts';
import { fantasyBuildings, fantasyCraftFacility } from './fantasy-town.ts';
import { fantasyFacilityOpen } from './fantasy-facility-hours.ts';
import { createFantasyGear, fantasyCraftInputs, fantasySpendItem } from './fantasy-equipment.ts';
import { fantasyHasSpoiledIngredients, reconcileFoodLots } from './fantasy-life.ts';
import { fantasyBagState } from './fantasy-bags.ts';
import { fantasyWorkerCompanionId } from './fantasy-worker-companions.ts';
import type { NpcLocale } from './npc.ts';

export interface FantasyCommissionRequest { recipe: string; npcId?: string; workerId?: string; material?: string; gem?: string }
/** 所有権は操作要求ではなく、サーバーの資産台帳だけから受け取る。 */
export interface FantasyCommissionContext { actor?: string; generation?: number; employees?: Record<string, FantasyEmployee>; workerProgress?: FantasyWorkerProgress; startedAt?: number }
export interface FantasyCommissionQuote {
  error?: string; fee: number; hours: number; job: string; recipe: string; providerId: string; provider: 'npc' | 'worker';
  inputs: Record<string, number>; output: string; count: number; material?: string; gem?: string;
}
export type FantasyCommissionResult = FantasyResult & { employees?: Record<string, FantasyEmployee>; workerProgress?: FantasyWorkerProgress };

const commissionMessages: [string, string, string][] = [
  ['この製法は加工依頼に対応していません。', '이 제작법은 가공 의뢰에 사용할 수 없습니다.', 'This recipe is unavailable for commissioned processing.'],
  ['対応する現在地の職人か、未配置の雇用済み作業員を選んでください。', '현재 지역의 해당 장인이나 고용한 미배치 일꾼을 선택하세요.', 'Choose a suitable local artisan or an idle worker you employ.'],
  ['加工の完了まで有効な雇用契約が必要です。', '가공 완료 시점까지 유효한 고용 계약이 필요합니다.', 'The employment contract must remain valid through completion.'],
  ['加工に必要な設備が現在地にありません。', '현재 지역에 가공에 필요한 시설이 없습니다.', 'This location lacks the required processing facility.'],
  ['加工設備は営業時間外です。', '가공 시설의 영업시간이 아닙니다.', 'The processing facility is closed.'],
  ['加工依頼の開始時刻が正しくありません。', '가공 의뢰 시작 시간이 올바르지 않습니다.', 'The processing start time is invalid.'],
  ['今は加工を依頼できません。', '지금은 가공을 의뢰할 수 없습니다.', 'You cannot commission processing now.'],
  ['加工料金を支払う金貨が足りません。', '가공 비용을 지불할 금화가 부족합니다.', 'You do not have enough gold for the processing fee.'],
  ['傷んだ食材は加工に使えません。', '상한 식재료는 가공에 사용할 수 없습니다.', 'Spoiled ingredients cannot be processed.'],
  ['加工に使える未装着の材料が足りません。', '가공에 사용할 미착용 재료가 부족합니다.', 'You lack enough unequipped materials for processing.'],
  ['加工品の所持上限に達しています。', '가공품의 소지 한도에 도달했습니다.', 'You have reached the inventory limit for this product.'],
  ['装備の保管上限に達しています。', '장비 보관 한도에 도달했습니다.', 'You have reached the equipment storage limit.'],
  ['委託品を受け取る鞄の空きが足りません。', '의뢰품을 받을 가방 공간이 부족합니다.', 'Your bag has insufficient room for the commissioned goods.'],
  ['この作業員を雇用していません。', '이 일꾼을 고용하지 않았습니다.', 'You do not employ this worker.'],
  ['素材や宝石の追加指定は装備の制作で使います。', '소재와 보석 추가 지정은 장비 제작에만 사용합니다.', 'Material and gemstone options apply only to equipment.'],
  ['この製法では指定した素材に置き換えられません。', '이 제작법에는 지정한 소재로 대체할 수 없습니다.', 'This recipe cannot use the selected material substitution.'],
  ['装備に使える登録済みの宝石を選んでください。', '장비에 사용할 수 있는 보석을 선택하세요.', 'Choose a registered gemstone suitable for equipment.'],
  ['材料が足りません。', '재료가 부족합니다.', 'You do not have enough materials.'],
];
export function fantasyCommissionText(text: string, locale: NpcLocale): string | undefined {
  const message = commissionMessages.find(([ja]) => ja === text);
  if (message) return message[locale === 'ja' ? 0 : locale === 'ko' ? 1 : 2];
  const match = /^commission:([^:]+):([^:]+):([^:]+):(\d+):(\d+)$/.exec(text);
  if (!match) return;
  const provider = FANTASY_ARTISANS.find(npc => npc.id === match[1]) ?? FANTASY_BUSINESS_WORKERS.find(worker => worker.id === match[1]);
  const item = FANTASY_ITEMS.find(item => item.id === match[3]);
  const name = provider?.names[locale] ?? match[1], product = item?.names?.[locale] ?? item?.name ?? match[3];
  return { ko: `${name}: ${product} ${match[4]}개 가공 완료. 비용 ${match[5]}금화.`, en: `${name} completed ${match[4]} × ${product}. Fee: ${match[5]} gold.`, ja: `${name}が${product}を${match[4]}個加工した。料金は金貨${match[5]}枚。` }[locale];
}

/** 発見済みの地図・ルーン・原典を委託で複製させない。 */
export function fantasyCommissionRecipeAllowed(recipe: FantasyRecipe): boolean {
  const output = FANTASY_ITEMS.find(item => item.id === recipe.output);
  return FANTASY_BUSINESS_JOBS.includes(recipe.job as typeof FANTASY_BUSINESS_JOBS[number]) && !!output
    && !recipe.requiresBook && !recipe.requiresLocations
    && !['map', 'interior-map', 'rune-record', 'spell-record', 'artifact', 'relic', 'black-market-relic', 'black-market-study'].includes(output.category ?? '')
    && !/map|chart|rune-record|spell-record|unidentified|occult-relic/.test(output.id)
    && Object.entries(recipe.inputs).every(([id, count]) => FANTASY_ITEMS.some(item => item.id === id) && Number.isSafeInteger(count) && count > 0);
}

type Provider = { id: string; job: string; xp: number; race: string; fee?: number; building: string; worker?: FantasyEmployee };
function providerFor(c: FantasyCharacter, request: FantasyCommissionRequest, context: FantasyCommissionContext): Provider | undefined {
  if (!!request.npcId === !!request.workerId) return;
  if (request.npcId) {
    const npc = FANTASY_ARTISANS.find(npc => npc.id === request.npcId && npc.location === c.location);
    if (npc) return { id: npc.id, job: npc.job, xp: npc.xp, race: npc.race ?? 'human', building: npc.building };
    return;
  }
  const worker = context.employees?.[request.workerId!], entry = FANTASY_BUSINESS_WORKERS.find(n => n.id === request.workerId);
  const startedAt = context.startedAt ?? c.hour;
  if (!worker || !entry || !context.actor || worker.npc !== entry.id || worker.user !== context.actor || worker.generation !== context.generation
    || worker.estate || worker.company || worker.plot || worker.expiresAt <= startedAt || worker.hiredAt > startedAt) return;
  const member = c.specialization?.companies?.troop?.members.find(member => member.id === fantasyWorkerCompanionId(worker.npc));
  if (member && (member.assigned || member.condition !== 'ready' || member.hp <= 0)) return;
  const recipe = FANTASY_RECIPES.find(recipe => recipe.id === request.recipe), building = recipe && fantasyCraftFacility(recipe.job);
  if (!recipe || !building) return;
  return { id: worker.npc, job: recipe.job, xp: worker.skills[recipe.job] ?? 0, race: entry.race, building, fee: entry.wage, worker };
}
function artisanCharacter(c: FantasyCharacter, provider: Provider): FantasyCharacter {
  return { ...structuredClone(c), job: provider.job, lifeJob: provider.job, race: provider.race, jobXp: { [provider.job]: provider.xp },
    skillXp: {}, learnedSkills: [], unlockedSkills: [], readBooks: [], practice: {}, buff: null };
}
function bagError(before: FantasyCharacter, after: FantasyCharacter): string | undefined {
  const a = fantasyBagState(before), b = fantasyBagState(after);
  if (Math.max(0, b.weight - b.weightLimit) > Math.max(0, a.weight - a.weightLimit) || Math.max(0, b.slots - b.slotLimit) > Math.max(0, a.slots - a.slotLimit)) return '委託品を受け取る鞄の空きが足りません。';
}
export function quoteFantasyCommission(c: FantasyCharacter, request: FantasyCommissionRequest, context: FantasyCommissionContext = {}): FantasyCommissionQuote {
  const recipe = FANTASY_RECIPES.find(recipe => recipe.id === request.recipe), provider = providerFor(c, request, context);
  const quote: FantasyCommissionQuote = { fee: 0, hours: 3, recipe: request.recipe, job: recipe?.job ?? '', providerId: request.npcId ?? request.workerId ?? '', provider: request.workerId ? 'worker' : 'npc', inputs: {}, output: recipe?.output ?? '', count: 0 };
  const fail = (error: string) => ({ ...quote, error });
  if (!recipe || !fantasyCommissionRecipeAllowed(recipe)) return fail('この製法は加工依頼に対応していません。');
  if (!provider || provider.job !== recipe.job) return fail('対応する現在地の職人か、未配置の雇用済み作業員を選んでください。');
  if (provider.worker && provider.worker.expiresAt <= (context.startedAt ?? c.hour) + quote.hours) return fail('加工の完了まで有効な雇用契約が必要です。');
  if (!fantasyBuildings(c).some(building => building.id === provider.building)) return fail('加工に必要な設備が現在地にありません。');
  const startedAt = context.startedAt ?? c.hour;
  if (!Number.isFinite(startedAt) || startedAt < 0 || startedAt > c.hour) return fail('加工依頼の開始時刻が正しくありません。');
  if (!fantasyFacilityOpen(provider.building, startedAt)) return fail('加工設備は営業時間外です。');
  const crafter = artisanCharacter(c, provider), supplies = fantasyCraftInputs(crafter, recipe, request.material, request.gem);
  quote.inputs = supplies.inputs; quote.count = supplies.count; quote.material = supplies.material; quote.gem = request.gem;
  quote.fee = provider.fee ?? Math.max(5, Math.ceil(recipe.dc / 2) + Math.ceil((FANTASY_ITEMS.find(item => item.id === recipe.output)?.price ?? 1) * supplies.count * .2));
  if (supplies.error) return fail(supplies.error);
  if (c.hp <= 0 || c.downed || c.travelPosition) return fail('今は加工を依頼できません。');
  if (c.gold < quote.fee) return fail('加工料金を支払う金貨が足りません。');
  if (fantasyHasSpoiledIngredients(crafter, supplies.inputs)) return fail('傷んだ食材は加工に使えません。');
  for (const [id, count] of Object.entries(supplies.inputs)) if (!fantasySpendItem(crafter, id, count)) return fail('加工に使える未装着の材料が足りません。');
  crafter.inventory[recipe.output] = (crafter.inventory[recipe.output] ?? 0) + supplies.count;
  if (crafter.inventory[recipe.output] > 1_000_000) return fail('加工品の所持上限に達しています。');
  if (FANTASY_ITEMS.find(item => item.id === recipe.output)?.equipment && (c.gear?.length ?? 0) + supplies.count > 1000) return fail('装備の保管上限に達しています。');
  const bag = bagError(c, crafter); if (bag) return fail(bag);
  return quote;
}

/** 経過時間と完了済み判定は予約処理に任せ、ここで重複精算しない。 */
export function applyFantasyCommission(profile: FantasyProfile, request: FantasyCommissionRequest, rng: () => number, context: FantasyCommissionContext = {}): FantasyCommissionResult {
  const fail = (error: string): FantasyCommissionResult => ({ profile, changed: false, error });
  const original = profile.character;
  if (!original || profile.death || profile.activity || profile.combatId || profile.event) return fail('今は加工を依頼できません。');
  if (request.workerId && context.generation !== (profile.generation ?? 1)) return fail('この作業員を雇用していません。');
  const quote = quoteFantasyCommission(original, request, context); if (quote.error) return fail(quote.error);
  const provider = providerFor(original, request, context)!, next = structuredClone(profile), c = next.character!;
  reconcileFoodLots(c);
  for (const [id, count] of Object.entries(quote.inputs)) if (!fantasySpendItem(c, id, count)) return fail('加工に使える未装着の材料が足りません。');
  reconcileFoodLots(c);
  c.gold -= quote.fee; c.inventory[quote.output] = (c.inventory[quote.output] ?? 0) + quote.count;
  if (FANTASY_ITEMS.find(item => item.id === quote.output)?.equipment) {
    const crafter = artisanCharacter(c, provider);
    for (let i = 0; i < quote.count; i++) { const gear = createFantasyGear(crafter, quote.output, rng, quote.material, quote.gem); if (gear) (c.gear ??= []).push(gear); }
  }
  reconcileFoodLots(c);
  next.revision++;
  next.log = [...next.log, { id: (next.log.at(-1)?.id ?? 0) + 1, hour: c.hour, kind: 'success' as const, text: `commission:${provider.id}:${quote.recipe}:${quote.output}:${quote.count}:${quote.fee}` }].slice(-100);
  if (!provider.worker) return { profile: next, changed: true };
  const employees = structuredClone(context.employees!), worker = employees[provider.id];
  const learning = FANTASY_BUSINESS_WORKERS.find(entry => entry.id === worker.npc)!.learning;
  worker.skills[quote.job] = Math.min(1_000_000, (worker.skills[quote.job] ?? 0) + learning); worker.lastAt = c.hour;
  const workerProgress = { ...context.workerProgress, [worker.npc]: { ...worker.skills } };
  return { profile: next, changed: true, employees, workerProgress };
}
