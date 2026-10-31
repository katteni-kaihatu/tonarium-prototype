import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { FANTASY_ITEMS, FANTASY_JOBS, FANTASY_RACES, FANTASY_RECIPES } from '../shared/fantasy-data.ts';
import { applyFantasyAction, fantasyStats, fantasySkills, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { fantasyCombatPlayer, fantasyCombatCompanions, fantasyCombatProfessionUsesCombat } from '../server/fantasy-combat-adapter.ts';
import { fantasyEquipGear } from '../shared/fantasy-equipment.ts';
import { createFantasyCombat, fantasyCombatHitChance, fantasyCombatOrderError, submitFantasyCombatOrder, validFantasyCombatState, type FantasyCombatPlayer, type FantasyCombatSkill } from '../shared/fantasy-combat.ts';
import { fantasyCombatMoveRange } from '../shared/fantasy-combat-tactics.ts';
import { fantasyJobMagicAttackRatio, fantasyJobHealingBonus, fantasyJobHpMultiplier } from '../shared/fantasy-job-balance.ts';
import { learnFantasyMagicBook } from '../shared/fantasy-magic-discovery.ts';
import { fantasyCanPrepareMagic, fantasyCompanyCapacity, FANTASY_COMPANIONS, type FantasyCompanyKind } from '../shared/fantasy-specializations.ts';
import { fantasyCraftFacility } from '../shared/fantasy-town.ts';
import { fantasyTermName } from '../shared/fantasy-lore.ts';
import type { FantasyProfile, FantasyPreparedSpell } from '../shared/fantasy.ts';

const excludedSkill = (id: string) => /^(ultimate-|path-|priest-(?:care|ward|oath|pilgrim|inquisitor|paladin|saint)-|miracle-|last-dawn)/.test(id);
const byId = (id: string) => FANTASY_JOBS.find(job => job.id === id)!;
const round = (value: number) => Math.round(value * 100) / 100;
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const weaponFor = (job: string) => job === 'pugilist' || job === 'unassigned' ? undefined : job === 'priest' ? 'sacred-book'
  : ['mage', 'summoner'].includes(job) ? 'mana-staff' : ['archer', 'scout', 'hunter', 'ranger'].includes(job) ? 'oak-bow'
  : job === 'spearfighter' ? 'iron-spear' : ['thief', 'assassin', 'spy', 'smuggler'].includes(job) ? 'blade' : 'steel-sword';

/** Ordinary training ceiling, not free player progression: registered evidence is listed in the output. */
export function roleAuditProfile(job: string, level: number, jobXp: number, race = 'human'): FantasyProfile {
  assert.ok(byId(job), job); assert.ok(FANTASY_RACES.some(entry => entry.id === race && entry.rarity === '一般'), race);
  const draft = newFantasyProfile(); draft.draft.candidate = race;
  const created = applyFantasyAction(draft, { type: 'create', source: 'candidate', name: '역할 감사', gender: 'female' }, () => .5);
  assert.equal(created.error, undefined); const p = created.profile, c = p.character!, definition = byId(job);
  c.job = job; c.jobXp = { unassigned: 0, [job]: jobXp }; c.level = level; c.hour = 108; c.fatigue = c.hunger = 0; c.location = 'hearth';
  c.inventory = {}; c.foodLots = []; c.equipment = {}; c.equippedGear = {}; c.gear = [];
  c.jobPaths = undefined; c.priestGrowth = undefined; c.specialization = undefined; c.permanentBonuses = undefined;
  c.birthBonuses = { hp: 0, mp: 0, strength: 0, agility: 0, intelligence: 0, luck: 0, vitality: 0 };
  const ordinary = definition.skills.filter(skill => !excludedSkill(skill.id));
  c.skillXp = Object.fromEntries(ordinary.map(skill => [skill.id, 200]));
  c.unlockedSkills = ordinary.filter(skill => skill.unlock?.kind === 'mentor').map(skill => skill.id);
  c.readBooks = [...new Set(ordinary.flatMap(skill => skill.unlock?.kind === 'book' ? [skill.unlock.book] : []))];
  c.practice = { explore: 100, craft: 100, gather: 100, hunt: 100, fish: 100, command: 100 };
  for (const item of [weaponFor(job), 'wolf-armor', ...(['knight', 'shieldbearer'].includes(job) ? ['iron-shield'] : [])].filter((id): id is string => !!id)) {
    assert.ok(FANTASY_ITEMS.find(entry => entry.id === item)?.equipment, item); c.inventory[item] = 1; assert.equal(fantasyEquipGear(c, item), undefined);
  }
  // Registered basic books and the same preparation gate used by the production adapter.
  if (job === 'mage' || job === 'priest') {
    for (const book of ['mana-primer', 'stone-and-flame', 'remedies-and-rites', 'advanced-mana-forms']) { if (!c.readBooks.includes(book)) c.readBooks.push(book); learnFantasyMagicBook(c, book); }
    const choices: { element: FantasyPreparedSpell['element']; form: FantasyPreparedSpell['form'] }[] = job === 'mage'
      ? [{ element: 'flame', form: 'bolt' }, { element: 'stone', form: 'veil' }]
      : [{ element: 'light', form: 'mend' }, { element: 'tide', form: 'veil' }];
    c.specialization = { spells: choices.filter((spell, i) => fantasyCanPrepareMagic(c, spell.element, spell.form, i + 1)).map((spell, i) => ({ ...spell, slot: i + 1 })) };
  }
  c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
  return p;
}

function playerOf(profile: FantasyProfile, user = 'audit'): FantasyCombatPlayer {
  const player = fantasyCombatPlayer(profile, user); player.skills = player.skills.filter(skill => !excludedSkill(skill.id)); return player;
}

/** One actual core resolution against an explicit durable probe; never remap a focus/utility into damage. */
export function auditAction(player: FantasyCombatPlayer, skill: FantasyCombatSkill | undefined, samples: number) {
  let total = 0, hits = 0, chance = 0, invalid = 0;
  for (let sample = 0; sample < samples; sample++) {
    const state = createFantasyCombat({ id: 'ordinary-role-probe', location: 'hearth', source: 'audit:ordinary-role', hour: 108,
      seed: Math.imul(sample + 1, 0x9e3779b1) >>> 0, tactical: true, players: [structuredClone(player)], enemies: [{ id: 'probe', template: 'monster-meadow-slime' }] });
    const actor = state.fighters.find(f => f.userId === player.userId)!, target = state.fighters.find(f => f.side === 'enemies')!;
    actor.tile = { x: 4, y: 3 }; target.tile = { x: 5, y: 3 };
    target.stats = { hp: 1_000_000, mp: 0, attack: 0, intelligence: 0, defense: 20, magicResist: 20, agility: 20, accuracy: 0 }; target.hp = target.stats.hp; target.mp = 0; target.skills = [];
    const order = skill ? { type: 'skill' as const, skill: skill.id, target: target.id } : { type: 'attack' as const, target: target.id };
    const error = fantasyCombatOrderError(state, player.userId, order);
    if (error) { invalid++; continue; }
    chance = fantasyCombatHitChance(state, actor, target, skill).chance;
    assert.ok(validFantasyCombatState(state));
    const result = submitFantasyCombatOrder(state, player.userId, state.revision, order, state.hour);
    assert.equal(result.error, undefined); assert.ok(result.changed); assert.ok(validFantasyCombatState(result.state));
    const damage = target.hp - result.state.fighters.find(f => f.id === target.id)!.hp;
    total += damage; if (damage > 0) hits++;
  }
  return { id: skill?.id ?? 'basic-attack', meanDamage: round(total / samples), chance, observedHitFraction: hits / samples, invalidSamples: invalid,
    mp: skill?.mp ?? 0, fullMpCasts: skill?.mp ? Math.floor(player.mp / skill.mp) : null, magic: skill?.magic === true || (skill?.range ?? player.range) === 'magic',
    range: skill?.range ?? player.range, reach: skill?.reach ?? (player.range === 'melee' ? 1 : player.range === 'magic' ? 8 : 7), shape: skill?.shape ?? 'single' };
}

function conditionalRetinue(p: FantasyProfile) {
  const c = structuredClone(p.character!), kind: FantasyCompanyKind | undefined = c.job === 'leader' ? 'troop' : c.job === 'crimeboss' ? 'syndicate' : c.job === 'summoner' ? 'summons' : undefined;
  if (!kind) return undefined;
  const ids = kind === 'troop' ? ['troop-guard', 'troop-scout'] : kind === 'syndicate' ? ['syndicate-runner', 'syndicate-lookout'] : ['summon-wisp', 'summon-stone'];
  const templates = ids.map(id => FANTASY_COMPANIONS.find(entry => entry.id === id)!); assert.ok(templates.every(Boolean));
  c.specialization = { companies: { [kind]: { members: templates.map(entry => ({ id: entry.id, hp: entry.hp, condition: 'ready' as const, assigned: true, missions: 0 })) } } };
  const profile = { ...p, character: c }, owner = playerOf(profile), companions = fantasyCombatCompanions(profile, owner);
  assert.equal(companions.length, 2);
  return { kind, rosterCapacity: fantasyCompanyCapacity(c, kind), battleMaximum: 2, recruitment: templates.map(entry => ({ id: entry.id, gold: entry.cost, mp: entry.mp })),
    units: companions.map(unit => ({ id: unit.id, range: unit.range, stats: unit.stats, skills: unit.skills.map(skill => ({ id: skill.id, kind: skill.kind, power: skill.power, mp: skill.mp })) })) };
}

function roleRow(job: string, level: number, jobXp: number, samples: number) {
  const profile = roleAuditProfile(job, level, jobXp), c = profile.character!, player = playerOf(profile), definition = byId(job);
  const before = JSON.stringify(profile); assert.deepEqual(player, playerOf(profile)); assert.equal(JSON.stringify(profile), before);
  const basic = auditAction(player, undefined, samples), attacks = player.skills.filter(skill => skill.kind === 'attack').map(skill => auditAction(player, skill, samples));
  const best = [basic, ...attacks.filter(entry => !entry.invalidSamples)].sort((a, b) => b.meanDamage - a.meanDamage || a.mp - b.mp)[0];
  const healing = player.skills.filter(skill => skill.kind === 'heal').map(skill => ({ id: skill.id, mp: skill.mp, amount: skill.power + Math.floor(player.stats.intelligence * .8) + fantasyJobHealingBonus(job, player.stats.hp), selfOnly: !!skill.selfOnly }));
  const wards = player.skills.filter(skill => skill.kind === 'guard').map(skill => ({ id: skill.id, mp: skill.mp, amount: skill.power + Math.floor(player.stats.intelligence * .3), selfOnly: !!skill.selfOnly }));
  const known = fantasySkills(c).filter(skill => !excludedSkill(skill.id)), jobIds = new Set(definition.skills.map(skill => skill.id)), combatIds = new Set(player.skills.map(skill => skill.id));
  const derivedPassives = known.filter(skill => jobIds.has(skill.id) && skill.kind === 'passive' && ['check', 'guard'].includes(skill.effect));
  const derivedIds = new Set(derivedPassives.map(skill => skill.id));
  const worldSkills = known.filter(skill => jobIds.has(skill.id) && !combatIds.has(skill.id) && !derivedIds.has(skill.id)).map(skill => ({ id: skill.id, kind: skill.kind, effect: skill.effect, stat: skill.stat, power: skill.power, mp: skill.mp }));
  const utilityTags = [...new Set(player.skills.flatMap(skill => [skill.utility, skill.hitUtility?.id, skill.onHit?.id, skill.field, skill.kind === 'heal' ? 'heal' : undefined, skill.kind === 'guard' ? 'guard' : undefined, skill.motion ? 'mobility' : undefined, skill.kind === 'mana' ? 'mana' : undefined]).filter((tag): tag is string => !!tag))].sort();
  return { job, names: definition.names, category: definition.category, combatProfession: fantasyCombatProfessionUsesCombat(job), level, jobXp, hpMultiplier: fantasyJobHpMultiplier(job), stats: player.stats,
    equipment: c.equipment, baseRange: player.range, basic, attacks, best, moveRange: fantasyCombatMoveRange({ ...player, side: 'players', effects: [] } as Parameters<typeof fantasyCombatMoveRange>[0]),
    maximumReach: Math.max(basic.reach, ...attacks.map(entry => entry.reach)), maximumMobility: Math.max(0, ...player.skills.map(skill => skill.motion?.distance ?? 0)),
    healing, wards, utilityTags, skillKinds: Object.fromEntries([...new Set(player.skills.map(skill => skill.kind))].map(kind => [kind, player.skills.filter(skill => skill.kind === kind).length])),
    skills: player.skills.map(skill => ({ id: skill.id, kind: skill.kind, power: skill.power, mp: skill.mp, range: skill.range, reach: skill.reach, radius: skill.radius, selfOnly: skill.selfOnly, shape: skill.shape, motion: skill.motion, utility: skill.utility, hitUtility: skill.hitUtility, onHit: skill.onHit })),
    worldSkills, derivedPassives: derivedPassives.map(skill => ({ id: skill.id, effect: skill.effect, stat: skill.stat, power: skill.power })), craftingRecipes: FANTASY_RECIPES.filter(recipe => recipe.job === job).length, facility: fantasyCraftFacility(job), conditionalRetinue: conditionalRetinue(profile),
    evidence: { skillPractice: 200, ordinaryBooks: c.readBooks, unlockedMentorSkills: c.unlockedSkills, ordinaryPracticeCounts: c.practice, preparedSpells: c.specialization?.spells ?? [], noRareRaceOrAdvancedPath: true } };
}

export function auditOrdinaryRoles(samples = 32, selectedJobs = FANTASY_JOBS.map(job => job.id)) {
  assert.ok(Number.isSafeInteger(samples) && samples >= 1 && samples <= 1024);
  const rows = [20, 50].flatMap(level => [300, 1000].flatMap(xp => selectedJobs.map(job => roleRow(job, level, xp, samples))));
  const raceRows = [20, 50].flatMap(level => [300, 1000].flatMap(xp => FANTASY_RACES.filter(race => race.rarity === '一般').flatMap(race => ['warrior', 'mage', 'merchant'].map(job => {
    const p = roleAuditProfile(job, level, xp, race.id), player = playerOf(p), stats = fantasyStats(p.character!), modifiers = race.modifiers;
    return { race: race.id, names: race.names, level, jobXp: xp, job, modifiers, stats: player.stats, worldStats: stats,
      rawCoreModifierSum: sum(Object.entries(modifiers).filter(([key]) => !['hp', 'mp'].includes(key)).map(([, value]) => value ?? 0)),
      illustrativeBudget: round(sum(Object.entries(modifiers).map(([key, value]) => (value ?? 0) / (['hp', 'mp'].includes(key) ? 10 : 1)))),
      racialSkills: race.skills.map(skill => ({ id: skill.id, effect: skill.effect, stat: skill.stat, kind: skill.kind, power: skill.power })), body: player.body };
  }))));
  const dominance = rows.flatMap(other => rows.filter(candidate => candidate.job !== other.job && candidate.level === other.level && candidate.jobXp === other.jobXp && candidate.combatProfession && other.combatProfession).filter(candidate => {
    const vector = (row: typeof other) => [row.stats.hp, row.stats.mp, row.stats.defense, row.stats.magicResist, row.stats.agility, row.basic.meanDamage, row.best.meanDamage, row.maximumReach, row.maximumMobility, Math.max(0, ...row.healing.map(skill => skill.amount)), Math.max(0, ...row.wards.map(skill => skill.amount)), -row.best.mp];
    const a = vector(candidate), b = vector(other);
    return a.every((value, index) => value >= b[index]) && a.some((value, index) => value > b[index]) && other.utilityTags.every(tag => candidate.utilityTags.includes(tag));
  }).map(candidate => ({ level: other.level, jobXp: other.jobXp, strongerEnvelope: candidate.job, weakerEnvelope: other.job })));
  return { generatedAt: new Date().toISOString(), samples, levels: [20, 50], jobXp: [300, 1000], jobs: selectedJobs, normalRaces: [...new Set(raceRows.map(row => row.race))],
    assumptions: { ordinaryTrainingCeiling: '200 XP per ordinary skill; current-job ordinary unlock books and mentor evidence; practice counts100; no branch/ultimate/miracle or quality/material/gem bonuses',
      gear: 'Standard registered role weapon and wolf armor; knight/shieldbearer additionally carry iron shield; pugilist/unassigned unarmed',
      probe: 'One actual core round; adjacent open tactical tiles; durable meadow-slime reference, defense/magicResist20/agility20/attack0; canonical resistances still apply; spread uint32 seeds',
      warning: 'Mean direct HP loss for one action is not sustained DPS, solo win rate, multi-target value, encounter frequency, or an overall balance score; utility counts are descriptive',
      magicRatio: { mage: fantasyJobMagicAttackRatio('mage'), priest: fantasyJobMagicAttackRatio('priest'), other: fantasyJobMagicAttackRatio('other') },
      healingFormula: 'power + floor(intelligence * .8) + actual fantasyJobHealingBonus(job, caster maximum HP)',
      hitFormula: 'core d20 threshold from fantasyCombatHitChance; natural1miss/natural20crit1.4; damage/resistance/rounding resolved by submitFantasyCombatOrder',
      mpPayment: 'Attack MP is charged only on a damaging hit; fullMpCasts is therefore successful-hit budget, not a bound on attempted casts. Support MP is charged on an effective cast.',
      rawDamageFormula: 'magic: intelligence*1.3 + attack*actualJobMagicAttackRatio + power - magicResist*.65; physical: attack+power-defense*.7; then actual situational/mitigation/cover/guard/critical rules',
      racialBudget: 'Illustrative raw core modifiers + HP/10 + MP/10; not an objective power valuation; racial utility/body traits and actual derived stats reported separately' }, rows, raceRows, numericEnvelopeDominanceCandidates: dominance };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), value = (flag: string, fallback: string) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
  if (args.some((arg, index) => index % 2 === 0 && !['--samples', '--out', '--jobs'].includes(arg)) || args.length % 2) throw new Error('Usage: --samples N --out PATH --jobs comma,separated');
  const files = ['server/fantasy-combat-adapter.ts', 'shared/fantasy-job-balance.ts', 'shared/fantasy-combat.ts', 'shared/fantasy-data.ts', 'shared/fantasy-weapon-attacks.ts', 'shared/fantasy-combat-capabilities.ts'];
  const hashes = () => Object.fromEntries(files.map(file => [file, createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
  const before = hashes(), started = Date.now(), audit = auditOrdinaryRoles(Number(value('--samples', '32')), value('--jobs', FANTASY_JOBS.map(job => job.id).join(',')).split(','));
  const output = path.resolve(value('--out', 'work/qa/recent-features-2026-10-30/ordinary-role-audit.json'));
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify({ ...audit, elapsedMs: Date.now() - started, sourceHashes: before, sourceChangedDuringRun: JSON.stringify(before) !== JSON.stringify(hashes()) }, null, 2));
  console.log(JSON.stringify({ output, jobs: audit.jobs.length, roleRows: audit.rows.length, normalRaces: audit.normalRaces.length, raceRows: audit.raceRows.length, numericEnvelopeCandidates: audit.numericEnvelopeDominanceCandidates.length, elapsedMs: Date.now() - started }));
}
