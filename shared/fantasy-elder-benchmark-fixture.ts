import { fantasyOffhandEquipError } from './fantasy-equipment-slots.ts';
import { learnFantasyMagicBook } from './fantasy-magic-discovery.ts';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { applyFantasyJobPath } from './fantasy-job-paths.ts';
import { FANTASY_READABLE_LIBRARY_BOOKS } from './fantasy-library.ts';
import { FANTASY_ITEMS, FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_RACES, FANTASY_RECIPES } from './fantasy-data.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from './fantasy-engine.ts';
import { createFantasyGear, fantasyCraftInputs, fantasyEquipGear } from './fantasy-equipment.ts';
import { createFantasyCombat, fantasyCombatOrderError, submitFantasyCombatOrder, type FantasyCombatFighter, type FantasyCombatOrder, type FantasyCombatState } from './fantasy-combat.ts';
import { fantasyCombatActors, fantasyCombatDistance, fantasyCombatMoveRange, fantasyCombatPath } from './fantasy-combat-tactics.ts';
import { fantasyCombatPlayer, fantasyCombatSupplies } from '../server/fantasy-combat-adapter.ts';
import type { FantasyProfile } from './fantasy.ts';
import { fantasyCanCraft } from './fantasy-town.ts';
import { fantasyTermName } from './fantasy-lore.ts';
import { benchmarkOrder } from '../scripts/fantasy-balance-fixtures.ts';

export const equipmentAudit: Record<string, unknown> = {};

export function profile(race: string, job: string, level = 1, fine = false, path?: string): FantasyProfile {
  const draft = newFantasyProfile(); draft.draft = { remaining: 4, candidate: race, kept: null };
  const gender = FANTASY_RACES.find(entry => entry.id === race)?.gender === 'male' ? 'male' : 'female';
  const creation = applyFantasyAction(draft, { type: 'create', name: '검증자', source: 'candidate', gender }, () => .5), p = creation.profile, c = p.character!;
  if (!c) throw new Error(`Creation failed: ${race}: ${creation.error}`); c.level = level; c.job = job; c.jobXp[job] = level > 1 ? 1000 : 0; c.fatigue = c.hunger = 0;
  if (level > 1) {
    c.skillXp = Object.fromEntries((FANTASY_JOBS.find(entry => entry.id === job)?.skills ?? []).map(skill => [skill.id, 200]));
    const caster = ['priest', 'mage', 'summoner'].includes(job), bow = job === 'archer';
    const setup = [[caster ? 'carpenter-mana-staff' : bow ? 'carpenter-bow' : 'smith-blade', caster || bow ? 'worldtree-branch' : 'starsteel-ingot', caster ? 'sapphire' : bow ? 'emerald' : 'ruby'],
      ['sew-lizard-armor', 'moon-silk', 'diamond'], ['forge-shield', 'starsteel-ingot', 'diamond'], [caster ? 'gemcutter-charm' : 'gemcutter-ruby-ring', 'starsteel-ingot', caster ? 'sapphire' : 'ruby']];
    for (const [recipeId, material, gem] of setup) {
      const recipe = FANTASY_RECIPES.find(recipe => recipe.id === recipeId)!; assert.ok(recipe);
      const output = FANTASY_ITEMS.find(item => item.id === recipe.output); assert.ok(output);
      if (fantasyOffhandEquipError(c, output)) continue;
      const crafter = structuredClone(c); crafter.job = recipe.job; crafter.jobXp[recipe.job] = 1000; crafter.inventory = Object.fromEntries(FANTASY_ITEMS.map(item => [item.id, 100]));
      const workshop = FANTASY_LOCATIONS.find(place => fantasyCanCraft({ ...crafter, location: place.id }, recipe)); assert.ok(workshop);
      const validated = fantasyCraftInputs(crafter, recipe, fine ? material : undefined, fine ? gem : undefined); assert.equal(validated.error, undefined);
      const item = recipe.output; assert.ok(!['ember-oath-blade', 'tempest-longbow', 'frostheart-staff', 'dragon-scale-lamellar', 'void-woven-robe', 'oathscale-bulwark'].includes(item));
      c.inventory[item] = 1; const gear = createFantasyGear(c, item, () => fine ? .999 : .5, validated.material, fine ? gem : undefined)!; assert.equal(fantasyEquipGear(c, item, gear.id), undefined);
      equipmentAudit[`${fine ? 'top' : 'ordinary'}:${job}:${item}`] = { job, item, name: fantasyTermName(item, 'ko'), recipe: recipe.id, craftingJob: recipe.job, craftingLocation: workshop.id,
        material: validated.material, materialName: fantasyTermName(validated.material ?? '', 'ko'), gem: fine ? gem : null, gemName: fine ? fantasyTermName(gem, 'ko') : null, inputs: validated.inputs, quality: gear.quality,
        ordinaryRecipeValidated: true, apexMaterialsRequired: false, qualityForced: false };
    }
    c.inventory['hp-potion-4'] = 8; c.inventory['mp-potion-4'] = 8;
  }
  if (['leader', 'crimeboss', 'summoner'].includes(job)) {
    const kind = job === 'leader' ? 'troop' : job === 'crimeboss' ? 'syndicate' : 'summons';
    const ids = kind === 'troop' ? [['troop-guard', 30], ['troop-scout', 24]] : kind === 'syndicate' ? [['syndicate-runner', 24], ['syndicate-keeper', 28]] : [['summon-wisp', 20], ['summon-stone', 32]];
    c.specialization = { companies: { [kind]: { members: ids.slice(0, level > 1 || job !== 'summoner' ? 2 : 1).map(([id, hp]) => ({ id: String(id), hp: Number(hp), condition: 'ready' as const, assigned: true, missions: 0 })) } } };
  }
  c.hour=108; c.location='sunmeadow'; c.inventory.lantern=1; c.jobXp[job]=1000;
  c.readBooks=FANTASY_READABLE_LIBRARY_BOOKS.map(book=>book.id); for(const book of c.readBooks)learnFantasyMagicBook(c,book); c.unlockedSkills=FANTASY_JOBS.find(entry=>entry.id===job)!.skills.filter(skill=>skill.unlock?.kind==='mentor').map(skill=>skill.id);
  c.practice={explore:10,craft:10,gather:10,hunt:10,fish:10,command:10}; c.skillXp=Object.fromEntries(FANTASY_JOBS.find(entry=>entry.id===job)!.skills.map(skill=>[skill.id,200]));
  if(job==='mage')c.specialization={spells:[{slot:1,element:'flame',form:'bolt'},{slot:2,element:'stone',form:'veil'},{slot:3,element:'gale',form:'bolt'}]};
  if(path){const result=applyFantasyJobPath(c,path);if(result.error)throw new Error(path+': '+result.error);c.skillXp['path-'+path+'-insight']=100;c.skillXp['path-'+path+'-art']=100;}
  const stats = fantasyStats(c); c.hp = stats.hp; c.mp = stats.mp; return p;
}
const live = (actor: FantasyCombatFighter) => actor.hp > 0 && !actor.fled;
export function command(state: FantasyCombatState, actor: FantasyCombatFighter, profiles: Map<string, FantasyProfile>): FantasyCombatOrder {
  const user = actor.userId ?? actor.companion!.ownerId, supplies = fantasyCombatSupplies(profiles, [...profiles.keys()]);
  const wrap = (order: FantasyCombatOrder): FantasyCombatOrder => actor.companion ? { type: 'unit', unit: actor.id, order: order as never } : order;
  const allowed = (action: FantasyCombatOrder) => !fantasyCombatOrderError(state, user, wrap(action), supplies);
  const enemies = state.fighters.filter(f => f.side === 'enemies' && live(f)), enemy = enemies[0];
  if (!enemy) return wrap({ type: 'guard' });
  if (actor.tile && enemies.some(foe => foe.enemyCharge && foe.enemyCharge.resolvesRound <= state.round && foe.enemyCharge.tiles.some(tile => tile.x === actor.tile!.x && tile.y === actor.tile!.y))) return wrap(benchmarkOrder(state, 'trained', supplies, actor.companion ? actor.id : undefined, user));
  if (!enemy.skills.length && enemy.template?.includes('dragon') && state.round % 3 === 0) return wrap({ type: 'guard' });
  const orderedSkills=[...actor.skills].sort((a,b)=>Number(b.id.startsWith('path-'))-Number(a.id.startsWith('path-')));
  const heal = orderedSkills.find(skill => skill.kind === 'heal' && skill.mp <= actor.mp);
  if (heal) for (const target of fantasyCombatActors(state).filter(f => f.side === 'players' && live(f) && f.stats.hp - f.hp >= 35).sort((a, b) => a.hp / a.stats.hp - b.hp / b.stats.hp)) {
    const action: FantasyCombatOrder = { type: 'skill', skill: heal.id, target: target.id }; if (allowed(action)) return wrap(action);
  }
  if (!actor.companion) {
    if (actor.hp < actor.stats.hp * .65) { const action: FantasyCombatOrder = { type: 'item', item: 'hp-potion-4', target: actor.id }; if (allowed(action)) return action; }
    if (heal && actor.mp < 20) { const action: FantasyCombatOrder = { type: 'item', item: 'mp-potion-4', target: actor.id }; if (allowed(action)) return action; }
  }
  const pathArt=orderedSkills.find(skill=>skill.id.startsWith('path-')&&skill.mp<=actor.mp);
  if(pathArt?.kind==='attack')for(const target of enemies){const action:FantasyCombatOrder={type:'skill',skill:pathArt.id,target:target.id};if(allowed(action))return wrap(action);}
  if(pathArt?.kind==='guard'&&actor.hp<actor.stats.hp*.55&&state.round%2===0){const action:FantasyCombatOrder={type:'skill',skill:pathArt.id,target:actor.id};if(allowed(action))return wrap(action);}
  for (const target of enemies) if (allowed({ type: 'attack', target: target.id })) return wrap({ type: 'attack', target: target.id });
  const reach = actor.range === 'melee' ? 1 : actor.range === 'ranged' ? 7 : 8;
  const options = Array.from({ length: 80 }, (_, index) => ({ x: index % 10, y: Math.floor(index / 10) })).flatMap(tile => {
    if (!enemies.some(f => fantasyCombatDistance(tile, f.tile!) <= reach)) return [];
    const path = fantasyCombatPath(state, actor, tile); return path && path.length > 1 ? [path] : [];
  }).sort((a, b) => a.length - b.length);
  if (options[0]) return wrap({ type: 'moveTo', tile: options[0][Math.min(options[0].length - 1, fantasyCombatMoveRange(actor))] });
  return wrap({ type: 'guard' });
}
export function simulate(seed: number, profiles: Map<string, FantasyProfile>, template: string) {
  let state = createFantasyCombat({ id: 'matrix', location: 'ashpeak', source: template === 'monster-elder-dragon' ? 'apex:apex-elder-dragon' : `hunt:${template}`, players: [...profiles].map(([id, p]) => fantasyCombatPlayer(p, id)), enemies: [{ id: 'foe', template }], seed, hour: 108, tactical: true });
  let potions = 0, moves = 0;
  const trace: unknown[] = [];
  for (let step = 0; step < 100 && state.status === 'active'; step++) {
    const round = state.round;
    const actors = fantasyCombatActors(state).filter(f => f.side === 'players' && live(f)).sort((a, b) => Number(!a.companion) - Number(!b.companion));
    for (const actor of actors) {
      if (state.status !== 'active' || state.round !== round) break;
      const input = command(state, actor, profiles), user = actor.userId ?? actor.companion!.ownerId;
      if (false) trace.push({ round, actor: actor.id, tile: actor.tile, order: input, hp: actor.hp, mp: actor.mp });
      const result = submitFantasyCombatOrder(state, user, state.revision, input, state.hour, fantasyCombatSupplies(profiles, [...profiles.keys()]));
      if (result.error) throw new Error(`${result.error} for ${actor.id} ${JSON.stringify(input)}`);
      if (input.type === 'moveTo' || input.type === 'unit' && input.order.type === 'moveTo') moves++;
      state = result.state;
      for (const item of result.spentItems) { profiles.get(item.userId)!.character!.inventory[item.item]--; potions++; }
    }
  }
  if (false) fs.writeFileSync(`work/qa/tactical-trace-${profiles.get('member-0')?.character?.gear?.[0].quality}.json`, JSON.stringify({ trace, state }, null, 2));
  return { status: state.status, rounds: state.round, survivors: state.fighters.filter(f => f.side === 'players' && live(f)).length, potions, moves, remaining: state.fighters.find(f => f.id === 'foe')!.hp };
}



export const FANTASY_ELDER_BENCHMARK_ROLES=['knight','warrior','mage','archer','priest','summoner'] as const;
export const FANTASY_ELDER_BENCHMARK_PATHS=['knight-guardian','warrior-greatsword','mage-flame','archer-longbow',undefined,'summoner-elemental'] as const;
export const fantasyElderBenchmarkSquad=(fine:boolean)=>new Map(FANTASY_ELDER_BENCHMARK_ROLES.map((role,index)=>['member-'+index,profile('human',role,20,fine,FANTASY_ELDER_BENCHMARK_PATHS[index])]));
export const runFantasyElderBenchmark=(fine:boolean,seeds:readonly number[])=>seeds.map(seed=>({seed,...simulate(seed,fantasyElderBenchmarkSquad(fine),'monster-elder-dragon')}));
