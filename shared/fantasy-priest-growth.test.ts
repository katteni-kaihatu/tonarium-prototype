import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyFantasyAction, advanceFantasyWorld, fantasySkills, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { applyFantasyPrayer } from './fantasy-prayer.ts';
import { applyFantasyPriestAction, fantasyPriestActionError, fantasyPriestDiscoveredBranches, fantasyPriestGrowthStatus, fantasyPriestServiceQuest, fantasyPriestSkills, syncFantasyPriestGrowth, validFantasyPriestGrowth } from './fantasy-priest-growth.ts';
import { validFantasyProgression } from './fantasy-progression.ts';
import { FantasyStore } from '../server/fantasy-store.ts';
import { FANTASY_QUESTS } from './fantasy-data.ts';

function profile() {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: '순례 사제' }, () => .99).profile;
  const c = p.character!; c.job = 'priest'; c.jobXp.priest = 30; c.gold = 500; c.hour = 12;
  c.visited = ['hearth', 'suncourt', 'greenwood']; c.readBooks = ['traveler-guide']; c.quests = ['quest-herbalist']; c.inventory.herb = 3;
  return p;
}
function qualified() {
  let p = profile();
  p = applyFantasyAction(p, { type: 'priestVow', quest: 'quest-herbalist' }, () => .99).profile;
  p = applyFantasyAction(p, { type: 'complete', quest: 'quest-herbalist' }, () => .99).profile;
  for (let day = 1; day <= 4; day++) { p.character!.hour = day * 24 + 12; assert.equal(applyFantasyPrayer(p.character!).error, undefined); }
  p.character!.readBooks = ['traveler-guide', 'remedies-and-rites'];
  return p;
}
function deepen(c: NonNullable<ReturnType<typeof qualified>['character']>) {
  c.jobXp.priest = 100;
  c.completed = [...new Set([...c.completed, ...FANTASY_QUESTS.filter(quest => fantasyPriestServiceQuest(quest.id)).slice(0, 6).map(quest => quest.id)])];
  c.readBooks = ['traveler-guide', 'remedies-and-rites', 'words-and-promises', 'quiet-sword'];
  syncFantasyPriestGrowth(c);
}

test('priest evidence uses real completed service, reading and distinct temple visits exactly once', () => {
  const c = profile().character!;
  syncFantasyPriestGrowth(c); const before = structuredClone(c.priestGrowth);
  syncFantasyPriestGrowth(c); assert.deepEqual(c.priestGrowth, before);
  const s = fantasyPriestGrowthStatus(c); assert.equal(s.service, 0); assert.equal(s.doctrine, 1); assert.equal(s.pilgrimage, 2); assert.equal(s.vows, 0);
  assert.equal(validFantasyPriestGrowth(c), true);
  c.job = 'thief'; const past = structuredClone(c.priestGrowth); c.completed.push('quest-herbalist'); syncFantasyPriestGrowth(c); assert.deepEqual(c.priestGrowth, past);
});

test('only accepted service can be sworn; honest release earns no fulfillment and cannot repeat the same vow', () => {
  const c = profile().character!;
  assert.ok(applyFantasyPriestAction(c, { type: 'priestVow', quest: 'quest-watch' }).error);
  assert.equal(applyFantasyPriestAction(c, { type: 'priestVow', quest: 'quest-herbalist' }).error, undefined);
  assert.ok(applyFantasyPriestAction(c, { type: 'priestVow', quest: 'quest-herbalist' }).error);
  assert.equal(applyFantasyPriestAction(c, { type: 'priestReleaseVow' }).error, undefined);
  assert.equal(fantasyPriestGrowthStatus(c).vows, 0); assert.ok(applyFantasyPriestAction(c, { type: 'priestVow', quest: 'quest-herbalist' }).error);
  assert.equal(validFantasyPriestGrowth(c), true);
});

test('actual quest reporting fulfills a vow while abandonment records an unrewarded release', () => {
  let p = profile(); p = applyFantasyAction(p, { type: 'priestVow', quest: 'quest-herbalist' }).profile;
  const abandoned = applyFantasyAction(p, { type: 'abandon', quest: 'quest-herbalist' });
  assert.equal(abandoned.error, undefined); assert.equal(abandoned.profile.character!.priestGrowth!.vow, undefined);
  assert.equal(abandoned.profile.character!.priestGrowth!.vows[0].outcome, 'released');
  const result = applyFantasyAction(p, { type: 'complete', quest: 'quest-herbalist' });
  assert.equal(result.error, undefined); assert.equal(fantasyPriestGrowthStatus(result.profile.character!).service, 1);
  assert.equal(result.profile.character!.priestGrowth!.vows[0].outcome, 'fulfilled');
  assert.equal(validFantasyPriestGrowth(result.profile.character!), true);
});

test('daily prayer is capped as faith evidence and cannot substitute for service, study, pilgrimage or vows', () => {
  const c = profile().character!; c.readBooks = []; c.visited = ['hearth'];
  for (let day = 0; day < 40; day++) { c.hour = day * 24 + 12; applyFantasyPrayer(c); }
  assert.equal(c.priestGrowth!.prayerDays.length, 30); assert.equal(fantasyPriestGrowthStatus(c).eligible, false);
  assert.ok(fantasyPriestActionError(c, { type: 'priestBranch', branch: 'care' }));
  const copy = structuredClone(c); assert.ok(applyFantasyPrayer(c).error); assert.deepEqual(c, copy);
  assert.equal(validFantasyPriestGrowth(c), true);
});

test('qualified priest chooses one path and pays for changes at a trusted temple after the cooldown', () => {
  const c = qualified().character!; assert.equal(fantasyPriestGrowthStatus(c).eligible, true);
  assert.equal(applyFantasyPriestAction(c, { type: 'priestBranch', branch: 'care' }).error, undefined);
  deepen(c);
  const gold = c.gold; c.skillXp = { 'priest-care-mercy': 8 }; const xp = c.jobXp.priest;
  assert.deepEqual(fantasyPriestSkills(c).map(skill => skill.id).sort(), ['priest-care-hands', 'priest-care-holy-strike', 'priest-care-mercy']); assert.ok(applyFantasyPriestAction(c, { type: 'priestBranch', branch: 'ward' }).error);
  c.hour += 24; c.location = 'greenwood'; assert.ok(applyFantasyPriestAction(c, { type: 'priestBranch', branch: 'ward' }).error);
  c.location = 'hearth'; c.gold = 119; assert.ok(applyFantasyPriestAction(c, { type: 'priestBranch', branch: 'ward' }).error);
  c.gold = gold; assert.equal(applyFantasyPriestAction(c, { type: 'priestBranch', branch: 'ward' }).error, undefined);
  assert.equal(c.gold, gold - 120); assert.equal(c.jobXp.priest, xp); assert.equal(c.skillXp['priest-care-mercy'], 8);
  assert.equal(c.priestGrowth!.branchChanges, 1); assert.equal(fantasyPriestSkills(c).some(skill => skill.id === 'priest-care-mercy'), false);
  assert.equal(validFantasyPriestGrowth(c), true); assert.equal(validFantasyProgression(c), true);
});

test('path skills become real learned skills and effective healing trains them without exposing other paths', () => {
  let p = qualified(); p = applyFantasyAction(p, { type: 'priestBranch', branch: 'care' }).profile;
  assert.equal(fantasySkills(p.character!).some(skill => skill.id === 'priest-ward-aegis'), false);
  p.character!.hp = 1; p.character!.mp = 30; const before = p.character!.hp;
  const used = applyFantasyAction(p, { type: 'skill', skill: 'priest-care-mercy' });
  assert.equal(used.error, undefined); assert.ok(used.profile.character!.hp > before); assert.ok(used.profile.character!.skillXp!['priest-care-mercy'] > 0);
  assert.equal(validFantasyProgression(used.profile.character!), true);
});

test('path choice is a shared-clock activity that gives no branch or charge before completion', () => {
  const p = qualified(), c = p.character!, hour = c.hour;
  const started = startFantasyActivity(p, { type: 'priestBranch', branch: 'care' }, hour, () => .99);
  assert.equal(started.error, undefined); assert.equal(started.profile.activity!.endsAt - hour, 1);
  assert.equal(started.profile.character!.priestGrowth!.branch, undefined);
  assert.equal(advanceFantasyWorld(started.profile, hour + .5).profile.character!.priestGrowth!.branch, undefined);
  const done = advanceFantasyWorld(started.profile, hour + 1); assert.equal(done.error, undefined); assert.equal(done.profile.character!.priestGrowth!.branch, 'care');
  assert.equal(validFantasyPriestGrowth(done.profile.character!), true);
});

test('temple trust is local and malformed or unearned priest records are rejected', () => {
  const c = qualified().character!, s = fantasyPriestGrowthStatus(c);
  assert.ok(s.templeTrust.hearth > s.templeTrust.suncourt);
  const forged = structuredClone(c); forged.priestGrowth!.service.push('quest-ore'); assert.equal(validFantasyPriestGrowth(forged), false);
  const future = structuredClone(c); future.priestGrowth!.prayerDays.push(999); assert.equal(validFantasyPriestGrowth(future), false);
  const bad = structuredClone(c); (bad.priestGrowth!.vows[0] as { outcome: string }).outcome = 'imagined'; assert.equal(validFantasyPriestGrowth(bad), false);
  assert.equal(validFantasyPriestGrowth(c), true);
});

test('a veteran with completed services can qualify without an impossible new vow on exhausted quests', () => {
  const c = profile().character!;
  c.quests = []; c.completed = FANTASY_QUESTS.filter(quest => quest.giver === 'hearth' && fantasyPriestServiceQuest(quest.id) && ['herb', 'meal', 'potion', 'antidote', 'jerky', 'bread'].includes(quest.item)).slice(0, 3).map(quest => quest.id);
  assert.equal(c.completed.length, 3); c.hour = 36; applyFantasyPrayer(c); syncFantasyPriestGrowth(c);
  assert.equal(fantasyPriestGrowthStatus(c).vows, 0); assert.equal(fantasyPriestGrowthStatus(c).eligible, true);
  assert.equal(applyFantasyPriestAction(c, { type: 'priestBranch', branch: 'pilgrim' }).error, undefined);
  assert.equal(validFantasyPriestGrowth(c), true);
});

test('server save and restart preserve a chosen path and effective skill practice while rejecting forged evidence', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-priest-growth-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'fantasy.json'); let p = qualified();
  p = applyFantasyAction(p, { type: 'priestBranch', branch: 'care' }).profile;
  fs.writeFileSync(file, JSON.stringify({ alice: p })); const store = new FantasyStore(file); assert.equal(store.loadError, undefined);
  const before = structuredClone(store.profile('alice').character!);
  const restored = new FantasyStore(file); assert.equal(restored.loadError, undefined); assert.deepEqual(restored.profile('alice').character!.priestGrowth, before.priestGrowth);
  const forged = structuredClone(p); forged.character!.priestGrowth!.service.push('quest-ore'); fs.writeFileSync(file, JSON.stringify({ alice: forged }));
  assert.ok(new FantasyStore(file, { onError: () => {} }).loadError);
});

test('changing a priest path needs deeper faith and practice without revealing the hidden thresholds', () => {
  const c = qualified().character!; applyFantasyPriestAction(c, { type: 'priestBranch', branch: 'care' }); c.hour += 24;
  const before = structuredClone(c), errors = (['ko', 'en', 'ja'] as const).map(locale => fantasyPriestActionError(c, { type: 'priestBranch', branch: 'ward' }, locale)!);
  assert.ok(errors.every(error => !!error && !/\d|faith|practice|봉사|교리|성소|숙련|神殿|奉仕|教理|熟練/i.test(error)));
  assert.ok(applyFantasyPriestAction(c, { type: 'priestBranch', branch: 'ward' }).error); assert.deepEqual(c, before);
  c.jobXp.priest = 100; assert.ok(applyFantasyPriestAction(c, { type: 'priestBranch', branch: 'ward' }).error);
  c.jobXp.priest = 30; deepen(c); c.jobXp.priest = 99; assert.ok(applyFantasyPriestAction(c, { type: 'priestBranch', branch: 'ward' }).error);
  c.jobXp.priest = 100; assert.equal(applyFantasyPriestAction(c, { type: 'priestBranch', branch: 'ward' }).error, undefined);
  assert.equal(c.priestGrowth!.branch, 'ward');
});

test('the original low-faith priest path remains valid after the stricter path-change rule', () => {
  const c = qualified().character!; c.readBooks = ['traveler-guide']; assert.equal(fantasyPriestGrowthStatus(c).faith, 20);
  applyFantasyPriestAction(c, { type: 'priestBranch', branch: 'pilgrim' });
  assert.equal(validFantasyPriestGrowth(c), true); assert.ok(fantasyPriestSkills(c).some(skill => skill.id === 'priest-pilgrim-lantern'));
});

test('a newly chosen priest path requires discovery from a completed book without naming the missing clue', () => {
  const c = qualified().character!; c.readBooks = ['traveler-guide'];
  assert.equal(fantasyPriestGrowthStatus(c).eligible, true);
  assert.deepEqual(fantasyPriestDiscoveredBranches(c).map(branch => branch.id), ['pilgrim']);
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const error = fantasyPriestActionError(c, { type: 'priestBranch', branch: 'care' }, locale)!;
    assert.ok(error); assert.ok(!/\d|remedies|book|도서|책|의식의 절차|本|手順/i.test(error));
  }
  assert.ok(applyFantasyPriestAction(c, { type: 'priestBranch', branch: 'care' }).error);
  c.readBooks.push('remedies-and-rites');
  assert.equal(applyFantasyPriestAction(c, { type: 'priestBranch', branch: 'care' }).error, undefined);
});

test('an existing priest path remains visible and usable without its newly assigned discovery book', () => {
  const c = qualified().character!; applyFantasyPriestAction(c, { type: 'priestBranch', branch: 'care' });
  c.readBooks = ['traveler-guide']; c.priestGrowth!.doctrine = ['traveler-guide'];
  assert.equal(validFantasyPriestGrowth(c), true); assert.ok(fantasyPriestDiscoveredBranches(c).some(branch => branch.id === 'care'));
  assert.ok(fantasyPriestSkills(c).some(skill => skill.id === 'priest-care-mercy'));
  assert.ok(!fantasyPriestDiscoveredBranches(c).some(branch => branch.id === 'ward'));
});

test('a priest learns of a path only after its actual library reading finishes, without gaining its skills', () => {
  const p = qualified(); p.character!.readBooks = ['traveler-guide']; p.character!.location = 'suncourt'; p.character!.hour = 108;
  const started = startFantasyActivity(p, { type: 'read', book: 'remedies-and-rites' }, 108, () => .99); assert.equal(started.error, undefined);
  assert.ok(!fantasyPriestDiscoveredBranches(started.profile.character!).some(branch => branch.id === 'care'));
  const halfway = advanceFantasyWorld(started.profile, 108.5).profile; assert.ok(!fantasyPriestDiscoveredBranches(halfway.character!).some(branch => branch.id === 'care'));
  const done = advanceFantasyWorld(halfway, 109).profile; assert.ok(fantasyPriestDiscoveredBranches(done.character!).some(branch => branch.id === 'care'));
  assert.ok(!fantasyPriestSkills(done.character!).some(skill => skill.id === 'priest-care-mercy')); assert.equal(done.character!.priestGrowth!.branch, undefined);
});

test('combat support faith accepts canonical proof while rejecting forged duplicated and over-budget evidence',()=>{
 const c=profile().character!;syncFantasyPriestGrowth(c);const before=fantasyPriestGrowthStatus(c).faith;
 c.priestGrowth!.support=[{battle:'aid',day:0,points:2,hour:12}];c.combatVictories={'service:aid':12};
 assert.equal(fantasyPriestGrowthStatus(c).faith,before+2);assert.ok(validFantasyPriestGrowth(c));
 for(const mode of ['proof','duplicate','points','day','future','unknown','daily','lifetime'] as const){const copy=structuredClone(c),support=copy.priestGrowth!.support!;
  if(mode==='proof')delete copy.combatVictories!['service:aid'];if(mode==='duplicate')support.push({...support[0]});
  if(mode==='points')(support[0] as {points:number}).points=3;if(mode==='day')support[0].day=1;
  if(mode==='future')support[0].hour=13;if(mode==='unknown')Object.assign(support[0],{extra:true});
  if(mode==='daily'||mode==='lifetime'){const count=mode==='daily'?3:21;support.length=0;copy.hour=count*24;for(let i=0;i<count;i++){const hour=mode==='daily'?12:i*24;support.push({battle:`b${i}`,day:Math.floor(hour/24),points:2,hour});copy.combatVictories![`service:b${i}`]=hour;}}
  assert.equal(validFantasyPriestGrowth(copy),false,mode);
 }
 const legacy=structuredClone(c);delete legacy.priestGrowth!.support;delete legacy.combatVictories;assert.ok(validFantasyPriestGrowth(legacy));assert.equal(fantasyPriestGrowthStatus(legacy).faith,before);
});
