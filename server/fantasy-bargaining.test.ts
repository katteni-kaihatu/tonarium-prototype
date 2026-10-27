import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyBargaining, type FantasyBargainingRequest } from './fantasy-bargaining.ts';
import { FantasyStore } from './fantasy-store.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';
import { NPC_PUBLIC, type NpcLocale } from '../shared/npc.ts';

const high = () => .999;
function player(): FantasyProfile { return applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: 'Bargainer' }, high).profile; }
function request(profile: FantasyProfile, text: string, locale: NpcLocale = 'ko', npcId = 'rin', user = 'alice'): FantasyBargainingRequest {
  return { profile, text, locale, npcId, user, revision: profile.revision };
}

test('Korean English Japanese price requests require a separate textual yes before authoritative bargaining', () => {
  const cases = [ ['ko', '객실값 깎아줘', '응', '객실값', '깎아'], ['en', 'negotiate room prices', 'yes', 'room prices', 'Agreed'], ['ja', '客室代を値引きして', 'はい', '客室代', '引き'] ] as const;
  for (const [locale, text, yes, service, success] of cases) {
    const profile = player(), serviceChat = new FantasyBargaining(); const before = JSON.stringify(profile); let calls = 0;
    const apply = (revision: number, action: Parameters<FantasyStore['apply']>[2]) => {
      calls++; assert.equal(revision, profile.revision); assert.deepEqual(action, { type: 'haggle', service: 'room' });
      return applyFantasyAction(profile, action as never, () => 0);
    };
    const proposal = serviceChat.chat(request(profile, text, locale), apply);
    assert.equal(proposal.handled, true); assert.equal(proposal.source, 'canon'); assert.ok(proposal.text!.includes(service));
    assert.equal(proposal.result, undefined); assert.equal(calls, 0); assert.equal(JSON.stringify(profile), before); assert.ok(!('actions' in proposal));
    const confirmed = serviceChat.chat(request(profile, yes, locale), apply);
    assert.equal(calls, 1); assert.equal(confirmed.result!.error, undefined); assert.ok(confirmed.text!.includes(success));
    assert.ok(confirmed.text!.includes('8%'));
    assert.ok(confirmed.result!.profile.log.some(entry => /d100=1.*DC25/.test(entry.text)));
    assert.doesNotMatch(proposal.text! + confirmed.text!, /server|gameplay|サーバー|게임\s*시간|d100|성공 기준/i);
    assert.equal(serviceChat.chat(request(confirmed.result!.profile, yes, locale), apply).handled, false); assert.equal(calls, 1);
  }
});

test('plain inn bargaining asks which service and selecting a service still requires explicit approval', () => {
  const profile = player(), service = new FantasyBargaining(); let calls = 0;
  const apply = () => { calls++; return { profile, changed: false }; };
  assert.match(service.chat(request(profile, '흥정'), apply).text!, /객실값과 식사비/);
  assert.match(service.chat(request(profile, '객실'), apply).text!, /시작할까요/); assert.equal(calls, 0);
  service.chat(request(profile, '응'), apply); assert.equal(calls, 1);
  for (const [locale, first, pick] of [['en', 'haggle', 'food'], ['ja', '値段交渉', '食事']] as const) {
    const next = new FantasyBargaining();
    assert.ok(next.chat(request(profile, first, locale), apply).text!.includes(locale === 'en' ? 'room or meal' : '客室代と食事代'));
    const selection = next.chat(request(profile, pick, locale), apply); assert.ok(selection.text!.includes(locale === 'en' ? 'meal prices' : '食事代'));
    assert.equal(selection.result, undefined);
  }
});

test('each NPC can bargain only their local business service and outsiders or busy characters cannot start', () => {
  const profile = player(); let calls = 0; const apply = () => { calls++; return { profile, changed: false }; };
  for (const [npc, text] of [['eris', '물품 가격 흥정'], ['not-registered', '객실값 깎아줘'], ['rin', '물건 가격 깎아줘']]) {
    assert.equal(new FantasyBargaining().chat(request(profile, text, 'ko', npc), apply).handled, true);
  }
  const remote = structuredClone(profile); remote.character!.location = 'emberhall';
  assert.equal(new FantasyBargaining().chat(request(remote, '객실값 깎아줘'), apply).handled, true);
  const busy = structuredClone(profile); busy.activity = { action: { type: 'work' }, startedAt: 8, endsAt: 12, seed: 1 };
  assert.match(new FantasyBargaining().chat(request(busy, '객실값 깎아줘'), apply).text!, /하던 일을 마치/);
  const dead = structuredClone(profile); dead.character!.hp = 0;
  assert.equal(new FantasyBargaining().chat(request(dead, '객실값 깎아줘'), apply).result, undefined);
  assert.equal(calls, 0);
});

test('merchant NPCs infer goods while inn room and food permissions cannot cross to a smith', () => {
  const profile = player(); profile.character!.location = 'emberhall'; profile.character!.visited.push('emberhall');
  const service = new FantasyBargaining(); let calls = 0;
  const apply = (revision: number, action: { type: 'haggle'; service: 'room' | 'food' | 'goods' }) => { calls++; assert.equal(action.service, 'goods'); return applyFantasyAction(profile, action, () => 0); };
  assert.match(service.chat(request(profile, '흥정', 'ko', 'borin'), apply).text!, /물품 가격.*시작할까요/);
  const result = service.chat(request(profile, '응', 'ko', 'borin'), apply); assert.equal(result.result!.error, undefined); assert.equal(calls, 1);
  assert.equal(new FantasyBargaining().chat(request(profile, '식사비 깎아줘', 'ko', 'borin'), apply).result, undefined);
});

test('definitions, casual price questions and unrelated messages never execute or implicitly approve a proposal', () => {
  const profile = player(), service = new FantasyBargaining(); let calls = 0;
  const apply = () => { calls++; return { profile, changed: true }; };
  for (const [locale, text] of [['ko', '흥정이 뭐야?'], ['en', 'What is bargaining?'], ['ja', '値引きとは何ですか？'], ['en', 'What is the room price?'], ['ko', '안녕하세요'] ] as const) {
    assert.equal(service.chat(request(profile, text, locale), apply).handled, false);
  }
  service.chat(request(profile, '객실값 깎아줘'), apply);
  assert.equal(service.chat(request(profile, '오늘 날씨 어때?'), apply).handled, false);
  assert.equal(service.chat(request(profile, '응'), apply).handled, false); assert.equal(calls, 0);
});

test('declines, timeout, changed NPC, location, life and revision cancel without executing the stored request', () => {
  const profile = player(); let calls = 0; const apply = () => { calls++; return { profile, changed: true }; };
  for (const [locale, decline] of [['ko', '취소'], ['en', 'no'], ['ja', 'いいえ']] as const) {
    const service = new FantasyBargaining(); service.chat(request(profile, '객실값 깎아줘', locale), apply);
    assert.equal(service.chat(request(profile, decline, locale), apply).handled, true);
    assert.equal(service.chat(request(profile, 'yes', locale), apply).handled, false);
  }
  const changes: ((p: FantasyProfile) => void)[] = [p => { p.revision++; }, p => { p.generation = 2; }, p => { p.character!.lifeStartedAt = 8.1; }, p => { p.character!.location = 'emberhall'; }];
  for (const change of changes) {
    const service = new FantasyBargaining(); service.chat(request(profile, '객실값 깎아줘'), apply);
    const next = structuredClone(profile); change(next);
    assert.match(service.chat(request(next, '응'), apply).text!, /취소/);
  }
  let now = 0; const expiring = new FantasyBargaining({ now: () => now });
  expiring.chat(request(profile, '객실값 깎아줘'), apply); now = 120_000;
  assert.match(expiring.chat(request(profile, '응'), apply).text!, /취소/);
  const changedNpc = new FantasyBargaining(); changedNpc.chat(request(profile, '객실값 깎아줘'), apply);
  assert.match(changedNpc.chat(request(profile, '응', 'ko', 'borin'), apply).text!, /취소/); assert.equal(calls, 0);
});

test('failed checks report the actual zero discount and enforce the server cooldown', () => {
  const profile = player(), service = new FantasyBargaining(); let calls = 0;
  const apply = (_revision: number, action: { type: 'haggle'; service: 'room' | 'food' | 'goods' }) => { calls++; return applyFantasyAction(profile, action, high); };
  service.chat(request(profile, '객실값 깎아줘'), apply);
  const failed = service.chat(request(profile, '응'), apply);
  assert.equal(failed.result!.profile.character!.bargains!.room!.discount, 0); assert.match(failed.text!, /깎아 주기 어렵/);
  assert.ok(failed.result!.profile.log.some(entry => /d100=100/.test(entry.text))); assert.doesNotMatch(failed.text!, /d100|cooldown|서버/);
  assert.match(service.chat(request(failed.result!.profile, '객실값 깎아줘'), apply).text!, /시간이 지난/); assert.equal(calls, 1);
});

test('pending confirmations are private to each player and consuming one cannot approve another player', () => {
  const profile = player(), service = new FantasyBargaining(); let calls = 0;
  const apply = () => { calls++; return { profile, changed: false }; };
  service.chat(request(profile, '객실값 깎아줘'), apply);
  assert.equal(service.chat(request(profile, '응', 'ko', 'rin', 'bob'), apply).handled, false);
  service.chat(request(profile, '응'), apply); assert.equal(calls, 1);
});

test('stored bargaining commits only after approval and a failed save consumes no money or retry approval', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-bargaining-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'fantasy.json'); let saveFails = false;
  const store = new FantasyStore(file, { onError: () => {}, save: (file, text) => { if (saveFails) throw new Error('test save failure'); fs.writeFileSync(file, text); } });
  store.apply('alice', 0, { type: 'create', source: 'human', name: 'Saved', gender: 'female' }, high);
  const service = new FantasyBargaining(), profile = store.profile('alice'); const before = fs.readFileSync(file, 'utf8'); let calls = 0;
  const apply = (revision: number, action: { type: 'haggle'; service: 'room' | 'food' | 'goods' }) => { calls++; return store.apply('alice', revision, action, () => 0); };
  service.chat(request(profile, '객실값 깎아줘'), apply); assert.equal(fs.readFileSync(file, 'utf8'), before);
  saveFails = true; const failed = service.chat(request(profile, '응'), apply);
  assert.ok(failed.result!.error); assert.equal(fs.readFileSync(file, 'utf8'), before); assert.deepEqual(store.profile('alice'), profile);
  saveFails = false; assert.equal(service.chat(request(profile, '응'), apply).handled, false);
  service.chat(request(profile, '객실값 깎아줘'), apply); const success = service.chat(request(profile, '응'), apply);
  assert.equal(success.result!.error, undefined); assert.equal(calls, 2);
  assert.deepEqual(new FantasyStore(file).profile('alice'), success.result!.profile);
  assert.ok(NPC_PUBLIC.some(npc => npc.id === 'rin' && npc.building === 'inn'));
});
