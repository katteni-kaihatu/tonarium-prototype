import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile, fantasyStats } from './fantasy-engine.ts';
import { fantasyCircleKnowledge, grantFantasyCircleBasics, fantasyCompileCircle, fantasyCircleNodeCapacity, learnFantasyCircleBook, learnFantasyCircleDungeon, validFantasyCircleKnowledge, validFantasyCircleShape, completeFantasyCirclePrayer, fantasyCircleDiscoveryText } from './fantasy-magic-circle.ts';
import { fantasyMagicDiscoveryTranslation } from './fantasy-magic-discovery.ts';
import { applyFantasySpecialization, validFantasySpecialization, fantasySpecializationHours, fantasySpecializationText } from './fantasy-specializations.ts';

function player(job = 'mage') {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Rune', gender: 'female' }, () => .999).profile;
  const c = p.character!; c.job = job; c.jobXp[job] = 0; c.mp = 100; return p;
}
const cast = (p: ReturnType<typeof player>, action: Parameters<typeof applyFantasySpecialization>[1]) => applyFantasySpecialization(p, action, () => .5, { stats: fantasyStats(p.character!), check: () => true, addItem: () => {}, hurt: () => {} })!;

test('mage admission grants four elements and basic runes; physical remains discovered', () => {
  const c = player().character!;
  grantFantasyCircleBasics(c);
  assert.deepEqual(fantasyCircleKnowledge(c).cores, ['flame', 'tide', 'gale', 'stone']);
  assert.deepEqual(fantasyCircleKnowledge(c).runes, ['focus', 'scatter', 'economy']);
  assert.equal(fantasyCompileCircle(c, 'physical', []), undefined);
  assert.equal(learnFantasyCircleBook(c, 'rune-physical').length, 1);
  assert.equal(fantasyCompileCircle(c, 'physical', [])?.magic, false);
  assert.equal(learnFantasyCircleBook(c, 'rune-physical').length, 0);
});

test('rune modifiers change effective values, remain bounded and preserve repeated slots', () => {
  const c = player().character!; grantFantasyCircleBasics(c);
  const base = fantasyCompileCircle(c, 'flame', [])!;
  const focus = fantasyCompileCircle(c, 'flame', ['scatter', 'focus'])!;
  const scatter = fantasyCompileCircle(c, 'flame', ['scatter'])!;
  const economy = fantasyCompileCircle(c, 'flame', ['economy'])!;
  assert.ok(focus.power > base.power); assert.ok(focus.reach < base.reach);
  assert.ok(scatter.power < base.power); assert.ok(scatter.radius > base.radius);
  assert.ok(economy.mp < base.mp); assert.ok(economy.power < base.power);
  assert.equal(fantasyCompileCircle(c, 'flame', ['focus', 'focus']), undefined);
  const repeated = fantasyCompileCircle(c, 'flame', ['economy', 'economy'])!;
  assert.deepEqual(repeated.runes, ['economy', 'economy']); assert.ok(repeated.mp < economy.mp);
  assert.ok(validFantasyCircleShape({ core: 'flame', runes: ['economy', 'economy'] }));
  assert.equal(fantasyCompileCircle(c, 'flame', ['focus', 'scatter', 'economy']), undefined);
  c.jobXp.mage = 100;
  const all = fantasyCompileCircle(c, 'flame', ['economy', 'focus', 'scatter'])!;
  assert.ok(all.power > 0 && all.power <= 100 && all.mp >= 2 && all.mp <= 60 && all.radius <= 2 && all.reach >= 1);
  assert.deepEqual(all, fantasyCompileCircle(c, 'flame', ['scatter', 'economy', 'focus']));
});

test('node thresholds use current job and retained knowledge does not bypass profession restrictions', () => {
  const c = player().character!; grantFantasyCircleBasics(c);
  for (const [xp, capacity] of [[0, 2], [29, 2], [30, 4], [99, 4], [100, 6]]) { c.jobXp.mage = xp; assert.equal(fantasyCircleNodeCapacity(c), capacity); }
  c.job = 'priest'; c.jobXp.priest = 0; grantFantasyCircleBasics(c);
  assert.equal(fantasyCircleNodeCapacity(c), 2);
  assert.equal(fantasyCompileCircle(c, 'flame', []), undefined);
  assert.equal(fantasyCompileCircle(c, 'healing', [])?.kind, 'heal');
  c.job = 'cook'; assert.equal(fantasyCompileCircle(c, 'healing', []), undefined);
});

test('circle validation rejects forged components, duplicate receipts and client supplied calculated fields', () => {
  const c = player().character!; grantFantasyCircleBasics(c);
  assert.ok(validFantasyCircleKnowledge(c));
  assert.ok(validFantasyCircleShape({ core: 'flame', runes: ['focus', 'scatter'] }));
  for (const shape of [{ core: 'flame', runes: ['focus'], power: 999 }, { core: 'void', runes: [] }]) assert.equal(validFantasyCircleShape(shape), false);
  const clean = structuredClone(c.circleKnowledge!);
  for (const invalid of [{ ...clean, cores: [...clean.cores, 'void'] }, { ...clean, discoveries: ['admission:mage', 'admission:mage'] }, { ...clean, power: 999 }, { ...clean, prayerFailures: -1 }]) {
    c.circleKnowledge = invalid as never; assert.equal(validFantasyCircleKnowledge(c), false);
  }
});

test('legacy migration uses job admission and books but does not invent specialized or physical knowledge', () => {
  const c = player().character!; c.readBooks = ['rune-reach'];
  const before = JSON.stringify(c), knowledge = fantasyCircleKnowledge(c);
  assert.ok(knowledge.runes.includes('reach')); assert.ok(knowledge.cores.includes('flame'));
  assert.ok(!knowledge.cores.includes('star')); assert.ok(!knowledge.cores.includes('physical'));
  assert.equal(JSON.stringify(c), before);
  grantFantasyCircleBasics(c); assert.ok(validFantasyCircleKnowledge(c));
  assert.equal(learnFantasyCircleDungeon(c, 'magic-core-physical').length, 1);
  assert.equal(learnFantasyCircleDungeon(c, 'magic-core-physical').length, 0);
});

test('prayer grants eligible runes only once per completed day and never grants miracle', () => {
  const c = player('priest').character!; grantFantasyCircleBasics(c); c.hour = 48; c.lastPrayerDay = 2;
  const learned = completeFantasyCirclePrayer(c, 2, () => 0);
  assert.equal(learned.length, 1); assert.ok(!fantasyCircleKnowledge(c).runes.includes('miracle'));
  const before = JSON.stringify(c); assert.deepEqual(completeFantasyCirclePrayer(c, 2, () => 0), []); assert.equal(JSON.stringify(c), before);
  assert.ok(validFantasyCircleKnowledge(c));
});

test('composing persists only recipe while world attack is rejected and priest healing costs real MP', () => {
  let p = player(); grantFantasyCircleBasics(p.character!);
  const before = JSON.stringify(p);
  let result = cast(p, { type: 'magicCompose', slot: 1, core: 'flame', runes: ['focus', 'scatter'] });
  assert.equal(result.error, undefined); assert.equal(JSON.stringify(p), before); p = result.profile;
  assert.ok(p.character!.specialization!.spells![0].circle); assert.ok(validFantasySpecialization(p.character!));
  assert.equal(fantasySpecializationHours(p, { type: 'magicCompose', slot: 1, core: 'flame', runes: [] }), 1);
  result = cast(p, { type: 'magicCast', slot: 1 }); assert.ok(result.error); assert.equal(result.changed, false);
  p = player('priest'); grantFantasyCircleBasics(p.character!); p.character!.hp = 1;
  p = cast(p, { type: 'magicCompose', slot: 1, core: 'healing', runes: [] }).profile;
  const cost = fantasyCompileCircle(p.character!, 'healing', [])!.mp;
  result = cast(p, { type: 'magicCast', slot: 1 }); assert.equal(result.error, undefined);
  assert.ok(result.profile.character!.hp > 1); assert.equal(result.profile.character!.mp, p.character!.mp - cost);
});

test('composed specialty recipes remain valid after changing profession but cannot be cast', () => {
  let p = player('priest');
  p.character!.priestGrowth = { version: 1, branch: 'paladin', startedAt: 0, service: [], doctrine: [], pilgrimage: [], prayerDays: [], prayerTemples: {}, vows: [], branchChanges: 0 } as never;
  p = cast(p, { type: 'magicCompose', slot: 1, core: 'blessing', runes: [] }).profile;
  assert.equal(p.character!.specialization!.spells![0].circle!.core, 'blessing');
  p.character!.job = 'cook';
  assert.ok(validFantasySpecialization(p.character!));
  assert.ok(cast(p, { type: 'magicCast', slot: 1 }).error);
});

test('new circle log names and tactical target rejection translate in all supported languages', () => {
  const p = player();
  const result = cast(p, { type: 'magicCompose', slot: 1, core: 'flame', runes: ['focus', 'scatter'] });
  const source = result.profile.log.at(-1)!.text;
  for (const locale of ['ko', 'en', 'ja'] as const) {
    assert.ok(fantasySpecializationText(source, locale));
    assert.ok(fantasySpecializationText('この魔法には戦闘中の対象が必要です。', locale));
  }
  assert.match(fantasySpecializationText(source, 'en')!, /Flame/);
});

test('book completion reports the first inscription even when the engine already marked the book read', () => {
  const c = player().character!; grantFantasyCircleBasics(c); c.readBooks = ['rune-physical'];
  assert.deepEqual(learnFantasyCircleBook(c, 'rune-physical'), [{ kind: 'core', id: 'physical' }]);
  assert.deepEqual(learnFantasyCircleBook(c, 'rune-physical'), []);
});

test('world purification removes actual weakness while preserving beneficial effects', () => {
  let p = player('priest');
  p.character!.effects = [{ id: 'weakness', expiresAt: p.character!.hour + 8, check: -2 }, { id: 'tonic', expiresAt: p.character!.hour + 8, check: 2 }];
  p = cast(p, { type: 'magicCompose', slot: 1, core: 'pure', runes: [] }).profile;
  const result = cast(p, { type: 'magicCast', slot: 1 });
  assert.equal(result.error, undefined); assert.deepEqual(result.profile.character!.effects!.map(e => e.id), ['tonic']);
});

test('advanced mage attribute nodes have actual effects and require the current specialization', () => {
  const c = player().character!; c.jobXp.mage = 100; c.jobPaths = { mage: { path: 'mage-flame', hour: c.hour } };
  const compiled = fantasyCompileCircle(c, 'tide', ['flame-crest']);
  assert.equal(compiled?.effects.burn, 4);
  grantFantasyCircleBasics(c); c.circleKnowledge = fantasyCircleKnowledge(c);
  c.jobPaths.mage.path = 'mage-ice';
  assert.equal(fantasyCompileCircle(c, 'tide', ['flame-crest']), undefined);
  assert.equal(fantasyCompileCircle(c, 'flame', ['ice-crest'])?.effects.slow, 2);
  c.jobPaths.mage.path = 'mage-earth';
  assert.equal(fantasyCompileCircle(c, 'gale', ['earth-crest'])?.effects.guard, 5);
  c.jobPaths.mage.path = 'mage-wind';
  assert.ok(fantasyCompileCircle(c, 'stone', ['wind-crest'])!.reach > fantasyCompileCircle(c, 'stone', [])!.reach);
  assert.equal(learnFantasyCircleDungeon(c, 'magic-rune-flame-crest').length, 0);
});

test('circle discoveries use the existing log localization entrypoint', () => {
  const components = [{ kind: 'core', id: 'physical' }, { kind: 'rune', id: 'earth-crest' }] as const;
  const source = fantasyCircleDiscoveryText([...components], 'ja');
  assert.equal(fantasyMagicDiscoveryTranslation(source, 'en'), fantasyCircleDiscoveryText([...components], 'en'));
  assert.equal(fantasyMagicDiscoveryTranslation(source, 'ko'), fantasyCircleDiscoveryText([...components], 'ko'));
});

test('a healing circle with purification remains useful at full HP when the caster is poisoned', () => {
  let p = player('priest'); learnFantasyCircleBook(p.character!, 'rune-purification');
  p.character!.hp = fantasyStats(p.character!).hp;
  p.character!.effects = [{ id: 'poison', expiresAt: p.character!.hour + 6, periodicHp: -2 }];
  p = cast(p, { type: 'magicCompose', slot: 1, core: 'healing', runes: ['purify'] }).profile;
  const result = cast(p, { type: 'magicCast', slot: 1 });
  assert.equal(result.error, undefined); assert.deepEqual(result.profile.character!.effects, []);
  assert.ok(result.profile.character!.mp < p.character!.mp);
});

test('miracle needs both the explicit learned rune and the active saint vocation', () => {
  const c = player('priest').character!;
  c.priestGrowth = { version: 1, branch: 'saint', startedAt: 0, service: [], doctrine: [], pilgrimage: [], prayerDays: [], prayerTemples: {}, vows: [], branchChanges: 0 };
  assert.equal(fantasyCompileCircle(c, 'miracle', ['miracle']), undefined);
  learnFantasyCircleBook(c, 'rune-miracle');
  assert.equal(fantasyCompileCircle(c, 'miracle', []), undefined);
  assert.equal(fantasyCompileCircle(c, 'holy', ['miracle']), undefined);
  assert.equal(fantasyCompileCircle(c, 'miracle', ['miracle'])?.effects.revive, true);
  c.priestGrowth!.branch = 'paladin';
  assert.equal(fantasyCompileCircle(c, 'miracle', ['miracle']), undefined);
  assert.equal(fantasyCompileCircle(c, 'blessing', [])?.selfOnly, true);
  assert.equal(fantasyCompileCircle(c, 'blessing', ['scatter']), undefined);
});

test('a recorded star path cannot supply star cores or crests before actual island observation', () => {
  const c = player().character!; c.jobPaths = { mage: { path: 'mage-star', hour: c.hour } };
  grantFantasyCircleBasics(c); c.circleKnowledge!.cores.push('star'); c.circleKnowledge!.runes.push('star-crest');
  assert.equal(fantasyCompileCircle(c, 'star', []), undefined);
  assert.equal(fantasyCompileCircle(c, 'flame', ['star-crest']), undefined);
  c.occult = { version: 1, starObservations: [{ hour: 20, location: 'starfall-isle' }], relicClaims: [], relics: [], usedRelics: [] };
  c.hour = Math.max(c.hour, 20);
  assert.equal(fantasyCompileCircle(c, 'star', [])?.kind, 'attack');
  assert.ok(fantasyCompileCircle(c, 'flame', ['star-crest'])!.power > fantasyCompileCircle(c, 'flame', [])!.power);
});

test('power amplification has diminishing gains and six nodes stay below the fixed amplification ceiling', () => {
  const c = player().character!; c.jobXp.mage = 100; learnFantasyCircleBook(c, 'rune-resonance'); learnFantasyCircleBook(c, 'rune-reach');
  c.jobPaths = { mage: { path: 'mage-star', hour: c.hour } }; c.occult = { version: 1, starObservations: [{ hour: 20, location: 'starfall-isle' }], relicClaims: [], relics: [], usedRelics: [] }; c.hour = Math.max(c.hour, 20);
  const base = fantasyCompileCircle(c, 'star', ['scatter'])!, one = fantasyCompileCircle(c, 'star', ['scatter', 'focus'])!, two = fantasyCompileCircle(c, 'star', ['scatter', 'focus', 'empower'])!, three = fantasyCompileCircle(c, 'star', ['scatter', 'focus', 'empower', 'star-crest'])!;
  assert.ok(one.power - base.power > two.power - one.power); assert.ok(two.power - one.power > three.power - two.power);
  assert.ok(three.power <= Math.ceil(33 * 1.12 * 1.65));
  const all = fantasyCompileCircle(c, 'star', ['focus', 'empower', 'star-crest', 'reach', 'economy', 'scatter'])!;
  assert.ok(all.power < three.power); assert.ok(all.mp >= 2 && all.mp <= 60);
});

test('an actual legacy archive claim learns a reachable circle rune once with a canonical persisted receipt', () => {
  let p = player(); p.character!.location = 'oldwatch'; p.character!.visited.push('oldwatch'); p.character!.inventory.lantern = 1;
  for (const action of [{ type: 'dungeonEnter', site: 'oldwatch' }, { type: 'dungeonMove', room: 'archive' }, { type: 'dungeonInspect' }, { type: 'dungeonDisarm' }, { type: 'dungeonInteract' }] as const) {
    const result = applyFantasyAction(p, action, () => .999); assert.equal(result.error, undefined); p = result.profile;
  }
  assert.ok(fantasyCircleKnowledge(p.character!).runes.includes('empower'));
  assert.ok(p.character!.circleKnowledge!.discoveries.includes('dungeon:magic-rune-empower'));
  assert.ok(validFantasyCircleKnowledge(p.character!));
  const replay = applyFantasyAction(p, { type: 'dungeonInteract' }); assert.ok(replay.error); assert.deepEqual(replay.profile, p);
  assert.deepEqual(learnFantasyCircleDungeon(p.character!, 'magic-rune-empower'), []);
});

test('real guild admission and completed library reading persist circle basics and discovered physical magic', () => {
  let p = player('unassigned');
  const admitted = applyFantasyAction(p, { type: 'job', job: 'mage', via: 'guild' }); assert.equal(admitted.error, undefined); p = admitted.profile;
  assert.deepEqual(p.character!.circleKnowledge!.cores, ['flame', 'tide', 'gale', 'stone']);
  p.character!.location = 'redweave'; p.character!.visited.push('redweave');
  const read = applyFantasyAction(p, { type: 'read', book: 'rune-physical' }); assert.equal(read.error, undefined);
  assert.ok(read.profile.character!.readBooks!.includes('rune-physical'));
  assert.equal(fantasyCompileCircle(read.profile.character!, 'physical', [])?.magic, false);
});

test('an actual completed priest prayer invokes rune discovery once and retry grants nothing', () => {
  const p = player('priest');
  const result = applyFantasyAction(p, { type: 'pray' }, () => 0); assert.equal(result.error, undefined);
  assert.ok(result.profile.character!.circleKnowledge!.runes.includes('ward'));
  const again = applyFantasyAction(result.profile, { type: 'pray' }, () => 0);
  assert.ok(again.error); assert.deepEqual(again.profile, result.profile);
});


test('raw nonpositive radius or reach fails instead of being clamped and all base circles remain usable', () => {
 const c=player().character!; c.jobXp.mage=100; learnFantasyCircleBook(c,'rune-reach');
 assert.equal(fantasyCompileCircle(c,'flame',['focus']),undefined);
 assert.equal(fantasyCompileCircle(c,'flame',['focus','focus']),undefined);
 assert.equal(fantasyCompileCircle(c,'stone',['focus','focus','focus','scatter','scatter','scatter']),undefined);
 for(const core of ['flame','tide','gale','stone']) {const base=fantasyCompileCircle(c,core,[])!;assert.ok(base.radius>0&&base.reach>0);}
 const six=fantasyCompileCircle(c,'flame',Array(6).fill('economy'))!;assert.equal(six.runes.length,6);assert.equal(six.mp,2);
 assert.equal(fantasyCompileCircle(c,'flame',Array(7).fill('economy')),undefined);
 const priest=player('priest').character!;priest.priestGrowth={version:1,branch:'paladin',startedAt:0,service:[],doctrine:[],pilgrimage:[],prayerDays:[],prayerTemples:{},vows:[],branchChanges:0};
 const blessing=fantasyCompileCircle(priest,'blessing',[])!;assert.equal(blessing.radius,0);assert.equal(blessing.reach,0);assert.ok(blessing.selfOnly);assert.equal(fantasyCompileCircle(priest,'blessing',['focus']),undefined);
});

test('attack circles expose server-defined tile fields while support magic never creates attack fields',()=>{
 const c=player().character!;learnFantasyCircleBook(c,'rune-frost');
 assert.equal(fantasyCompileCircle(c,'flame',[])?.field,'fire');assert.equal(fantasyCompileCircle(c,'gale',[])?.field,'storm');assert.equal(fantasyCompileCircle(c,'tide',['slow'])?.field,'frost');
 const priest=player('priest').character!;assert.equal(fantasyCompileCircle(priest,'healing',[])?.field,undefined);
});

test('zero geometry permits only self healing and never negative or mage healing',()=>{
 const c=player('priest').character!;c.jobXp.priest=100;
 const ally=fantasyCompileCircle(c,'healing',[])!;assert.equal(ally.selfOnly,false);assert.ok(ally.reach>0&&ally.radius>0);
 const radiusZero=fantasyCompileCircle(c,'healing',['focus'])!;assert.equal(radiusZero.radius,0);assert.ok(radiusZero.reach>0);assert.equal(radiusZero.selfOnly,true);
 const reachZero=fantasyCompileCircle(c,'healing',['focus','focus','focus','scatter','scatter','scatter'])!;assert.equal(reachZero.reach,0);assert.ok(reachZero.radius>0);assert.equal(reachZero.selfOnly,true);
 assert.equal(fantasyCompileCircle(c,'healing',['focus','focus']),undefined);assert.equal(fantasyCompileCircle(c,'healing',['focus','focus','focus','focus','scatter','scatter']),undefined);
 assert.equal(fantasyCompileCircle(c,'holy',['focus']),undefined);assert.equal(fantasyCompileCircle(player().character!,'healing',['focus']),undefined);
});

test('six repeated rune slots apply every modifier while retaining power and geometry caps',()=>{
 const c=player().character!;c.jobXp.mage=100;learnFantasyCircleBook(c,'rune-resonance');learnFantasyCircleBook(c,'rune-reach');learnFantasyCircleBook(c,'rune-embers');
 const powers=Array.from({length:7},(_,count)=>fantasyCompileCircle(c,'flame',Array(count).fill('empower'))!.power);
 assert.ok(powers[1]-powers[0]>powers[2]-powers[1]);for(let i=1;i<powers.length;i++)assert.ok(powers[i]>=powers[i-1]);assert.ok(powers[6]<=Math.ceil(28*1.12*1.65));
 const reach=fantasyCompileCircle(c,'flame',Array(6).fill('reach'))!;assert.equal(reach.reach,10);assert.equal(reach.mp,22);assert.equal(reach.runes.length,6);
 const scatter=fantasyCompileCircle(c,'flame',Array(6).fill('scatter'))!;assert.equal(scatter.radius,2);assert.ok(scatter.power<fantasyCompileCircle(c,'flame',['scatter'])!.power);
 const burns=fantasyCompileCircle(c,'flame',Array(6).fill('burn'))!;assert.equal(burns.effects.burn,3);assert.equal(burns.mp,28);
});
