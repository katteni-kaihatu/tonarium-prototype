import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile, fantasyTransports } from './fantasy-engine.ts';
import { fantasyExpeditionQuote, validFantasyExpedition, fantasyExpeditionRuinReward } from './fantasy-expedition.ts';
import { FANTASY_FRONTIER_BASE, FANTASY_FRONTIER_DEPARTURE, FANTASY_FRONTIER_DUNGEONS } from './fantasy-frontier-data.ts';
const player = (job = 'warrior', grade: 3 | 4 = 4) => {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: 'Explorer' }, () => .5).profile;
  Object.assign(p.character!, { job, guildProgress: { version: 1, grade, completedAtGrade: 0, creditedQuests: [] }, encounterTier: grade, gold: 1000 }); p.character!.jobXp[job] = 0; return p;
};
test('guild recruitment requires actual eligible Gold registration and cannot use suppressed criminal ranks', () => {
  const p = player(); assert.equal(fantasyExpeditionQuote(p.character!, 'guild').eligible, true);
  p.character!.guildProgress = undefined; assert.equal(fantasyExpeditionQuote(p.character!, 'guild').eligible, false);
  assert.equal(fantasyExpeditionQuote(player('warrior', 3).character!, 'guild').eligible, false);
  assert.equal(fantasyExpeditionQuote(player('thief').character!, 'guild').eligible, false);
});
test('enlisting reveals only the landing and physical entry uses the departure harbor', () => {
  const p = player(), joined = applyFantasyAction(p, { type: 'expeditionJoin', route: 'guild' });
  assert.equal(joined.error, undefined); assert.ok(joined.profile.character!.charted.includes(FANTASY_FRONTIER_BASE));
  const c = joined.profile.character!;
  assert.ok(!fantasyTransports(c, FANTASY_FRONTIER_BASE).some(t => t.available));
  c.location = FANTASY_FRONTIER_DEPARTURE;
  assert.ok(fantasyTransports(c, FANTASY_FRONTIER_BASE).some(t => t.available && t.id === 'ship'));
  assert.ok(!fantasyTransports(c, FANTASY_FRONTIER_BASE).some(t => t.available && t.id === 'airship'));
  const forged = player(); forged.character!.location = FANTASY_FRONTIER_DEPARTURE; forged.character!.charted.push(FANTASY_FRONTIER_BASE);
  assert.ok(!fantasyTransports(forged.character!, FANTASY_FRONTIER_BASE).some(t => t.available));
});
test('criminals need the local illegal contact and Gold-equivalent power; lawful members cannot use the illegal route', () => {
  const p = player('thief'); p.character!.location = FANTASY_FRONTIER_DEPARTURE;
  assert.equal(fantasyExpeditionQuote(p.character!, 'smuggler').eligible, true);
  p.character!.encounterTier = 3; assert.equal(fantasyExpeditionQuote(p.character!, 'smuggler').eligible, false);
  const lawful = player(); lawful.character!.location = FANTASY_FRONTIER_DEPARTURE;
  assert.equal(fantasyExpeditionQuote(lawful.character!, 'smuggler').eligible, false);
});
test('ruin clear rolls once at the exact 30 percent boundary including failed outcomes', () => {
  const ruin = FANTASY_FRONTIER_DUNGEONS.find(s => s.kind === 'ruin')!;
  for (const [roll, success] of [[.299999, true], [.3, false]] as const) {
    const c = player().character!; c.expedition = { route: 'guild', issuedAt: c.hour };
    c.dungeon = { sites: { [ruin.id]: { revealed: ruin.rooms.map(r => r.id), inspected: [], findings: [], detected: [], disarmed: [], sprung: [], claimed: [], inspectionDays: {}, cleared: ruin.rooms.filter(r => r.enemy?.boss).map(r => r.id) } } };
    const reward = fantasyExpeditionRuinReward(c, ruin.id, () => roll);
    assert.equal(!!reward?.item, success); assert.equal(c.expedition.ruinRolls!.length, 1);
    assert.equal(fantasyExpeditionRuinReward(c, ruin.id, () => 0), undefined);
    assert.equal(validFantasyExpedition(c), true);
  }
});
