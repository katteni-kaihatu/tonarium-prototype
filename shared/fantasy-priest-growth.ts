import { fantasyPriestFaithRank, FANTASY_PRIEST_SERVICE_FAITH, FANTASY_PRIEST_VOW_FAITH } from './fantasy-priest-ranks.ts';
import { FANTASY_MIRACLES, FANTASY_LAST_DAWN_SKILL, FANTASY_PRIEST_HOLY_ATTACKS } from './fantasy-miracle-catalog.ts';
import type { FantasyAction, FantasyCharacter, FantasySkill } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_QUESTS } from './fantasy-data.ts';
import { fantasyBuildings } from './fantasy-town.ts';
import { fantasyJobPathDiscovered } from './fantasy-job-discovery.ts';

export type FantasyPriestBranch = 'care' | 'ward' | 'oath' | 'pilgrim' | 'inquisitor' | 'paladin' | 'saint';
export interface FantasyPriestGrowth {
  version: 1;
  startedAt: number;
  service: string[];
  doctrine: string[];
  pilgrimage: string[];
  prayerDays: number[];
  prayerTemples: Record<string, string>;
  support?: { battle: string; day: number; points: 1 | 2; hour: number }[];
  vows: { quest: string; acceptedAt: number; hour: number; location: string; outcome: 'fulfilled' | 'released' }[];
  vow?: { quest: string; acceptedAt: number };
  branch?: FantasyPriestBranch;
  branchChanges: number;
  changedAt?: number;
}
const l = (ko: string, en: string, ja: string) => ({ ko, en, ja });
const skill = (id: string, names: ReturnType<typeof l>, descriptions: ReturnType<typeof l>, kind: FantasySkill['kind'], effect: FantasySkill['effect'], power: number, mp = 0, stat?: FantasySkill['stat']): FantasySkill => ({ id, names, name: names.ja, descriptions, description: descriptions.ja, kind, effect, power, mp, ...(stat ? { stat } : {}) });
export const FANTASY_PRIEST_BRANCHES = [
  { id: 'care', names: l('돌봄의 길', 'Path of Care', '慈しみの道'), descriptions: l('상처 입은 이를 돌보고 회복의 은총을 깊게 익힌다.', 'Tend the wounded and deepen restoring grace.', '傷ついた人をいたわり、癒やしの恩恵を深める。') },
  { id: 'ward', names: l('수호의 길', 'Path of Shelter', '守護の道'), descriptions: l('위험 앞에서 성스러운 방호를 펼친다.', 'Raise sacred protection in the face of danger.', '危険の前で聖なる守りを広げる。') },
  { id: 'oath', names: l('서약의 길', 'Path of Oaths', '誓いの道'), descriptions: l('약속과 기록을 대조하며 침착한 판단을 익힌다.', 'Learn sound judgment through promises and records.', '約束と記録を照合し、落ち着いた判断を学ぶ。') },
  { id: 'pilgrim', names: l('순례의 길', 'Path of Pilgrimage', '巡礼の道'), descriptions: l('먼 성소를 잇는 길과 안전한 여정을 배운다.', 'Learn the roads between sanctuaries and safe passage.', '遠い聖所を結ぶ道と安全な旅を学ぶ。') },
  { id: 'inquisitor', names: l('이단심문관', 'Inquisitor', '異端審問官'), descriptions: l('판단을 단련하고 자신의 몸에 축복을 새긴다.', 'Temper your judgment and inscribe blessings upon yourself.', '判断を鍛え、自らの身に祝福を刻む。') },
  { id: 'paladin', names: l('성기사', 'Paladin', '聖騎士'), descriptions: l('봉사로 다진 신앙을 자신의 방호로 삼는다.', 'Turn faith tempered through service into your own protection.', '奉仕で鍛えた信仰を、自らの守りにする。') },
  { id: 'saint', names: l('성자', 'Saint', '聖者'), descriptions: l('오랜 봉사 끝에 깊은 은총과 기적의 문양을 탐구한다.', 'After long service, seek profound grace and the inscription of miracles.', '長い奉仕の末、深い恩恵と奇跡の文様を探る。') },
] as const;
export const FANTASY_PRIEST_PATH_SKILLS: FantasySkill[] = [
  skill('priest-care-hands', l('온기 어린 손길', 'Gentle Hands', '温かな手'), l('돌봄으로 몸을 지켜 위험 피해를 1 줄인다.', 'Careful self-care reduces danger damage by 1.', '丁寧な手当てで危険による被害を1軽減する。'), 'passive', 'guard', 1),
  skill('priest-care-mercy', l('자비의 은총', 'Merciful Grace', '慈愛の恩恵'), l('HP를 40 회복한다. 전투에서는 동료에게도 쓸 수 있다.', 'Restore 40 HP; in battle this can also aid an ally.', 'HPを40回復する。戦闘では仲間にも使える。'), 'active', 'heal', 40, 12),
  skill('priest-ward-vigil', l('성소의 파수', 'Sanctuary Vigil', '聖所の見守り'), l('성스러운 경계로 위험 피해를 3 줄인다.', 'Sacred vigilance reduces danger damage by 3.', '聖なる警戒で危険による被害を3軽減する。'), 'passive', 'guard', 3),
  skill('priest-ward-aegis', l('서광의 방벽', 'Dawn Aegis', '曙光の障壁'), l('다음 위험에 방호 8을 준비한다. 전투에서는 동료를 지킬 수 있다.', 'Prepare protection 8 for the next danger; in battle protect an ally.', '次の危険に防護8を備える。戦闘では仲間を守れる。'), 'active', 'guard', 8, 10),
  skill('priest-oath-witness', l('약속의 증인', 'Witness to Promises', '約束の証人'), l('기록을 살피는 지능 판정에 2를 더한다.', 'Add 2 to intelligence checks when weighing records.', '記録を見極める知力判定に2を加える。'), 'passive', 'check', 2, 0, 'intelligence'),
  skill('priest-oath-clarity', l('맹세의 명료함', 'Clarity of Oaths', '誓いの明晰さ'), l('다음 지능 판정에 5를 더한다. 전투에서는 동료의 다음 공격 명중을 10%p 높인다. 최대 2라운드, 중첩되지 않는다.', 'Add 5 to the next intelligence check. In battle, grant an ally +10 percentage points on their next attack within two rounds; does not stack.', '次の知力判定に5を加える。戦闘では仲間の次の攻撃命中を10ポイント高める。最大2ラウンド、重複しない。'), 'active', 'check', 5, 8, 'intelligence'),
  skill('priest-pilgrim-road', l('순례자의 걸음', 'Pilgrim’s Pace', '巡礼者の歩み'), l('일반 여행 시간을 조금 줄인다. 전이문 시간은 줄이지 않는다.', 'Slightly shorten ordinary journeys; gateways are unchanged.', '通常の旅を少し短縮する。転移門の時間は変わらない。'), 'passive', 'travel', .25),
  skill('priest-pilgrim-lantern', l('길을 지키는 기도', 'Roadkeeper’s Prayer', '道を守る祈り'), l('다음 위험에 방호 5를 준비한다. 등불을 대신하지는 않는다.', 'Prepare protection 5 for the next danger; it does not replace a lantern.', '次の危険に防護5を備える。灯りの代わりにはならない。'), 'active', 'guard', 5, 6),
  skill('priest-inquisitor-discernment', l('진실을 향한 눈', 'Discerning Eye', '真実を見据える目'), l('지능 판정에 2를 더한다.', 'Add 2 to intelligence checks.', '知力判定に2を加える。'), 'passive', 'check', 2, 0, 'intelligence'),
  skill('priest-inquisitor-brand', l('내면의 성인', 'Inner Seal', '内なる聖印'), l('자신에게만 명료함을 내려 다음 지능 판정에 6을 더한다.', 'Bless only yourself with clarity, adding 6 to your next intelligence check.', '自分だけに明晰さを授け、次の知力判定に6を加える。'), 'active', 'check', 6, 10, 'intelligence'),
  skill('priest-paladin-steadfast', l('굳건한 신앙', 'Steadfast Faith', '揺るがぬ信仰'), l('위험 피해를 3 줄인다.', 'Reduce danger damage by 3.', '危険による被害を3軽減する。'), 'passive', 'guard', 3),
  skill('priest-paladin-vigil', l('몸에 깃든 축복', 'Embodied Benediction', '身に宿す祝福'), l('자신에게만 다음 위험에 대한 방호 12를 준비한다.', 'Prepare ward 12 against the next danger for yourself alone.', '自分だけに、次の危険への防護12を備える。'), 'active', 'guard', 12, 14),
  skill('priest-saint-compassion', l('깊은 자비', 'Profound Compassion', '深い慈悲'), l('위험 피해를 4 줄인다.', 'Reduce danger damage by 4.', '危険による被害を4軽減する。'), 'passive', 'guard', 4),
  skill('priest-saint-mercy', l('성자의 손길', 'Saint’s Mercy', '聖者の手'), l('HP를 60 회복한다. 쓰러진 사람을 깨우려면 별도의 기적 문양이 필요하다.', 'Restore 60 HP. Awakening a fallen companion requires a separate miracle inscription.', 'HPを60回復する。倒れた仲間を起こすには、別に奇跡の文様が要る。'), 'active', 'heal', 60, 22),
];
for (const entry of FANTASY_PRIEST_HOLY_ATTACKS) FANTASY_PRIEST_PATH_SKILLS.push(skill(entry.skill.id,entry.skill.names,l('해당 성소의 길에서 익힌 신성 공격 주문.','A sacred attack learned along this sanctuary path.','この聖所の道で学んだ神聖な攻撃術。'),'active','check',5,entry.skill.mp,'intelligence'));
for (const entry of [...FANTASY_MIRACLES.map(m=>m.skill),FANTASY_LAST_DAWN_SKILL]) FANTASY_PRIEST_PATH_SKILLS.push(skill(entry.id,entry.names,l('기도로 깨달은 기적. 신전에서 준비한 기적만 펼칠 수 있다.','A miracle understood through prayer; prepare it at a temple before use.','祈りで悟った奇跡。神殿で準備したものだけ使える。'),'active','guard',1,entry.mp,'intelligence'));
export const FANTASY_PRIEST_DOCTRINE_BOOKS = ['remedies-and-rites','words-and-promises','traveler-guide','temple-vigil-liturgy','temple-pilgrimage-testimonies','temple-oath-commentary'] as const;
export const FANTASY_PRIEST_COMBAT_SERVICE_LIMIT = 30;
export const FANTASY_PRIEST_COMBAT_FAITH_LIMIT = 40;
export const FANTASY_PRIEST_COMBAT_DAILY_LIMIT = 4;
export const FANTASY_PRIEST_BRANCH_CHANGE_COST = 120;
export const FANTASY_PRIEST_BRANCH_COOLDOWN = 24;
export function fantasyPriestDiscoveredBranches(c: FantasyCharacter) {
  return FANTASY_PRIEST_BRANCHES.filter(branch => fantasyJobPathDiscovered(c, `priest-${branch.id}`));
}
export function fantasyPriestCombatSkill(id: string, power?: number): { kind: 'heal' | 'guard' | 'focus'; power: number; mp: number; range: 'magic'; selfOnly?: boolean } | undefined {
  const skill = FANTASY_PRIEST_PATH_SKILLS.find(skill => skill.id === id && skill.kind === 'active');
  if (!skill) return;
  const actual = Number.isFinite(power) ? Math.max(0, power!) : skill.power;
  const kind = id === 'priest-care-mercy' || id === 'priest-saint-mercy' ? 'heal' : id === 'priest-oath-clarity' || id === 'priest-inquisitor-brand' ? 'focus' : 'guard';
  return { kind, power: Math.round(kind === 'focus' ? Math.min(15, Math.max(10, 10 + (actual - 5) * 2)) : Math.min(100, actual * 2)), mp: skill.mp, range: 'magic', ...(['priest-inquisitor-brand', 'priest-paladin-vigil'].includes(id) ? { selfOnly: true } : {}) };
}

function temple(location: string) { return fantasyBuildings({ location } as FantasyCharacter).some(building => building.id === 'temple'); }
export function fantasyPriestServiceQuest(id: string): boolean {
  const q = FANTASY_QUESTS.find(quest => quest.id === id);
  return !!q && !q.jobs?.some(job => FANTASY_JOBS.find(entry => entry.id === job)?.category === 'crime') && (q.jobs?.includes('priest') === true || q.building === 'temple' || ['herb', 'meal', 'potion', 'antidote', 'jerky', 'bread'].includes(q.item));
}
function state(c: FantasyCharacter): FantasyPriestGrowth {
  return c.priestGrowth ??= { version: 1, startedAt: c.hour, service: [], doctrine: [], pilgrimage: [], prayerDays: [], prayerTemples: {}, vows: [], branchChanges: 0 };
}
export function syncFantasyPriestGrowth(c: FantasyCharacter): void {
  if (c.job !== 'priest') return;
  const p = state(c);
  p.service = [...new Set([...p.service, ...c.completed.filter(fantasyPriestServiceQuest)])];
  p.doctrine = [...new Set([...p.doctrine, ...(c.readBooks ?? []).filter(id => FANTASY_PRIEST_DOCTRINE_BOOKS.includes(id as typeof FANTASY_PRIEST_DOCTRINE_BOOKS[number]))])];
  p.pilgrimage = [...new Set([...p.pilgrimage, ...c.visited.filter(temple)])];
  if (p.vow && (c.completed.includes(p.vow.quest) || !c.quests.includes(p.vow.quest))) {
    p.vows.push({ ...p.vow, hour: c.hour, location: c.location, outcome: c.completed.includes(p.vow.quest) ? 'fulfilled' : 'released' });
    delete p.vow;
  }
}
export function recordFantasyPriestPrayer(c: FantasyCharacter, day: number): void {
  if (c.job !== 'priest') return;
  syncFantasyPriestGrowth(c);
  const p = state(c);
  if (!p.prayerDays.includes(day) && p.prayerDays.length < 30) { p.prayerDays.push(day); p.prayerTemples[String(day)] = c.location; }
}
function combatServiceFaith(p: FantasyPriestGrowth | undefined): number {
  return Math.min(FANTASY_PRIEST_COMBAT_FAITH_LIMIT, (p?.support ?? []).reduce((sum, entry) => sum + entry.points, 0));
}
export function fantasyPriestGrowthStatus(c: FantasyCharacter) {
  const copy = structuredClone(c); syncFantasyPriestGrowth(copy);
  const p = copy.priestGrowth;
  const service = p?.service.length ?? 0, doctrine = p?.doctrine.length ?? 0, pilgrimage = p?.pilgrimage.length ?? 0;
  const vows = p?.vows.filter(vow => vow.outcome === 'fulfilled').length ?? 0, prayers = p?.prayerDays.length ?? 0;
  const faith = service * FANTASY_PRIEST_SERVICE_FAITH + doctrine * 3 + pilgrimage * 2 + vows * FANTASY_PRIEST_VOW_FAITH + Math.min(10, prayers) + combatServiceFaith(p);
  const trust = Math.min(100, service * 5 + vows * 8 + doctrine * 2 + Math.min(5, prayers));
  const templeTrust = Object.fromEntries((p?.pilgrimage ?? []).map(place => [place, Math.min(100, doctrine * 2
    + (p?.service.filter(id => { const q = FANTASY_QUESTS.find(q => q.id === id); return (q?.reportAt ?? q?.giver) === place; }).length ?? 0) * 5
    + (p?.vows.filter(vow => vow.outcome === 'fulfilled' && vow.location === place).length ?? 0) * 8
    + Math.min(5, Object.values(p?.prayerTemples ?? {}).filter(id => id === place).length))]));
  const clergy = fantasyPriestFaithRank(faith);
  // 称号の難度変更で、既存技能や専門分野の成長を下げない。
  const rank = [0,20,45,80,130].reduce((current, threshold, index) => faith >= threshold ? index : current, 0);
  const practice = Object.entries(c.skillXp ?? {}).filter(([id]) => id.startsWith('job-priest-') || id.startsWith('priest-')).reduce((sum, [, value]) => sum + value, 0);
  const advancedEligible = c.job === 'priest' && (c.jobXp.priest ?? 0) >= 150 && faith >= 65 && service >= 6 && pilgrimage >= 3 && vows >= 2 && practice >= 24;
  const saintEligible = advancedEligible && (c.jobXp.priest ?? 0) >= 300 && faith >= 130 && service >= 12 && doctrine >= 3 && pilgrimage >= 3 && vows >= 6 && prayers >= 10 && practice >= 100;
  return { faith, supportFaith: combatServiceFaith(p), supportBattles: p?.support?.length ?? 0, rank, clergyGrade: clergy.grade, clergyAdventurerGrade: clergy.adventurerGrade, service, doctrine, pilgrimage, vows, prayers, trust, templeTrust, branch: p?.branch, branchChanges: p?.branchChanges ?? 0,
    advancedEligible, saintEligible, eligible: c.job === 'priest' && (c.jobXp.priest ?? 0) >= 30 && service >= 1 && doctrine >= 1 && pilgrimage >= 2 && (vows >= 1 || service >= 3) && faith >= 20 && (templeTrust[c.location] ?? 0) >= 10 };
}
export function fantasyPriestSkills(c: FantasyCharacter): FantasySkill[] {
  if (c.job !== 'priest' || !c.priestGrowth?.branch) return [];
  const rank = fantasyPriestGrowthStatus(c).rank;
  return FANTASY_PRIEST_PATH_SKILLS.filter(skill => skill.id.startsWith(`priest-${c.priestGrowth!.branch}-`)).map(skill => ({ ...skill,
    power: skill.power + (skill.effect === 'travel' ? Math.max(0, rank - 1) * .05 : Math.max(0, rank - 1) * (skill.effect === 'heal' ? 4 : 1)) }));
}
export function fantasyPriestActionHours(action: FantasyAction): number { return action.type === 'priestBranch' ? 1 : 0; }
const ERRORS = {
  priest: l('지금은 이 길을 따를 수 없습니다.', 'You cannot follow this path now.', '今はこの道を歩めません。'),
  temple: l('이곳에서는 이 의식을 치를 수 없습니다.', 'This rite cannot be held here.', 'ここではこの儀式を行えません。'),
  vow: l('수락한 봉사 의뢰 중 아직 서약하지 않은 의뢰를 고르세요.', 'Choose an accepted service contract you have not sworn before.', '受注済みで、まだ誓っていない奉仕依頼を選んでください。'),
  active: l('진행 중인 서약을 먼저 마치거나 정직하게 철회하세요.', 'Fulfill or honestly release your current vow first.', '今の誓いを果たすか、正直に辞退してください。'),
  none: l('진행 중인 서약이 없습니다.', 'There is no active vow.', '進行中の誓いがありません。'),
  progress: l('아직 이 길의 인정을 받지 못했습니다.', 'You have not yet earned recognition for this path.', 'まだこの道の認めを得ていません。'),
  same: l('이미 이 길을 걷고 있습니다.', 'You already follow this path.', 'すでにこの道を歩んでいます。'),
  gold: l('분기를 바꾸려면 120G가 필요합니다.', 'Changing paths costs 120G.', '道の変更には120Gが必要です。'),
  cooldown: l('아직 이 의식을 다시 치를 수 없습니다.', 'You cannot repeat this rite yet.', 'まだこの儀式を繰り返せません。'),
  branch: l('알려진 사제의 길을 선택하세요.', 'Choose a known priest path.', '知られている司祭の道を選んでください。'),
};
export function fantasyPriestActionError(c: FantasyCharacter, action: FantasyAction, locale: NpcLocale = 'ja'): string | undefined {
  if (!['priestVow', 'priestReleaseVow', 'priestBranch'].includes(action.type)) return;
  if (c.job !== 'priest' || c.hp <= 0) return ERRORS.priest[locale];
  if (!temple(c.location)) return ERRORS.temple[locale];
  const p = c.priestGrowth;
  if (action.type === 'priestVow') {
    if (p?.vow) return ERRORS.active[locale];
    if (!c.quests.includes(action.quest) || c.completed.includes(action.quest) || !fantasyPriestServiceQuest(action.quest) || p?.vows.some(vow => vow.quest === action.quest)) return ERRORS.vow[locale];
  }
  if (action.type === 'priestReleaseVow' && !p?.vow) return ERRORS.none[locale];
  if (action.type === 'priestBranch') {
    if (!FANTASY_PRIEST_BRANCHES.some(branch => branch.id === action.branch)) return ERRORS.branch[locale];
    if (p?.branch === action.branch) return ERRORS.same[locale];
    if (!fantasyJobPathDiscovered(c, `priest-${action.branch}`)) return ERRORS.progress[locale];
    const progress = fantasyPriestGrowthStatus(c);
    if (['inquisitor', 'paladin'].includes(action.branch) && !progress.advancedEligible || action.branch === 'saint' && !progress.saintEligible) return ERRORS.progress[locale];
    if (!progress.eligible || p?.branch && (progress.faith < 45 || (c.jobXp.priest ?? 0) < 100)) return ERRORS.progress[locale];
    if (p?.branch && c.gold < FANTASY_PRIEST_BRANCH_CHANGE_COST) return ERRORS.gold[locale];
    if (p?.branch && p.changedAt !== undefined && c.hour - p.changedAt < FANTASY_PRIEST_BRANCH_COOLDOWN) return ERRORS.cooldown[locale];
  }
}
export function applyFantasyPriestAction(c: FantasyCharacter, action: FantasyAction): { error?: string; message?: string } {
  const error = fantasyPriestActionError(c, action);
  if (error) return { error };
  syncFantasyPriestGrowth(c); const p = state(c);
  if (action.type === 'priestVow') { p.vow = { quest: action.quest, acceptedAt: c.hour }; return { message: '奉仕の依頼を果たすと誓い、神殿に記した。' }; }
  if (action.type === 'priestReleaseVow') { p.vows.push({ ...p.vow!, hour: c.hour, location: c.location, outcome: 'released' }); delete p.vow; return { message: '誓いを正直に辞退した。新たな奉仕の道を探そう。' }; }
  if (action.type === 'priestBranch') {
    if (p.branch) { c.gold -= FANTASY_PRIEST_BRANCH_CHANGE_COST; p.branchChanges++; }
    p.branch = action.branch; p.changedAt = c.hour;
    c.buff = null;
    return { message: `司祭の道を選んだ［${action.branch}］。これまでの熟練は保たれている。` };
  }
  return {};
}
export function validFantasyPriestGrowth(c: FantasyCharacter): boolean {
  const p = c.priestGrowth;
  if (p === undefined) return true;
  const obj = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  const time = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= c.hour;
  const ids = (value: unknown): value is string[] => Array.isArray(value) && value.every(id => typeof id === 'string') && new Set(value).size === value.length;
  if (!obj(p) || p.version !== 1 || Object.keys(p).some(key => !['version', 'startedAt', 'service', 'doctrine', 'pilgrimage', 'prayerDays', 'prayerTemples', 'vows', 'vow', 'branch', 'branchChanges', 'changedAt', 'support'].includes(key)) || !time(p.startedAt)
    || !ids(p.service) || p.service.some(id => !c.completed.includes(id) || !fantasyPriestServiceQuest(id))
    || !ids(p.doctrine) || p.doctrine.some(id => !c.readBooks?.includes(id) || !FANTASY_PRIEST_DOCTRINE_BOOKS.includes(id as typeof FANTASY_PRIEST_DOCTRINE_BOOKS[number]))
    || !ids(p.pilgrimage) || p.pilgrimage.some(id => !c.visited.includes(id) || !temple(id))
    || !Array.isArray(p.prayerDays) || p.prayerDays.length > 30 || new Set(p.prayerDays).size !== p.prayerDays.length || p.prayerDays.some(day => !Number.isSafeInteger(day) || day < 0 || day > (c.lastPrayerDay ?? -1))
    || !obj(p.prayerTemples) || Object.keys(p.prayerTemples).length !== p.prayerDays.length || Object.entries(p.prayerTemples).some(([day, place]) => !p.prayerDays.includes(Number(day)) || String(Number(day)) !== day || typeof place !== 'string' || !p.pilgrimage.includes(place))
    || !Number.isSafeInteger(p.branchChanges) || p.branchChanges < 0 || p.branchChanges > 1_000_000
    || p.branch !== undefined && !FANTASY_PRIEST_BRANCHES.some(branch => branch.id === p.branch)
    || p.branch !== undefined && p.changedAt === undefined
    || p.branch === undefined && p.branchChanges !== 0
    || p.changedAt !== undefined && (!p.branch || !time(p.changedAt) || p.changedAt < p.startedAt)
    || !Array.isArray(p.vows) || new Set(p.vows.map(vow => vow?.quest)).size !== p.vows.length) return false;
  if (p.support !== undefined) {
    if (!Array.isArray(p.support) || p.support.length > FANTASY_PRIEST_COMBAT_SERVICE_LIMIT) return false;
    const battles = new Set<string>(), daily = new Map<number, number>(); let faith = 0;
    for (const entry of p.support) {
      if (!obj(entry) || Object.keys(entry).length !== 4 || Object.keys(entry).some(key => !['battle', 'day', 'points', 'hour'].includes(key))
        || typeof entry.battle !== 'string' || !entry.battle.length || entry.battle.length > 200 || entry.battle.trim() !== entry.battle || /[\u0000-\u001f\u007f]/u.test(entry.battle)
        || battles.has(entry.battle) || !time(entry.hour) || entry.hour < p.startedAt || !Number.isSafeInteger(entry.day) || entry.day !== Math.floor(entry.hour / 24)
        || ![1, 2].includes(entry.points) || !Object.hasOwn(c.combatVictories ?? {}, `service:${entry.battle}`) || c.combatVictories?.[`service:${entry.battle}`] !== entry.hour) return false;
      battles.add(entry.battle); faith += entry.points; daily.set(entry.day, (daily.get(entry.day) ?? 0) + entry.points);
      if (faith > FANTASY_PRIEST_COMBAT_FAITH_LIMIT || daily.get(entry.day)! > FANTASY_PRIEST_COMBAT_DAILY_LIMIT) return false;
    }
  }
  for (const vow of p.vows) {
    if (!obj(vow) || Object.keys(vow).length !== 5 || typeof vow.quest !== 'string' || !fantasyPriestServiceQuest(vow.quest) || !time(vow.acceptedAt) || !time(vow.hour) || vow.hour < vow.acceptedAt || !FANTASY_LOCATIONS.some(place => place.id === vow.location) || !['fulfilled', 'released'].includes(String(vow.outcome)) || vow.outcome === 'fulfilled' && !c.completed.includes(vow.quest)) return false;
  }
  if (p.branch) {
    const faith = p.service.length * FANTASY_PRIEST_SERVICE_FAITH + p.doctrine.length * 3 + p.pilgrimage.length * 2 + p.vows.filter(vow => vow.outcome === 'fulfilled').length * FANTASY_PRIEST_VOW_FAITH + Math.min(10, p.prayerDays.length) + combatServiceFaith(p);
    if ((c.jobXp.priest ?? 0) < 30 || p.service.length < 1 || p.doctrine.length < 1 || p.pilgrimage.length < 2 || !p.vows.some(vow => vow.outcome === 'fulfilled') && p.service.length < 3 || faith < 20) return false;
    if (['inquisitor', 'paladin', 'saint'].includes(p.branch)) {
      const progress = fantasyPriestGrowthStatus({ ...c, job: 'priest' });
      if (!c.occult?.usedRelics.includes(`relic-priest-${p.branch}`) && !c.blackMarketStudies?.includes(`relic-priest-${p.branch}`) || !progress.advancedEligible || p.branch === 'saint' && !progress.saintEligible) return false;
    }
  }
  const v = p.vow;
  return v === undefined || obj(v) && Object.keys(v).length === 2 && typeof v.quest === 'string' && fantasyPriestServiceQuest(v.quest) && c.quests.includes(v.quest) && !c.completed.includes(v.quest) && !p.vows.some(outcome => outcome.quest === v.quest) && time(v.acceptedAt);
}
export function fantasyPriestText(source: string, locale: NpcLocale): string | undefined {
  const error = Object.values(ERRORS).find(value => value.ja === source);
  if (error) return error[locale];
  if (source === '奉仕の依頼を果たすと誓い、神殿に記した。') return l('봉사 의뢰를 이행하겠다고 서약하고 신전에 기록했다.', 'You swore to fulfill a service contract and recorded it at the temple.', source)[locale];
  if (source === '誓いを正直に辞退した。新たな奉仕の道を探そう。') return l('서약을 정직하게 철회했다. 새로운 봉사의 길을 찾자.', 'You honestly released your vow. Seek a new way to serve.', source)[locale];
  const branch = source.match(/^司祭の道を選んだ［(care|ward|oath|pilgrim|inquisitor|paladin|saint)］。これまでの熟練は保たれている。$/)?.[1];
  if (branch) {
    const name = FANTASY_PRIEST_BRANCHES.find(path => path.id === branch)!.names[locale];
    return l(`${name}을 선택했다. 지금까지의 숙련은 유지된다.`, `You chose ${name}. Your existing practice is preserved.`, `「${name}」を選んだ。これまでの熟練は保たれている。`)[locale];
  }
}
