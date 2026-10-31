import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile, fantasyStats } from './fantasy-engine.ts';
import { applyFantasySpecialization, fantasySpellCapacity, validFantasySpecialization } from './fantasy-specializations.ts';
import { fantasyCombatPlayer } from '../server/fantasy-combat-adapter.ts';
import { FANTASY_READABLE_LIBRARY_BOOKS } from './fantasy-library.ts';
import { createFantasyCombat, submitFantasyCombatOrder, validFantasyCombatState } from './fantasy-combat.ts';
import { initializeFantasyMagicKnowledge, fantasyMagicKnown, learnFantasyMagicBook, learnFantasyMagicDungeon, completeFantasyMagicPrayer, fantasyMagicPrayerChance, validFantasyMagicKnowledge } from './fantasy-magic-discovery.ts';
import { fantasyJobHealingBonus } from './fantasy-job-balance.ts';
function person(job = 'mage') {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Learner', source: 'human', gender: 'female' }, () => .5).profile;
  p.character!.job = job; p.character!.jobXp[job] = 0;
  const stats = fantasyStats(p.character!); p.character!.hp = stats.hp; p.character!.mp = stats.mp; return p;
}
const prepare = (p: ReturnType<typeof person>, element: string, form: string, slot = 1) => applyFantasySpecialization(p, { type: 'magicPrepare', element, form, slot }, () => .5, { stats: fantasyStats(p.character!), check: () => true, addItem: () => {}, hurt: () => {} })!;
test('unknown ingredients reject real preparation without mutating the original profile', () => {
  const p = person('priest'), before = structuredClone(p);
  const r = prepare(p, 'tide', 'mend'); assert.ok(r.error); assert.equal(r.changed, false); assert.deepEqual(p, before);
  learnFantasyMagicBook(p.character!, 'remedies-and-rites');
  assert.equal(prepare(p, 'tide', 'mend').error, undefined); assert.ok(prepare(p, 'flame', 'bolt').error);
});
test('named completed books and dungeon receipts learn bounded durable components without duplicate rewards', () => {
  const c = person().character!; initializeFantasyMagicKnowledge(c);
  assert.equal(fantasyMagicKnown(c, 'flame', 'bolt'), false);
  assert.ok(learnFantasyMagicDungeon(c, 'magic-flame').length > 0); assert.deepEqual(learnFantasyMagicDungeon(c, 'magic-flame'), []);
  assert.deepEqual(learnFantasyMagicDungeon(c, 'forged'), []);
  for (const id of ['mana-primer', 'advanced-mana-forms', 'stone-and-flame', 'remedies-and-rites']) learnFantasyMagicBook(c, id);
  assert.equal(c.magicKnowledge!.elements.length, 5); assert.equal(c.magicKnowledge!.forms.length, 3);
  assert.ok(validFantasyMagicKnowledge(JSON.parse(JSON.stringify(c))));
});
test('priest preparation and combat permit water/light support only and use priest slot proficiency', () => {
  let p = person('priest'); const c = p.character!; c.jobXp.mage = 100; c.jobXp.priest = 0;
  for (const id of ['remedies-and-rites', 'advanced-mana-forms', 'mana-primer', 'stone-and-flame']) learnFantasyMagicBook(c, id);
  assert.equal(fantasySpellCapacity(c), 1); assert.ok(prepare(p, 'light', 'mend', 2).error);
  assert.ok(prepare(p, 'light', 'bolt').error); assert.ok(prepare(p, 'flame', 'veil').error);
  p = prepare(p, 'tide', 'mend').profile; assert.equal(fantasyCombatPlayer(p, 'p').skills.find(s => s.id === 'prepared-spell-1')?.kind, 'heal');
  p.character!.jobXp.priest = 100; assert.equal(fantasySpellCapacity(p.character!), 3);
  p = prepare(p, 'light', 'mend', 3).profile;
  p.character!.job = 'warrior'; assert.ok(validFantasySpecialization(p.character!)); assert.equal(fantasyCombatPlayer(p, 'p').skills.some(s => s.id.startsWith('prepared-spell-')), false);
  p.character!.job = 'priest'; assert.ok(fantasyCombatPlayer(p, 'p').skills.some(s => s.id === 'prepared-spell-3'));
});
test('prayer pity advances once per actual completed day, caps, and resets only on new eligible knowledge', () => {
  const c = person('priest').character!; initializeFantasyMagicKnowledge(c); let rolls = 0;
  assert.equal(completeFantasyMagicPrayer(c, 0, () => { rolls++; return .99; }).length, 0); assert.equal(rolls, 0);
  for (let day = 1; day <= 20; day++) { c.hour = day * 24; c.lastPrayerDay = day; completeFantasyMagicPrayer(c, day, () => { rolls++; return .99; }); }
  assert.equal(rolls, 20); assert.equal(c.magicKnowledge!.prayerFailures, 20); assert.equal(fantasyMagicPrayerChance(c), .05);
  completeFantasyMagicPrayer(c, 20, () => { rolls++; return 0; }); assert.equal(rolls, 20);
  c.hour = 21 * 24; c.lastPrayerDay = 21; assert.equal(completeFantasyMagicPrayer(c, 21, () => { rolls++; return 0; }).length, 1);
  assert.equal(c.magicKnowledge!.prayerFailures, 0); assert.ok(validFantasyMagicKnowledge(c));
});
test('legacy preparation grandfathers only its ingredients and recognized read books, preserving other-job records', () => {
  const c = person().character!; delete c.magicKnowledge; c.specialization = { spells: [{ slot: 1, element: 'tide', form: 'mend' }] }; c.readBooks = ['mana-primer'];
  initializeFantasyMagicKnowledge(c); assert.ok(fantasyMagicKnown(c, 'tide', 'mend')); assert.ok(fantasyMagicKnown(c, 'gale', 'bolt')); assert.equal(fantasyMagicKnown(c, 'flame', 'veil'), false);
  c.magicKnowledge!.elements.push('tide'); assert.equal(validFantasyMagicKnowledge(c), false);
});
test('priest support synthesis casts real healing and wards, and blocks stored offensive magic after changing profession', () => {
  let p = person('priest'); for (const book of ['remedies-and-rites', 'advanced-mana-forms']) learnFantasyMagicBook(p.character!, book);
  p.character!.hp -= 30; p = prepare(p, 'tide', 'mend').profile;
  const before = { hp: p.character!.hp, mp: p.character!.mp };
  const cast = applyFantasySpecialization(p, { type: 'magicCast', slot: 1 }, () => .5, { stats: fantasyStats(p.character!), check: () => true, addItem: () => {}, hurt: () => {} })!;
  assert.equal(cast.error, undefined); assert.equal(cast.profile.character!.hp, before.hp + 22); assert.equal(cast.profile.character!.mp, before.mp - 10);
  p = prepare(cast.profile, 'tide', 'veil').profile;
  const ward = applyFantasySpecialization(p, { type: 'magicCast', slot: 1 }, () => .5, { stats: fantasyStats(p.character!), check: () => true, addItem: () => {}, hurt: () => {} })!;
  assert.equal(ward.error, undefined); assert.equal(ward.profile.character!.buff?.effect, 'guard'); assert.equal(ward.profile.character!.buff?.power, 7);
  const mage = person(); for (const book of ['mana-primer', 'stone-and-flame']) learnFantasyMagicBook(mage.character!, book);
  const offensive = prepare(mage, 'flame', 'bolt').profile; offensive.character!.job = 'priest';
  assert.ok(validFantasySpecialization(offensive.character!)); assert.equal(fantasyCombatPlayer(offensive, 'p').skills.some(skill => skill.id.startsWith('prepared-spell')), false);
  assert.ok(applyFantasySpecialization(offensive, { type: 'magicCast', slot: 1 }, () => .5, { stats: fantasyStats(offensive.character!), check: () => true, addItem: () => {}, hurt: () => {} })!.error);
});
test('discovery books are real localized readable content and prayer odds have an exact boundary', () => {
  for (const id of ['mana-primer', 'advanced-mana-forms', 'stone-and-flame', 'remedies-and-rites']) {
    const book = FANTASY_READABLE_LIBRARY_BOOKS.find(book => book.id === id)!; assert.ok(book);
    for (const locale of ['ko', 'en', 'ja'] as const) {
      assert.ok(book.body[locale].some(passage=>/바람|빛|불|물|wind|Light|flame|Water|風|光|火|水/.test(passage)));
      assert.ok(book.body[locale].every(passage=>!/current profession|직업의 규칙|職業の規則|NPC|\bGM\b/.test(passage)));
    }
  }
  const c = person('priest').character!; c.hour = 24; c.lastPrayerDay = 1;
  assert.equal(completeFantasyMagicPrayer(c, 1, () => .01).length, 0); assert.equal(c.magicKnowledge!.prayerFailures, 1);
  c.hour = 48; c.lastPrayerDay = 2; assert.equal(fantasyMagicPrayerChance(c), .0125);
  assert.equal(completeFantasyMagicPrayer(c, 2, () => .0124999).length, 1); assert.equal(c.magicKnowledge!.prayerFailures, 0);
});
test('discovered priest synthesis performs actual tactical healing and expiring protection with real MP', () => {
  for (const form of ['mend', 'veil'] as const) {
    let p = person('priest'); for (const book of ['remedies-and-rites', 'advanced-mana-forms']) learnFantasyMagicBook(p.character!, book);
    p.character!.hp -= 40; p = prepare(p, 'tide', form).profile;
    const s = createFantasyCombat({ id: `priest-${form}`, location: 'hearth', source: 'hunt:monster-goblin-raider', players: [fantasyCombatPlayer(p, 'p')], enemies: [{ id: 'enemy', template: 'monster-goblin-raider' }], seed: 42, hour: 12, tactical: true });
    const actor = s.fighters[0], spell = actor.skills.find(skill => skill.id === 'prepared-spell-1')!;
    actor.tile = { x: 1, y: 1 }; s.fighters[1].tile = form === 'mend' ? { x: 9, y: 7 } : { x: 2, y: 1 }; s.fighters[1].stats.accuracy = 100;
    const r = submitFantasyCombatOrder(s, 'p', 0, { type: 'skill', skill: spell.id, target: actor.id }, 12);
    assert.equal(r.error, undefined); assert.equal(r.state.fighters[0].mp, actor.mp - spell.mp); assert.ok(validFantasyCombatState(JSON.parse(JSON.stringify(r.state))));
    if (form === 'mend') assert.equal(r.state.fighters[0].hp, actor.hp + Math.min(actor.stats.hp - actor.hp, spell.power + Math.floor(actor.stats.intelligence * .8) + fantasyJobHealingBonus(actor.vocation?.job, actor.stats.hp)));
    else { assert.equal(r.state.fighters[0].ward, 0); assert.ok(r.state.logs.some(log => log.text.en.includes('wards'))); assert.ok(r.state.fighters[0].contribution.effectiveActions > 0); }
  }
});
test('learned common mentor support remains available in combat after profession changes', () => {
  const p = person('mage'); p.character!.learnedSkills = ['mentor-parry', 'mentor-focus', 'mentor-steady-hand'];
  for (const job of ['mage', 'warrior', 'merchant']) {
    p.character!.job = job;
    const skills = fantasyCombatPlayer(p, 'p').skills;
    assert.equal(skills.find(skill => skill.id === 'mentor-parry')?.kind, 'guard');
    assert.equal(skills.find(skill => skill.id === 'mentor-focus')?.kind, 'focus');
    assert.equal(skills.find(skill => skill.id === 'mentor-steady-hand')?.kind, 'focus');
  }
});
