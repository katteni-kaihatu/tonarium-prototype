import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FantasyPropertyDialogue } from './fantasy-property-dialogue.ts';
import { FantasyStore } from './fantasy-store.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { applyFantasyPropertyCommand, fantasyPropertyState, newFantasyPropertyLedger, type FantasyPropertyCommand } from '../shared/fantasy-property.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';
import type { NpcLocale } from '../shared/npc.ts';

function person(name = 'Alice') { const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name }, () => .5).profile; p.character!.gold = 1000; p.character!.hour = 8; return p; }
function fixture() {
  let now = 0, ledger = newFantasyPropertyLedger(), profiles: Record<string, FantasyProfile> = { alice: person(), bob: person('Bob') }, serial = 0;
  const dialogue = new FantasyPropertyDialogue(() => now), calls: FantasyPropertyCommand[] = [];
  const state = () => fantasyPropertyState(ledger, profiles, 'alice');
  const apply = (command: FantasyPropertyCommand) => {
    calls.push(command); const result = applyFantasyPropertyCommand(ledger, profiles, 'alice', command, 8);
    if (!result.error) { ledger = result.ledger; profiles = result.profiles; }
    return { error: result.error, updates: result.error ? [] : [{ user: 'alice', profile: profiles.alice }] };
  };
  const chat = (text: string, options: { user?: string; npc?: string; locale?: NpcLocale; profile?: FantasyProfile } = {}) => dialogue.chat({ user: options.user ?? 'alice', npc: options.npc ?? 'hearth-alia', locale: options.locale ?? 'ko', text,
    profile: options.profile ?? profiles[options.user ?? 'alice'], state: state(), requestId: `dialogue-${serial++}` }, apply, state);
  const otherBuyer = () => { const result = applyFantasyPropertyCommand(ledger, profiles, 'bob', { type: 'buy', plot: 'hearth-residence', revision: ledger.plots['hearth-residence'].revision, requestId: 'bob-buys' }, 8); assert.equal(result.error, undefined); ledger = result.ledger; profiles = result.profiles; };
  return { dialogue, chat, state, calls, apply, otherBuyer, now: (value: number) => { now = value; }, ledger: () => ledger, profiles: () => profiles };
}

test('property bargaining gives a real local offer before a separate yes purchases it exactly once', () => {
  const f = fixture(), before = f.profiles().alice.character!.gold, first = f.chat('주거 집값 흥정하고 싶어'); assert.equal(first.handled, true); assert.match(first.text!, /G/); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].type, 'bargain');
  const offer = f.state().plots.find(plot => plot.id === 'hearth-residence')!.management!.bargain!.price;
  assert.equal(f.profiles().alice.character!.gold, before); assert.equal(f.ledger().plots['hearth-residence'].owner, null);
  const agreed = f.chat('응'); assert.equal(agreed.handled, true); assert.equal(f.calls[1].type, 'acceptBargain'); assert.equal(f.ledger().plots['hearth-residence'].owner?.user, 'alice'); assert.equal(f.profiles().alice.character!.gold, before - offer);
  assert.equal(f.chat('응').handled, false); assert.equal(f.calls.length, 2);
});

test('ambiguous property kinds request a named choice without bargaining or buying either one', () => {
  const f = fixture(); assert.equal(f.chat('농지와 업장 가격 흥정').handled, true); assert.equal(f.calls.length, 0);
  assert.equal(f.chat('yes').handled, true); assert.equal(f.calls.length, 0);
  const chosen = f.chat('농지'); assert.equal(chosen.handled, true); assert.equal(f.calls.length, 1); assert.ok('plot' in f.calls[0]); assert.equal(f.calls[0].plot, 'hearth-farmland'); assert.equal(f.ledger().plots['hearth-farmland'].owner, null);
});

test('property explanations do not start negotiations and another buyer can legitimately win the listing', () => {
  const f = fixture(); assert.equal(f.chat('부동산 흥정이 뭐야').handled, false); assert.equal(f.calls.length, 0);
  f.chat('주거 집값 흥정'); f.otherBuyer(); const before = f.profiles().alice.character!.gold;
  assert.equal(f.chat('응').handled, true); assert.equal(f.calls.length, 1); assert.equal(f.profiles().alice.character!.gold, before); assert.equal(f.ledger().plots['hearth-residence'].owner?.user, 'bob');
});

test('cancel consumes the spoken offer and cannot be revived by a later yes', () => {
  const f = fixture(); f.chat('주거 집값 흥정'); assert.equal(f.chat('취소').handled, true); assert.equal(f.chat('응').handled, false); assert.equal(f.calls.length, 1);
});

test('the quote is private to the original player and actual local property speaker', () => {
  const f = fixture(); f.chat('주거 집값 흥정');
  assert.equal(f.chat('응', { user: 'bob' }).handled, false); assert.equal(f.chat('응', { npc: 'hearth-galen' }).handled, false); assert.equal(f.chat('응', { npc: 'rin' }).handled, false); assert.equal(f.calls.length, 1);
  assert.equal(f.chat('응').handled, true); assert.equal(f.calls.length, 2);
});

test('expiry, locale, new life, same-life restart and changed personal state invalidate a quoted purchase', () => {
  for (const alter of [(f: ReturnType<typeof fixture>) => f.now(120000), (f: ReturnType<typeof fixture>) => { f.profiles().alice.generation = 2; },
    (f: ReturnType<typeof fixture>) => { f.profiles().alice.character!.lifeStartedAt = 9; }, (f: ReturnType<typeof fixture>) => { f.profiles().alice.revision++; }]) {
    const f = fixture(); f.chat('주거 집값 흥정'); alter(f); assert.equal(f.chat('응').handled, true); assert.equal(f.calls.length, 1); assert.equal(f.ledger().plots['hearth-residence'].owner, null);
  }
  const f = fixture(); f.chat('주거 집값 흥정'); assert.equal(f.chat('yes', { locale: 'en' }).handled, true); assert.equal(f.calls.length, 1);
});

test('plot revision changes invalidate an offer even when its advertised price did not change', () => {
  const f = fixture(); f.chat('주거 집값 흥정'); f.ledger().plots['hearth-residence'].revision++;
  assert.equal(f.chat('응').handled, true); assert.equal(f.calls.length, 1); assert.equal(f.ledger().plots['hearth-residence'].owner, null);
});

test('a new owner, new price or busy character cannot reuse a previously spoken offer', () => {
  for (const alter of [(f: ReturnType<typeof fixture>) => { f.ledger().plots['hearth-residence'].extension!.bargain!.price++; },
    (f: ReturnType<typeof fixture>) => { f.profiles().alice.event = 'pending'; }, (f: ReturnType<typeof fixture>) => { f.profiles().alice.combatId = 'battle'; },
    (f: ReturnType<typeof fixture>) => { f.profiles().alice.death = { location: 'hearth', hour: 8, cause: 'test' }; }]) {
    const f = fixture(); f.chat('주거 집값 흥정'); alter(f); assert.equal(f.chat('응').handled, true); assert.equal(f.calls.length, 1);
  }
});

test('all three languages keep property negotiation in-world and show the concrete quoted amount', () => {
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const f = fixture(), result = f.chat({ ko: '주거 집값 흥정', en: 'bargain house property', ja: '住宅の値引き交渉' }[locale], { locale });
    assert.equal(result.handled, true); assert.match(result.text!, /\d+G/); assert.doesNotMatch(result.text!, /ゲーム|game|server|npc|게임|서버|판정|requestId|revision/i);
    assert.equal(f.chat({ ko: '응', en: 'yes', ja: 'はい' }[locale], { locale }).handled, true); assert.equal(f.calls.length, 2);
  }
});

test('real-store negotiated purchase failures preserve quoted ownership and gold before a clean retry', (t: TestContext) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-property-dialogue-'));
  t.after(() => { const resolved = path.resolve(directory); assert.equal(path.dirname(resolved), path.resolve(os.tmpdir())); assert.ok(path.basename(resolved).startsWith('fantasy-property-dialogue-')); fs.rmSync(resolved, { recursive: true, force: true }); });
  const file = path.join(directory, 'fantasy.json'); fs.writeFileSync(file, JSON.stringify({ alice: person() })); let fail = false, serial = 0;
  const store = new FantasyStore(file, { worldHour: () => 8, onError: () => {}, save: (target, value) => { if (fail) throw new Error('Test disk full'); fs.writeFileSync(target, value); } }); assert.equal(store.loadError, undefined);
  const dialogue = new FantasyPropertyDialogue(), current = () => store.propertyState('alice');
  const chat = (text: string) => dialogue.chat({ user: 'alice', npc: 'hearth-alia', text, locale: 'ko', profile: store.profile('alice'), state: current(), requestId: `property-dialogue-${serial++}` }, command => store.propertyRequest('alice', command), current);
  assert.equal(chat('주거 집값 흥정').handled, true); const before = store.profile('alice'), state = current(), bytes = fs.readFileSync(file, 'utf8');
  fail = true; const failed = chat('응'); assert.equal(failed.handled, true); assert.deepEqual(store.profile('alice'), before); assert.deepEqual(current(), state); assert.equal(fs.readFileSync(file, 'utf8'), bytes);
  fail = false; assert.equal(chat('응').handled, false); assert.equal(store.profile('alice').character!.gold, before.character!.gold);
});
