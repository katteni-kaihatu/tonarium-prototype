import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_JOBS, FANTASY_LOCATIONS } from './fantasy-data.ts';
import { FANTASY_MIRACLES } from './fantasy-miracle-catalog.ts';
import { advanceFantasyWorld, applyFantasyAction, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { FANTASY_LIBRARY_BOOKS, FANTASY_READABLE_LIBRARY_BOOKS, FANTASY_TEMPLE_DOCTRINE_BOOKS } from './fantasy-library.ts';
import { FANTASY_DINING } from './fantasy-life.ts';
import { fantasyAvailableJobSkills, fantasySkillUnlocked } from './fantasy-progression.ts';
import { FANTASY_LIBRARY_HOLDINGS, fantasyLibraryHoldings, FANTASY_TEMPLE_READING, fantasyTempleLibraryHoldings } from './fantasy-town.ts';

const locales = ['ko', 'en', 'ja'] as const;
// Check the rendered, dynamically assembled books as well as authored story passages.
const outsideWorld = /\b(?:NPCs?|GM|server|players?|buttons?|click|inventory|UI|LLM|chatbot)\b|서버|サーバー|실제\s*(?:시간|분|일)|real[- ]?(?:time|minutes?|hours?)|実時間|プレイヤー|플레이어|off[- ]?line|오프라인|オフライン|버튼|ボタン|클릭|クリック|게임|in[- ]game|ゲーム|인벤토리|화면|\bscreen\b|画面|언어\s*모델|言語モデル|language model/i;
const high = () => .999;
const player = () => applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: '도서 검증', gender: 'female' }, high).profile;

test('all shelf books have complete, in-world prose in each supported language', () => {
  assert.equal(FANTASY_READABLE_LIBRARY_BOOKS.length, 52);
  assert.equal(new Set(FANTASY_READABLE_LIBRARY_BOOKS.map(book => book.id)).size, 52);
  for (const book of FANTASY_READABLE_LIBRARY_BOOKS) {
    for (const locale of locales) {
      assert.ok(book.title[locale].trim(), `${book.id}/${locale}: title`);
      assert.equal(book.body[locale].length, book.body.ko.length, `${book.id}/${locale}: missing passages`);
      assert.ok(book.body[locale].length >= 3, `${book.id}/${locale}: body`);
      for (const [index, passage] of book.body[locale].entries()) {
        assert.ok(passage.trim(), `${book.id}/${locale}/${index}: empty passage`);
        assert.doesNotMatch(passage, outsideWorld, `${book.id}/${locale}/${index}`);
      }
    }
  }
  const bible = FANTASY_LIBRARY_BOOKS.find(book => book.id === 'world-bible')!;
  assert.equal(bible.inGame, false);
  assert.ok(!FANTASY_READABLE_LIBRARY_BOOKS.includes(bible));
});

test('public books remain on real library shelves while advanced temple doctrine keeps its institutional reading source', () => {
  const readable = new Set(FANTASY_READABLE_LIBRARY_BOOKS.map(book => book.id));
  const shelved = new Set<string>();
  for (const [location, holding] of Object.entries(FANTASY_LIBRARY_HOLDINGS)) {
    assert.equal(new Set(holding).size, holding.length, location);
    assert.deepEqual(fantasyLibraryHoldings({ location }), holding);
    for (const id of holding) {
      assert.ok(readable.has(id), `${location}: ${id}`);
      shelved.add(id);
    }
  }
  const doctrine = new Set<string>(FANTASY_TEMPLE_DOCTRINE_BOOKS);
  assert.deepEqual([...shelved].sort(), [...readable].filter(id => !doctrine.has(id)).sort());
  assert.deepEqual(new Set(FANTASY_TEMPLE_READING), doctrine);
  for (const id of doctrine) { assert.ok(readable.has(id)); assert.equal(shelved.has(id), false); }
  assert.ok(fantasyLibraryHoldings({ location: 'mooncity' }).includes('archive-records'));
  assert.ok(!fantasyLibraryHoldings({ location: 'hearth' }).includes('archive-records'));
  const profile = player();
  assert.deepEqual(fantasyTempleLibraryHoldings(profile.character!), []);
  for (const book of ['archive-records', 'world-bible']) {
    const result = applyFantasyAction(profile, { type: 'read', book }, high);
    assert.ok(result.error, book);
    assert.deepEqual(result.profile, profile, book);
  }
});

test('every miracle testimony has a registered library and can actually be read there', () => {
  for (const miracle of FANTASY_MIRACLES) {
    assert.ok(FANTASY_LOCATIONS.some(location => location.id === miracle.library), `${miracle.book}: unknown location`);
    const profile = player(), c = profile.character!;
    c.location = miracle.library;
    const before = structuredClone(profile);
    assert.ok(fantasyLibraryHoldings(c).includes(miracle.book), `${miracle.book}: inaccessible shelf`);
    const started = startFantasyActivity(profile, { type: 'read', book: miracle.book }, c.hour, high);
    assert.equal(started.error, undefined, miracle.book);
    assert.equal((started.profile.character!.readBooks ?? []).includes(miracle.book), false);
    const activity = started.profile.activity!;
    const completed = advanceFantasyWorld(started.profile, activity.endsAt).profile;
    assert.equal(completed.activity, undefined);
    assert.deepEqual(completed.character!.readBooks, [miracle.book]);
    assert.deepEqual(profile, before);
  }
});

test('rewritten manuals still unlock every book-taught profession skill only with its required practice', () => {
  for (const job of FANTASY_JOBS) for (const skill of job.skills) {
    if (skill.retired || skill.unlock?.kind !== 'book') continue;
    const { book, jobXp = 0 } = skill.unlock;
    const location = Object.entries(FANTASY_LIBRARY_HOLDINGS).find(([, ids]) => ids.includes(book))?.[0];
    assert.ok(location, `${skill.id}: missing book ${book}`);
    const profile = player(), c = profile.character!;
    c.location = location; c.job = job.id; c.jobXp[job.id] = jobXp;
    const visited = structuredClone(c.visited), charted = structuredClone(c.charted);
    assert.equal(fantasySkillUnlocked(c, skill), false, skill.id);
    const read = applyFantasyAction(profile, { type: 'read', book }, high);
    assert.equal(read.error, undefined, skill.id);
    const learned = read.profile.character!;
    assert.deepEqual(learned.readBooks, [book], skill.id);
    assert.ok(fantasyAvailableJobSkills(learned).some(entry => entry.id === skill.id), skill.id);
    assert.deepEqual(learned.visited, visited, `${skill.id}: reading is not a visit`);
    assert.deepEqual(learned.charted, charted, `${skill.id}: reading is not a map`);
    if (jobXp > 0) {
      learned.jobXp[job.id] = jobXp - 1;
      assert.equal(fantasySkillUnlocked(learned, skill), false, `${skill.id}: practice still required`);
      learned.jobXp[job.id] = jobXp;
    }
    learned.job = 'unassigned';
    assert.ok(!fantasyAvailableJobSkills(learned).some(entry => entry.id === skill.id), `${skill.id}: other profession`);
  }
});

test('a scheduled reading grants knowledge on completion, never while still reading', () => {
  const profile = player(), c = profile.character!;
  const job=FANTASY_JOBS.find(job=>job.skills.some(skill=>!skill.retired&&skill.unlock?.kind==='book'))!;
  c.job=job.id;c.jobXp[job.id]=100;
  const skill=job.skills.find(skill=>!skill.retired&&skill.unlock?.kind==='book')!,book=skill.unlock!.kind==='book'?skill.unlock!.book:'';
  c.location=Object.entries(FANTASY_LIBRARY_HOLDINGS).find(([,ids])=>ids.includes(book))![0];
  const started = startFantasyActivity(profile, { type: 'read', book }, c.hour, high);
  assert.equal(started.error, undefined);
  const activity = started.profile.activity!;
  assert.equal(activity.endsAt - activity.startedAt, 1);
  assert.equal(fantasySkillUnlocked(started.profile.character!, skill), false);
  const partial = advanceFantasyWorld(started.profile, activity.startedAt + .5).profile;
  assert.equal(fantasySkillUnlocked(partial.character!, skill), false);
  const completed = advanceFantasyWorld(partial, activity.endsAt).profile;
  assert.equal(fantasySkillUnlocked(completed.character!, skill), true);
  assert.deepEqual(completed.character!.readBooks, [book]);
  assert.equal(completed.activity, undefined);
  const repeated = applyFantasyAction(completed, { type: 'read', book }, high);
  assert.ok(repeated.error);
  assert.deepEqual(repeated.profile, completed);
});

test('the pantry manual keeps current meal prices and durations without reference to an outside clock', () => {
  const pantry = FANTASY_READABLE_LIBRARY_BOOKS.find(book => book.id === 'pantry-guide')!;
  for (const meal of FANTASY_DINING) for (const locale of locales) {
    const passage = pantry.body[locale].find(text => text.startsWith(meal.name[locale]))!;
    assert.ok(passage, `${meal.id}/${locale}`);
    assert.ok(passage.includes(String(meal.cost)), `${meal.id}/${locale}: price`);
    assert.ok(passage.includes(String(meal.hours)), `${meal.id}/${locale}: duration`);
    assert.ok(passage.includes(String(meal.nutrition)), `${meal.id}/${locale}: nutrition`);
  }
});
