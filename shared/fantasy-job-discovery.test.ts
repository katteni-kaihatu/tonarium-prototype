import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_JOB_PATH_CATALOG } from './fantasy-job-path-catalog.ts';
import { FANTASY_JOB_DISCOVERY_BOOKS, fantasyJobDiscoveryInsertionIndices, fantasyJobDiscoveryPassages, fantasyJobPathDiscovered } from './fantasy-job-discovery.ts';
import { FANTASY_READABLE_LIBRARY_BOOKS } from './fantasy-library.ts';
import { FANTASY_LIBRARY_HOLDINGS, FANTASY_SETTLEMENTS } from './fantasy-town.ts';
import { FANTASY_PRIEST_BRANCHES } from './fantasy-priest-growth.ts';
import { applyFantasyJobPath, fantasyJobPathError, fantasyJobPathSkills, validFantasyJobPaths } from './fantasy-job-paths.ts';
import { applyFantasyAction, newFantasyProfile, startFantasyActivity, advanceFantasyWorld } from './fantasy-engine.ts';
import { FANTASY_JOBS } from './fantasy-data.ts';

function mage() {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name: '책의 흔적', gender: 'female', source: 'human' }, () => .999).profile;
  const c = p.character!; c.job = 'mage'; c.jobXp.mage = 1000; c.skillXp = Object.fromEntries(FANTASY_JOBS.find(job => job.id === 'mage')!.skills.map(skill => [skill.id, 30]));
  c.unlockedSkills = ['job-mage-advanced-4']; c.practice = { explore: 10 }; c.readBooks = []; c.hour = 12; c.inventory.lantern = 1;
  return p;
}
test('149 specialties appear in existing34 books with actual regional library access', () => {
  const all = [...FANTASY_JOB_PATH_CATALOG, ...FANTASY_PRIEST_BRANCHES.map(branch => ({ ...branch, id: `priest-${branch.id}` }))];
  assert.equal(all.length, 149); assert.equal(Object.keys(FANTASY_JOB_DISCOVERY_BOOKS).length, 149); assert.equal(FANTASY_READABLE_LIBRARY_BOOKS.length, 34);
  assert.equal(new Set(Object.values(FANTASY_JOB_DISCOVERY_BOOKS)).size, 34);
  for (const path of all) {
    const bookId = FANTASY_JOB_DISCOVERY_BOOKS[path.id], book = FANTASY_READABLE_LIBRARY_BOOKS.find(book => book.id === bookId); assert.ok(book, path.id);
    assert.ok(Object.entries(FANTASY_LIBRARY_HOLDINGS).some(([location, books]) => FANTASY_SETTLEMENTS[location]?.buildingIds.includes('library') && books.includes(bookId)), `${path.id}: unavailable book`);
    for (const locale of ['ko', 'en', 'ja'] as const) {
      const passages = fantasyJobDiscoveryPassages(bookId)[locale]; assert.ok(passages.length >= 1 && passages.length <= 2);
      assert.ok(passages.some(passage => passage.includes(path.names[locale])), `${path.id}/${locale}: missing textual clue`);
      for (const passage of passages) {
        assert.ok(book.body[locale].includes(passage), `${path.id}/${locale}: not placed in book`);
        assert.doesNotMatch(passage, /\d|advanced-|job-|unlock|전직하려면|숙련도|플레이어|\bNPC\b|\bGM\b|시스템|スキルID|解放条件/i);
        assert.ok(all.filter(path => FANTASY_JOB_DISCOVERY_BOOKS[path.id] === bookId && passage.includes(path.names[locale])).length <= 4, `${bookId}/${locale}: too many names in one paragraph`);
      }
    }
  }
});
test('clues stay in ordinary books and differ across neighboring paragraphs without a career guide', () => {
  const placementKinds = new Set<string>();
  for (const book of FANTASY_READABLE_LIBRARY_BOOKS) {
    assert.doesNotMatch(book.title.ko, /전직|설정집/);
    const correspondingPositions: number[][] = [];
    for (const locale of ['ko', 'en', 'ja'] as const) {
      const clues = fantasyJobDiscoveryPassages(book.id)[locale]; assert.ok(clues.length); assert.ok(book.body[locale].length >= 2);
      const original = book.body[locale].filter(paragraph => !clues.includes(paragraph));
      assert.equal(book.body[locale][0], original[0]);
      const positions = fantasyJobDiscoveryInsertionIndices(book.id, original.length, clues.length), rebuilt = [...original];
      clues.forEach((clue, index) => rebuilt.splice(positions[index] + index, 0, clue)); assert.deepEqual(book.body[locale], rebuilt);
      assert.deepEqual(fantasyJobDiscoveryInsertionIndices(book.id, original.length, clues.length), positions);
      assert.deepEqual(fantasyJobDiscoveryPassages(book.id)[locale], clues);
      correspondingPositions.push(clues.map((clue, index) => book.body[locale].indexOf(clue) - index));
      for (const position of positions) placementKinds.add(position === original.length ? 'end' : position === 1 ? 'after-first' : 'middle');
    }
    assert.deepEqual(correspondingPositions[1], correspondingPositions[0]); assert.deepEqual(correspondingPositions[2], correspondingPositions[0]);
  }
  assert.deepEqual([...placementKinds].sort(), ['after-first', 'end', 'middle']);
  assert.deepEqual(fantasyJobDiscoveryPassages('world-bible'), { ko: [], en: [], ja: [] });
});
test('mere skill preparation does not reveal any branch, and a completed book reveals only its own clues', () => {
  const p = mage(), c = p.character!;
  assert.equal(FANTASY_JOB_PATH_CATALOG.filter(path => fantasyJobPathDiscovered(c, path.id)).length, 0);
  const before = structuredClone(c); assert.ok(fantasyJobPathError(c, 'mage-star')); assert.ok(applyFantasyJobPath(c, 'mage-star').error); assert.deepEqual(c, before);
  c.readBooks = ['mirrorwake-voyage']; assert.equal(fantasyJobPathDiscovered(c, 'mage-star'), true); assert.equal(fantasyJobPathDiscovered(c, 'mage-flame'), false);
  assert.equal(fantasyJobPathError(c, 'mage-star'), undefined); assert.equal(c.jobPaths, undefined); assert.equal(fantasyJobPathSkills(c).length, 0);
  assert.equal(fantasyJobPathDiscovered(c, 'invented-path'), false);
});
test('reading must actually finish on the world clock before discovery and does not grant profession or skills', () => {
  const p = mage(); p.character!.location = 'starspire'; p.character!.visited.push('starspire');
  const started = startFantasyActivity(p, { type: 'read', book: 'mirrorwake-voyage' }, 12, () => .999);
  assert.equal(started.error, undefined); assert.equal(fantasyJobPathDiscovered(started.profile.character!, 'mage-star'), false);
  assert.equal(fantasyJobPathDiscovered(advanceFantasyWorld(started.profile, 12.99).profile.character!, 'mage-star'), false);
  const finished = advanceFantasyWorld(started.profile, 13).profile;
  assert.equal(finished.activity, undefined); assert.equal(fantasyJobPathDiscovered(finished.character!, 'mage-star'), true);
  assert.equal(finished.character!.job, 'mage'); assert.equal(finished.character!.jobPaths, undefined); assert.equal(fantasyJobPathSkills(finished.character!).length, 0);
});
test('existing chosen paths remain valid and keep both learned skills without their discovery book', () => {
  const c = mage().character!; c.readBooks = ['mirrorwake-voyage']; assert.equal(applyFantasyJobPath(c, 'mage-star').error, undefined);
  const old = structuredClone(c); old.readBooks = [];
  assert.equal(fantasyJobPathDiscovered(old, 'mage-star'), true); assert.equal(validFantasyJobPaths(old), true); assert.equal(fantasyJobPathSkills(old).length, 2);
  assert.equal(fantasyJobPathDiscovered(old, 'mage-flame'), false);
  old.job = 'warrior'; assert.equal(fantasyJobPathSkills(old).length, 0); old.job = 'mage'; assert.equal(fantasyJobPathSkills(old).length, 2);
});
test('new lives do not inherit discoveries and priest paths use matching books or the existing chosen branch', () => {
  const prior = mage().character!; prior.readBooks = FANTASY_READABLE_LIBRARY_BOOKS.map(book => book.id);
  const next = mage().character!; assert.equal(fantasyJobPathDiscovered(next, 'mage-star'), false);
  assert.equal(fantasyJobPathDiscovered({ readBooks: ['remedies-and-rites'] }, 'priest-care'), true);
  assert.equal(fantasyJobPathDiscovered({ readBooks: ['remedies-and-rites'] }, 'priest-oath'), false);
  assert.equal(fantasyJobPathDiscovered({ priestGrowth: { branch: 'ward' } as any }, 'priest-ward'), true);
  assert.equal(fantasyJobPathDiscovered({ priestGrowth: { branch: 'ward' } as any }, 'priest-care'), false);
});
