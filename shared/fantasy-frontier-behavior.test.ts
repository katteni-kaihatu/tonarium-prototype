import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import type { FantasyEvent, FantasyProfile } from './fantasy.ts';
import { applyFantasyAction, advanceFantasyWorld, fantasyStats, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { FANTASY_FRONTIER_BASE, FANTASY_FRONTIER_DUNGEONS } from './fantasy-frontier-data.ts';
import { fantasyExpeditionText } from './fantasy-expedition.ts';
import { fantasyGatheringOptions } from './fantasy-gathering.ts';
import { FANTASY_EVENTS, FANTASY_JOBS } from './fantasy-data.ts';

function player(location = 'frontier-rainforest'): FantasyProfile {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: 'Frontier behavior' }, () => .5).profile;
  const c = p.character!;
  Object.assign(c, { location, hour: 12, level: 1, job: 'warrior', lifeJob: undefined, birthBonuses: {}, inventory: { lantern: 1 }, foodLots: [], outfit: undefined,
    equipment: {}, equippedGear: {}, gear: [], effects: [], buff: null, fatigue: 0, hunger: 0 });
  c.jobXp.warrior = 0; c.visited.push(location); c.expedition = { route: 'guild', issuedAt: 8 };
  c.guildProgress = { version: 1, grade: 4, completedAtGrade: 0, creditedQuests: [] };
  c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
  p.log = [];
  return p;
}
function sequence(...values: number[]) { let index = 0; return () => values[index++] ?? .999; }
function herbYield(p: FantasyProfile, rolls: number[] = [.999]) {
  const items = fantasyGatheringOptions(p.character!).find(option => option.resource === 'herbs')!.items;
  const result = applyFantasyAction(p, { type: 'gather', resource: 'herbs' }, sequence(...rolls));
  assert.equal(result.error, undefined);
  return items.reduce((sum, item) => sum + (result.profile.character!.inventory[item] ?? 0) - (p.character!.inventory[item] ?? 0), 0);
}

test('successful engine gathering adds one equipped artifact yield without held, forged or duplicate stacking', () => {
  const base = player();
  assert.equal(herbYield(base), 2);
  for (const state of ['held', 'equipped', 'many-copies', 'unowned', 'wrong-slot'] as const) {
    const p = structuredClone(base), c = p.character!;
    c.inventory['frontier-helpful-trowel'] = state === 'unowned' ? 0 : state === 'many-copies' ? 20 : 1;
    if (state !== 'held') c.equipment = state === 'wrong-slot' ? { necklace: 'frontier-helpful-trowel' } : { artifact: 'frontier-helpful-trowel' };
    assert.equal(herbYield(p), state === 'equipped' || state === 'many-copies' ? 3 : 2, state);
  }
});

test('failed gathering never receives an artifact yield bonus even when a small fallback harvest is found', () => {
  const p = player();
  assert.equal(herbYield(p, [0, 0, 0]), 1);
  p.character!.inventory['frontier-helpful-trowel'] = 1;
  p.character!.equipment = { artifact: 'frontier-helpful-trowel' };
  assert.equal(herbYield(p, [0, 0, 0]), 1);
  assert.equal(herbYield(p, [0, .999]), 0);
});

test('knowing a frontier region or guessing a site or map ID cannot bypass the hidden entrance gate', () => {
  for (const site of FANTASY_FRONTIER_DUNGEONS) {
    const p = player(site.location); p.character!.charted.push(site.location);
    p.character!.inventory[`map-dungeon-${site.id}`] = 1;
    const before = structuredClone(p);
    const rejected = applyFantasyAction(p, { type: 'dungeonEnter', site: site.id }, () => .999);
    assert.ok(rejected.error, site.id); assert.equal(rejected.changed, false);
    assert.deepEqual(rejected.profile, before);
    p.character!.dungeon = { sites: {}, known: [site.id] };
    const entered = applyFantasyAction(p, { type: 'dungeonEnter', site: site.id }, () => .999);
    assert.equal(entered.error, undefined, site.id); assert.equal(entered.profile.character!.dungeon!.active!.site, site.id);
  }
});

test('successful exploration discovers every frontier site through the actual search and enables entry', () => {
  for (const site of FANTASY_FRONTIER_DUNGEONS) {
    const p = player(site.location);
    const explored = applyFantasyAction(p, { type: 'explore' }, sequence(.999, 0, .349999, .999));
    assert.equal(explored.error, undefined, site.id);
    assert.deepEqual(explored.profile.character!.dungeon?.known, [site.id], site.id);
    assert.ok(explored.profile.log.some(entry => entry.text === `expedition:discovered:${site.id}`));
    const entered = applyFantasyAction(explored.profile, { type: 'dungeonEnter', site: site.id }, () => .999);
    assert.equal(entered.error, undefined, site.id); assert.equal(entered.profile.character!.dungeon!.active!.site, site.id);
  }
});

test('discovery requires exploration success, a draw below 35 percent and a separate successful perception check', () => {
  for (const rolls of [[0], [.999, 0, .35], [.999, 0, .999], [.999, 0, 0, 0]]) {
    const result = applyFantasyAction(player(), { type: 'explore' }, sequence(...rolls));
    assert.equal(result.error, undefined);
    assert.deepEqual(result.profile.character!.dungeon?.known ?? [], [], JSON.stringify(rolls));
    assert.ok(!result.profile.log.some(entry => entry.text.startsWith('expedition:discovered:')));
  }
});

test('the engine uses DC17 for hidden ruins and DC15 for hidden caves at their exact roll boundaries', () => {
  for (const [siteId, failedRoll, successfulRoll] of [
    ['frontier-root-archive', .7, .75], ['frontier-prism-hollow', .65, .7],
  ] as const) {
    const site = FANTASY_FRONTIER_DUNGEONS.find(site => site.id === siteId)!;
    for (const [roll, expected] of [[failedRoll, []], [successfulRoll, [siteId]]] as const) {
      const p = player(site.location); p.character!.inventory = { 'everglow-lantern': 1, 'travel-umbrella': 1 };
      const result = applyFantasyAction(p, { type: 'explore' }, sequence(.999, 0, 0, roll));
      assert.equal(result.error, undefined);
      assert.deepEqual(result.profile.character!.dungeon?.known ?? [], expected, `${siteId}: ${roll}`);
    }
  }
});

test('an already discovered entrance is not rediscovered or duplicated by subsequent exploration', () => {
  const site = FANTASY_FRONTIER_DUNGEONS[0], p = player(site.location);
  p.character!.dungeon = { sites: {}, known: [site.id] };
  const result = applyFantasyAction(p, { type: 'explore' }, () => .999);
  assert.equal(result.error, undefined); assert.deepEqual(result.profile.character!.dungeon!.known, [site.id]);
  assert.ok(!result.profile.log.some(entry => entry.text.startsWith('expedition:discovered:')));
});

test('immediate base camping avoids incidents while the inland engine path still permits an attack', () => {
  const base = player(FANTASY_FRONTIER_BASE), inland = player();
  base.character!.hp = inland.character!.hp = 40;
  const safe = applyFantasyAction(base, { type: 'rest' }, sequence(0, .5));
  const attacked = applyFantasyAction(inland, { type: 'rest' }, sequence(0, .5));
  assert.equal(safe.error, undefined); assert.equal(attacked.error, undefined);
  assert.equal(safe.profile.character!.hp, 66);
  assert.ok(attacked.profile.character!.hp < safe.profile.character!.hp);
  assert.equal(safe.profile.character!.gold, base.character!.gold);
});

test('scheduled base camps finish without a monster interruption while inland camps retain deterministic ambush risk', () => {
  let inlandAttacks = 0;
  for (let seed = 1; seed <= 80; seed++) {
    for (const location of [FANTASY_FRONTIER_BASE, 'frontier-rainforest']) {
      const p = player(location); p.character!.hp = 40; p.character!.fatigue = 70;
      const reserved = startFantasyActivity(p, { type: 'rest' }, 12, () => seed / 81, { camp: true });
      assert.equal(reserved.error, undefined);
      const result = advanceFantasyWorld(reserved.profile, 20, { ambush: true });
      assert.equal(result.error, undefined);
      if (location === FANTASY_FRONTIER_BASE) {
        assert.equal(result.profile.event, null); assert.equal(result.profile.activity, undefined);
        assert.equal(result.profile.character!.hp, 66); assert.equal(result.profile.character!.hour, 20);
      } else if (result.profile.event) {
        inlandAttacks++; assert.ok(result.profile.character!.hour < 20);
        assert.equal(result.profile.character!.hp, 40);
      }
    }
  }
  assert.ok(inlandAttacks > 0);
});

test('entrance discovery and artifact result logs resolve to player text in Korean, English and Japanese', () => {
  const site = FANTASY_FRONTIER_DUNGEONS[0];
  for (const locale of ['ko', 'en', 'ja'] as const) {
    assert.ok(fantasyExpeditionText(`expedition:discovered:${site.id}`, locale)?.includes(site.names[locale]));
    assert.ok(fantasyExpeditionText('expedition:artifact:frontier-helpful-trowel', locale));
    assert.ok(fantasyExpeditionText('expedition:ruin-empty', locale));
  }
});

test('the real entrance panel hides unknown frontier names and reveals discovered names in all three languages', () => {
  const require = createRequire(import.meta.url), react = require('react') as typeof import('react');
  const original = react.useSyncExternalStore;
  react.useSyncExternalStore = (subscribe, snapshot) => original(subscribe, snapshot, snapshot);
  const socket = require.resolve('../client/src/net/ws.ts');
  require.cache[socket] = { id: socket, filename: socket, loaded: true, exports: { send: () => {} } } as NodeModule;
  const { FantasyDungeonEntrances } = require('../client/src/world/FantasyDungeonPanel.tsx') as typeof import('../client/src/world/FantasyDungeonPanel.tsx');
  const { setLocale } = require('../client/src/locale.ts') as typeof import('../client/src/locale.ts');
  const { set } = require('../client/src/store.ts') as typeof import('../client/src/store.ts');
  const site = FANTASY_FRONTIER_DUNGEONS[0];
  try {
    for (const locale of ['ko', 'en', 'ja'] as const) {
      const p = player(site.location), c = p.character!;
      setLocale(locale); set({ fantasyProfile: p, fantasyParty: null, wsConnected: true });
      const render = () => renderToStaticMarkup(createElement(FantasyDungeonEntrances, { c, blocked: false, onAction: () => {} }));
      assert.equal(render(), '');
      c.dungeon = { sites: {}, known: [site.id] };
      set({ fantasyProfile: { ...p } });
      assert.ok(render().includes(site.names[locale]));
    }
  } finally { react.useSyncExternalStore = original; }
});

test('frontier actions never offer the mainland profession events of any job', () => {
  for (const job of FANTASY_JOBS) {
    const p = player(), c = p.character!; c.job = job.id; c.jobXp[job.id] = 0;
    const result = applyFantasyAction(p, { type: 'gather', resource: 'herbs' }, sequence(.999, .999, 0, 0));
    assert.equal(result.error, undefined, job.id); assert.equal(result.profile.event, null, job.id);
  }
});

test('random event routing admits an explicit frontier venue while excluding a generic mainland scene', () => {
  const original = [...FANTASY_EVENTS];
  const scene: FantasyEvent = { id: 'test-mainland-scene', job: 'warrior', name: 'Market scene', description: 'A mainland market conversation.', choices: [
    { id: 'listen', label: 'Listen', stat: 'intelligence', dc: 1, success: 'Heard.', failure: 'Missed.', gold: 0 },
  ] };
  const local: FantasyEvent = { ...scene, id: 'test-frontier-scene', locations: ['frontier-rainforest'], name: 'Trail scene', description: 'A scene on this trail.' };
  try {
    FANTASY_EVENTS.unshift(scene, local);
    const result = applyFantasyAction(player(), { type: 'gather', resource: 'herbs' }, sequence(.999, .999, 0, 0));
    assert.equal(result.error, undefined); assert.equal(result.profile.event, local.id);
    const mainland = player('greenwood');
    const elsewhere = applyFantasyAction(mainland, { type: 'gather', resource: 'herbs' }, sequence(.999, .999, 0, 0));
    assert.equal(elsewhere.error, undefined); assert.equal(elsewhere.profile.event, scene.id);
  } finally { FANTASY_EVENTS.splice(0, FANTASY_EVENTS.length, ...original); }
});

test('failed stationary exploration at the landing cannot open a hostile event that blocks further actions', () => {
  const p = player(FANTASY_FRONTIER_BASE);
  const failed = applyFantasyAction(p, { type: 'explore' }, () => 0);
  assert.equal(failed.error, undefined); assert.equal(failed.profile.character!.location, FANTASY_FRONTIER_BASE);
  assert.equal(failed.profile.event, null); assert.equal(failed.profile.character!.travelPosition, undefined);
  const continued = applyFantasyAction(failed.profile, { type: 'rest' }, () => .999);
  assert.equal(continued.error, undefined); assert.equal(continued.changed, true);
});
