import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FANTASY_TASK_QUESTS, type FantasyTaskQuest } from './fantasy-task-quests.ts';
import { fantasyTaskObjectiveLabel, fantasyTaskProgress, fantasyTaskReady, grantFantasyTaskProgress, validFantasyTaskProgress } from './fantasy-task-progress.ts';
import { FANTASY_ITEMS, FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_QUESTS, FANTASY_RECIPES, FANTASY_ROUTES } from './fantasy-data.ts';
import { NPC_PUBLIC } from './npc.ts';
import { applyFantasyAction, advanceFantasyWorld, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { canBuyItem, fantasyBuildings, fantasyCanCraft } from './fantasy-town.ts';
import { fantasyFishingError, fantasyGatheringOptions } from './fantasy-gathering.ts';
import { FANTASY_CONTRACT_DEADLINE_HOURS, FANTASY_CONTRACT_POST_HOURS, fantasyContractCandidates, fantasyContractIssuer, fantasyContractMode } from './fantasy-contracts.ts';
import { fantasyHostileEncounter } from './fantasy-encounters.ts';
import { FantasyStore } from '../server/fantasy-store.ts';
import type { FantasyAction, FantasyProfile } from './fantasy.ts';

const high = () => .999;
function player(quest: FantasyTaskQuest, accepted = true): FantasyProfile {
  let p = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Worker', gender: 'female', source: 'human' }, () => .5).profile;
  p.character!.level = 20; p.character!.job = quest.jobs?.[0] ?? 'unassigned'; p.character!.jobXp[p.character!.job] = 0;
  p.character!.location = quest.giver; if (!p.character!.visited.includes(quest.giver)) p.character!.visited.push(quest.giver);
  if (accepted) p = applyFantasyAction(p, { type: 'accept', quest: quest.id }, high).profile;
  p.character!.location = quest.destination; if (!p.character!.visited.includes(quest.destination)) p.character!.visited.push(quest.destination);
  p.character!.inventory.lantern = 1;
  const objective = quest.objective;
  if (objective.type === 'craft') {
    const recipe = FANTASY_RECIPES.find(recipe => recipe.id === objective.recipe)!;
    for (const [item, count] of Object.entries(recipe.inputs)) p.character!.inventory[item] = Math.max(p.character!.inventory[item] ?? 0, count * (objective.count + 2));
  }
  if (quest.objective.type === 'fish') p.character!.fishingBoat = { kind: 'owned' };
  return p;
}
function action(quest: FantasyTaskQuest): FantasyAction {
  const objective = quest.objective;
  return objective.type === 'gather' ? { type: 'gather', resource: objective.resource } : objective.type === 'craft' ? { type: 'craft', recipe: objective.recipe } : objective.type === 'fish' ? { type: 'fish', mode: objective.mode } : { type: 'explore' };
}
function temporary(t: TestContext): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-task-progress-'));
  t.after(() => { assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir())); assert.ok(path.basename(directory).startsWith('tonarium-task-progress-')); fs.rmSync(directory, { recursive: true, force: true }); });
  return path.join(directory, 'fantasy.json');
}

test('twenty-four distinct localized action quests use real local issuers and available activities', () => {
  assert.equal(FANTASY_TASK_QUESTS.length, 24); assert.equal(FANTASY_QUESTS.length, 167);
  for (const type of ['gather', 'craft', 'fish', 'survey']) assert.equal(FANTASY_TASK_QUESTS.filter(quest => quest.objective.type === type).length, 6);
  for (const quest of FANTASY_TASK_QUESTS) {
    assert.equal(FANTASY_QUESTS.filter(value => value.id === quest.id).length, 1);
    assert.ok(NPC_PUBLIC.some(npc => npc.id === quest.issuer && npc.homeLocation === quest.giver)); assert.equal(fantasyContractIssuer(quest), quest.issuer); assert.equal(fantasyContractMode(quest), 'exclusive');
    assert.ok(FANTASY_LOCATIONS.some(place => place.id === quest.destination)); assert.ok(FANTASY_ITEMS.some(item => item.id === quest.item));
    for (const job of quest.jobs ?? []) assert.ok(FANTASY_JOBS.some(value => value.id === job));
    for (const locale of ['ko', 'en', 'ja'] as const) { assert.ok(quest.names![locale]); assert.ok(quest.dialogue![locale].length > 20); assert.match(fantasyTaskObjectiveLabel(quest, locale)!, { ko: /성공/, en: /successful/, ja: /成功/ }[locale]); }
    const c = player(quest).character!, objective = quest.objective;
    if (objective.type === 'gather') assert.equal(fantasyGatheringOptions(c).find(option => option.resource === objective.resource)?.available, true, quest.id);
    if (objective.type === 'craft') {
      const recipe = FANTASY_RECIPES.find(recipe => recipe.id === objective.recipe)!;
      assert.equal(fantasyCanCraft(c, recipe), true, quest.id);
      for (const ingredient of Object.keys(recipe.inputs)) assert.equal(canBuyItem(c, ingredient), true, `${quest.id}: ${ingredient} must be available beside the workshop`);
    }
    if (objective.type === 'fish') assert.equal(fantasyFishingError(c, objective.mode), undefined);
    const land = FANTASY_LOCATIONS.find(place => place.id === quest.giver)!.land;
    const board = ({ aurelia: 'hearth', noctis: 'inkstone-city', sylvara: 'canopy-hall', kazaran: 'sunloom', islands: 'hearth' })[land];
    for (const season of ['spring', 'summer', 'autumn', 'winter']) assert.ok(fantasyContractCandidates(board, 8, season, 1).some(value => value.id === quest.id), `${quest.id}: ${season}`);
  }
});

test('every task completes from its own real successful actions and reports without consuming the retained output', () => {
  for (const quest of FANTASY_TASK_QUESTS) {
    let p = player(quest);
    for (let count = 0; count < quest.objective.count; count++) {
      p.character!.buff = { effect: 'check', power: 40 };
      const result = applyFantasyAction(p, action(quest), high); assert.equal(result.error, undefined, quest.id); p = result.profile;
      assert.equal(fantasyTaskProgress(p.character!, quest), count + 1, quest.id);
      assert.equal(validFantasyTaskProgress(p.character!), true, quest.id);
    }
    assert.equal(fantasyTaskReady(p.character!, quest), true); p.event = null;
    p.character!.location = quest.giver;
    const inventory = structuredClone(p.character!.inventory), gold = p.character!.gold;
    const completed = applyFantasyAction(p, { type: 'complete', quest: quest.id }, high);
    assert.equal(completed.error, undefined, quest.id); assert.equal(completed.changed, true);
    assert.deepEqual(completed.profile.character!.inventory, inventory); assert.ok(completed.profile.character!.gold > gold);
    assert.equal(completed.profile.character!.taskProgress?.[quest.id], undefined); assert.equal(fantasyTaskReady(completed.profile.character!, quest), false);
    assert.equal(fantasyTaskProgress(completed.profile.character!, quest), quest.objective.count);
    assert.equal(applyFantasyAction(completed.profile, { type: 'complete', quest: quest.id }, high).changed, false);
  }
});

test('every possible local guild can reach each task, perform the required actions and report on foot before the latest-accept deadline', () => {
  const footHours = (from: string, destination: string) => {
    const distances = new Map<string, number>([[from, 0]]), remaining = new Set(FANTASY_LOCATIONS.map(place => place.id));
    while (remaining.size) {
      const current = [...remaining].sort((a, b) => (distances.get(a) ?? Infinity) - (distances.get(b) ?? Infinity))[0];
      const elapsed = distances.get(current) ?? Infinity; if (!Number.isFinite(elapsed)) return Infinity; if (current === destination) return elapsed;
      remaining.delete(current);
      for (const route of FANTASY_ROUTES.filter(route => route.mode === 'land')) {
        const next = route.from === current ? route.to : route.to === current ? route.from : undefined;
        if (next && remaining.has(next) && elapsed + route.hours < (distances.get(next) ?? Infinity)) distances.set(next, elapsed + route.hours);
      }
    }
    return Infinity;
  };
  const latestWindow = FANTASY_CONTRACT_DEADLINE_HOURS - FANTASY_CONTRACT_POST_HOURS;
  for (const quest of FANTASY_TASK_QUESTS) {
    const hours = (quest.objective.type === 'gather' ? 2 : quest.objective.type === 'fish' ? quest.objective.mode === 'sea' ? 4 : 2 : 3) * quest.objective.count;
    const boards = FANTASY_LOCATIONS.filter(place => fantasyBuildings({ location: place.id }).some(building => building.id === 'guild') && fantasyContractCandidates(place.id, 8, 'spring', 1).some(candidate => candidate.id === quest.id));
    assert.ok(boards.length, quest.id);
    for (const board of boards) {
      const total = footHours(board.id, quest.destination) + hours + footHours(quest.destination, quest.giver);
      assert.ok(total < latestWindow, `${quest.id}: ${board.id} needs ${total}h but has ${latestWindow}h`);
    }
  }
});

test('stocks, purchases, wrong places, wrong targets and attempts started before acceptance do not create progress', () => {
  const quest = FANTASY_TASK_QUESTS[0]; let p = player(quest, false);
  p = applyFantasyAction(p, action(quest), high).profile; assert.equal(fantasyTaskProgress(p.character!, quest), 0);
  p.event = null; p.character!.location = quest.giver; p = applyFantasyAction(p, { type: 'accept', quest: quest.id }, high).profile;
  p.character!.inventory[quest.item] = 100; assert.equal(applyFantasyAction(p, { type: 'complete', quest: quest.id }, high).changed, false);
  p.character!.gold = 1000; p = applyFantasyAction(p, { type: 'buy', item: quest.item }, high).profile; assert.equal(fantasyTaskProgress(p.character!, quest), 0);
  p.character!.hour += 2;
  assert.deepEqual(grantFantasyTaskProgress(p.character!, action(quest), p.character!.hour - 2, 'other-place', true), []);
  p.character!.location = quest.destination;
  assert.deepEqual(grantFantasyTaskProgress(p.character!, { type: 'gather', resource: 'wood' }, p.character!.hour - 2, quest.destination, true), []);
  assert.deepEqual(grantFantasyTaskProgress(p.character!, action(quest), p.character!.taskProgress![quest.id].acceptedAt - 1, quest.destination, true), []);
  assert.equal(fantasyTaskProgress(p.character!, quest), 0);
});

test('failed checks may yield incidental resources but never count as successful task actions or extra rewards', () => {
  const quest = FANTASY_TASK_QUESTS[0]; let p = player(quest); p.character!.level = 1; p.character!.birthBonuses = {};
  const before = p.character!.inventory.herb ?? 0;
  p = applyFantasyAction(p, action(quest), () => 0).profile;
  assert.equal(fantasyTaskProgress(p.character!, quest), 0); assert.ok(Object.values(p.character!.inventory).some(value => value > 0));
  assert.ok((p.character!.inventory.herb ?? 0) > before); assert.equal(fantasyTaskReady(p.character!, quest), false);
  assert.equal(p.log.some(log => log.text.startsWith('行動依頼') && /：1\//.test(log.text)), false);
});

test('a failed survey followed by a hostile encounter and a successful escape still earns no survey progress', () => {
  const quest = FANTASY_TASK_QUESTS.find(quest => quest.objective.type === 'survey')!;
  let p = player(quest); p.character!.level = 1; p.character!.birthBonuses = {};
  p = applyFantasyAction(p, { type: 'explore' }, () => 0).profile;
  assert.ok(fantasyHostileEncounter(p.event)); assert.equal(fantasyTaskProgress(p.character!, quest), 0);
  p.character!.buff = { effect: 'check', power: 40 };
  p = applyFantasyAction(p, { type: 'event', choice: 'escape' }, high).profile;
  assert.equal(p.event, null); assert.equal(fantasyTaskProgress(p.character!, quest), 0);
});

test('finished task receipts are personal, bounded and deduplicated; hunt-like shared progress cannot substitute', () => {
  const quest = FANTASY_TASK_QUESTS[0], a = player(quest), b = player(quest);
  a.character!.hour += 2;
  assert.deepEqual(grantFantasyTaskProgress(a.character!, action(quest), 8, quest.destination, true), [quest.id]);
  assert.deepEqual(grantFantasyTaskProgress(a.character!, action(quest), 8, quest.destination, true), []);
  assert.equal(fantasyTaskProgress(a.character!, quest), 1); assert.equal(fantasyTaskProgress(b.character!, quest), 0);
  b.character!.contracts = { [quest.id]: { offerId: 'offer-personal-test', issuer: quest.issuer!, boardLocation: 'hearth', acceptedAt: 8, expiresAt: 44, gold: quest.gold, progress: 999 } };
  assert.equal(fantasyTaskReady(b.character!, quest), false); b.character!.location = quest.giver;
  assert.equal(applyFantasyAction(b, { type: 'complete', quest: quest.id }, high).changed, false);
  a.character!.hour += 2; grantFantasyTaskProgress(a.character!, action(quest), 10, quest.destination, true);
  a.character!.hour += 2; assert.deepEqual(grantFantasyTaskProgress(a.character!, action(quest), 12, quest.destination, true), []);
  assert.equal(fantasyTaskProgress(a.character!, quest), quest.objective.count);
});

test('the scheduler records a task only at successful completion, keeps a halfway restart and never duplicates sync', t => {
  const file = temporary(t), quest = FANTASY_TASK_QUESTS[0]; const p = player(quest); p.character!.buff = { effect: 'check', power: 40 };
  const queued = startFantasyActivity(p, action(quest), 8, () => .42).profile;
  assert.equal(fantasyTaskProgress(queued.character!, quest), 0); assert.equal(queued.activity?.endsAt, 10);
  const half = advanceFantasyWorld(queued, 9).profile; fs.writeFileSync(file, JSON.stringify({ user: half }));
  let hour = 9; let store = new FantasyStore(file, { worldHour: () => hour, onError: () => {} }); assert.equal(store.loadError, undefined);
  hour = 10; const result = store.synchronize('user'); assert.equal(result.error, undefined);
  assert.equal(fantasyTaskProgress(result.profile.character!, quest), 1); assert.equal(result.profile.activity, undefined);
  store = new FantasyStore(file, { worldHour: () => hour }); assert.equal(store.loadError, undefined);
  assert.equal(store.synchronize('user').changed, false); assert.equal(fantasyTaskProgress(store.profile('user').character!, quest), 1);
});

test('abandon resets only the active task counter and absent legacy fields load as zero without losing completed quests', t => {
  const file = temporary(t), quest = FANTASY_TASK_QUESTS[0]; let p = player(quest);
  p = applyFantasyAction(p, action(quest), high).profile; assert.equal(fantasyTaskProgress(p.character!, quest), 1);
  p = applyFantasyAction(p, { type: 'abandon', quest: quest.id }).profile; assert.equal(p.character!.taskProgress?.[quest.id], undefined);
  p.character!.location = quest.giver; p = applyFantasyAction(p, { type: 'accept', quest: quest.id }).profile; assert.equal(fantasyTaskProgress(p.character!, quest), 0);
  delete p.character!.taskProgress; p.character!.completed.push('quest-herbalist'); fs.writeFileSync(file, JSON.stringify({ old: p }));
  const store = new FantasyStore(file, { onError: () => {} }); assert.equal(store.loadError, undefined);
  assert.deepEqual(store.profile('old'), p); assert.equal(fantasyTaskProgress(store.profile('old').character!, quest), 0);
});

test('malformed, future and excessive task counters never overwrite saved data', t => {
  const file = temporary(t), quest = FANTASY_TASK_QUESTS[0]; const p = applyFantasyAction(player(quest), action(quest), high).profile;
  const changes: ((record: Record<string, unknown>, profile: FantasyProfile) => void)[] = [
    record => { record.progress = 999; }, record => { record.progress = -1; }, record => { record.progress = .5; },
    record => { record.acceptedAt = 100; }, record => { record.lastAt = 100; }, record => { record.lastAt = record.acceptedAt; },
    record => { record.reward = 1000; }, (_record, profile) => { profile.character!.taskProgress!['quest-herbalist'] = profile.character!.taskProgress![quest.id]; },
  ];
  for (const change of changes) {
    const corrupt = structuredClone(p); change(corrupt.character!.taskProgress![quest.id] as unknown as Record<string, unknown>, corrupt);
    assert.equal(validFantasyTaskProgress(corrupt.character!), false); const bytes = JSON.stringify({ bad: corrupt }); fs.writeFileSync(file, bytes);
    assert.ok(new FantasyStore(file, { onError: () => {} }).loadError); assert.equal(fs.readFileSync(file, 'utf8'), bytes);
  }
});
