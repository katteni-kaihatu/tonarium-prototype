import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore } from './fantasy-store.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { recordFantasyDeath } from '../shared/fantasy-mortality.ts';
import type { FantasyResult } from '../shared/fantasy.ts';
const player = (name = 'Private character') => applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name, gender: 'female' }, () => .5).profile;
function fixture(t: { after: (callback: () => void) => void }, profiles: Record<string, ReturnType<typeof player>> = { owner: player() }) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-ranking-')); t.after(() => {
    const target = path.resolve(folder), relative = path.relative(path.resolve(os.tmpdir()), target);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(target).startsWith('fantasy-ranking-'));
    fs.rmSync(target, { recursive: true, force: true });
  });
  const file = path.join(folder, 'world.json'); fs.writeFileSync(file, JSON.stringify(profiles)); return file;
}
const commit = (store: FantasyStore, profile: ReturnType<typeof player>) => (store as unknown as { commit(user: string, result: FantasyResult): FantasyResult }).commit('owner', { profile, changed: true });
test('legacy profiles derive a top ten exposing exactly four public fields without a startup write', t => {
  const profiles = Object.fromEntries(Array.from({ length: 12 }, (_, index) => { const p = player(`Character ${index}`); p.character!.level = index + 1; return [`owner-${index}`, p]; }));
  const file = fixture(t, profiles), store = new FantasyStore(file, { onError: () => {} });
  assert.equal(typeof store.publicRanking, 'function');
  const rows = store.publicRanking(); assert.equal(rows.length, 10); assert.ok(rows[0].score > rows.at(-1)!.score);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['job', 'nickname', 'race', 'score']);
  assert.ok(!JSON.stringify(rows).includes('owner-')); assert.deepEqual(new FantasyStore(file).publicRanking(), rows);
});
test('missing ranking alone never writes or locks a valid legacy or v2 save', t => {
  for (const envelope of [false, true]) {
    const file = fixture(t), original = envelope ? JSON.stringify({ version: 2, profiles: { owner: player() }, combats: {} }) : fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, original); let calls = 0;
    const store = new FantasyStore(file, { save: () => { calls++; throw Error('disk unavailable'); }, onError: () => {} });
    assert.equal(store.loadError, undefined); assert.equal(calls, 0); assert.equal(store.publicRanking().length, 1); assert.equal(fs.readFileSync(file, 'utf8'), original);
  }
});
test('a genuine legacy profile migration still saves normalized progress with rankings', t => {
  const profile = player(); profile.character!.job = 'healer'; profile.character!.jobXp.healer = 0;
  delete profile.character!.jobHpVersion;
  const expected = structuredClone(profile), c = expected.character!;
  c.job = 'priest'; c.jobXp.priest = c.jobXp.healer; delete c.jobXp.healer;
  c.jobHpVersion = 1; c.hp = Math.min(c.hp, fantasyStats(c).hp);
  const file = fixture(t, { owner: profile }); let calls = 0;
  const store = new FantasyStore(file, { save: (target, data) => { calls++; fs.writeFileSync(target, data); }, onError: () => {} });
  assert.equal(store.loadError, undefined); assert.equal(calls, 1); assert.equal(store.profile('owner').character!.job, 'priest');
  assert.deepEqual(store.profile('owner'), expected);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).rankings.entries.length, 1);
  let reloadCalls = 0;
  const reloaded = new FantasyStore(file, { save: () => { reloadCalls++; }, onError: () => {} });
  assert.equal(reloaded.loadError, undefined); assert.equal(reloadCalls, 0); assert.deepEqual(reloaded.profile('owner'), expected);
});
test('authoritative nicknames persist and dead generations retain their final score through rebirth', t => {
  const file = fixture(t), store = new FantasyStore(file);
  assert.equal(store.updateRankingNickname('owner', 'Tonarium nickname'), true);
  assert.equal(store.publicRanking()[0].nickname, 'Tonarium nickname');
  let profile = store.profile('owner'); profile.character!.level = 10; assert.equal(commit(store, profile).error, undefined);
  const alive = store.publicRanking()[0].score; profile = store.profile('owner'); recordFantasyDeath(profile, 'test'); assert.equal(commit(store, profile).error, undefined);
  assert.equal(store.publicRanking()[0].score, alive);
  const reborn = store.apply('owner', store.profile('owner').revision, { type: 'rebirth' }, () => .5); assert.equal(reborn.error, undefined);
  const created = store.apply('owner', reborn.profile.revision, { type: 'create', source: 'human', name: 'New private life', gender: 'male' }, () => .5); assert.equal(created.error, undefined);
  assert.equal(store.publicRanking().length, 2); assert.equal(store.publicRanking()[0].score, alive);
  assert.ok(store.publicRanking().every(row => row.nickname === 'Tonarium nickname'));
  assert.deepEqual(new FantasyStore(file).publicRanking(), store.publicRanking());
});
test('failed atomic saves and failed party transactions publish no ranking changes', t => {
  const file = fixture(t); let broken = false;
  const store = new FantasyStore(file, { save: (target, data) => { if (broken) throw Error('disk full'); fs.writeFileSync(target, data); }, onError: () => {} });
  const before = store.publicRanking(), disk = fs.readFileSync(file, 'utf8'); broken = true;
  assert.equal(store.updateRankingNickname('owner', 'Failed rename'), false);
  const profile = store.profile('owner'); profile.character!.level = 10; assert.ok(commit(store, profile).error);
  assert.deepEqual(store.publicRanking(), before); assert.equal(fs.readFileSync(file, 'utf8'), disk);
  broken = false;
  store.partyTransaction(() => { commit(store, profile); return { error: 'invalid' }; }, () => ({}));
  assert.deepEqual(store.publicRanking(), before);
});
test('living scores fall when items leave and frozen dead scores survive later nickname updates', t => {
  const file = fixture(t), store = new FantasyStore(file);
  let profile = store.profile('owner'); profile.character!.inventory.herb = 9; assert.equal(commit(store, profile).error, undefined);
  const stocked = store.publicRanking()[0].score;
  profile = store.profile('owner'); profile.character!.inventory.herb = 0; assert.equal(commit(store, profile).error, undefined);
  assert.ok(store.publicRanking()[0].score < stocked);
  profile = store.profile('owner'); recordFantasyDeath(profile, 'test'); assert.equal(commit(store, profile).error, undefined);
  const deadScore = store.publicRanking()[0].score;
  assert.equal(store.updateRankingNickname('owner', 'Updated Tonarium name'), true);
  assert.equal(store.publicRanking()[0].nickname, 'Updated Tonarium name'); assert.equal(store.publicRanking()[0].score, deadScore);
  const exposed = store.publicRanking(); exposed[0].score = 99999; assert.equal(store.publicRanking()[0].score, deadScore);
});
test('malformed persisted rankings lock the store and never overwrite the original file', t => {
  const file = fixture(t), saved = { version: 2, profiles: { owner: player() }, combats: {}, rankings: { version: 1, entries: [{ owner: 'owner', generation: 1, dead: false, row: { nickname: 'Name', race: { ko: '인간', en: 'Human', ja: '人間' }, job: { ko: '직업', en: 'Job', ja: '職業' }, score: -1 } }], nicknames: {} } };
  const text = JSON.stringify(saved); fs.writeFileSync(file, text);
  const store = new FantasyStore(file, { onError: () => {} }); assert.ok(store.loadError); assert.equal(store.updateRankingNickname('owner', 'Name'), false); assert.equal(fs.readFileSync(file, 'utf8'), text);
});
