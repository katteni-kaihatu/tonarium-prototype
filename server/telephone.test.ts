import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newTelephoneGame, registerTelephone, startTelephone, submitTelephone, tickTelephone,
  telephoneAction, telephoneView, telephoneItemFor, telephoneState, reconcileTelephoneHost, canStartTelephone, hasTelephoneHistory } from './telephone.ts';
import { emptyTelephoneView, telephoneChain, telephoneDuration, telephoneKind, TELEPHONE_MAX_POINTS,
  type TelephoneAnswer, type TelephoneParticipant } from '../shared/telephone.ts';
import type { Item } from '../shared/items.ts';

const person = (id: string): TelephoneParticipant => ({ id, name: `name-${id}`, kind: 'human' });
function setup(n = 2) {
  const g = newTelephoneGame();
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  for (const id of ids) registerTelephone(g, person(id), true);
  return { g, ids, present: new Set(ids) };
}
const text = (s = 'private'): TelephoneAnswer => ({ kind: 'text', text: s });
const drawing = (): TelephoneAnswer => ({ kind: 'drawing', strokes: [{ color: '#111111', size: 4, pts: [1, 2, 3, 4] }] });

test('only 2..30 present registered humans can start; identity is per item', () => {
  for (const n of [1, 2, 30, 31]) {
    const { g, ids, present } = setup(n);
    assert.equal(startTelephone(g, ids[0], present, 100), n >= 2 && n <= 30);
    if (n >= 2 && n <= 30) assert.equal(g.host, ids[0]);
  }
  const { g, present } = setup();
  assert.equal(startTelephone(g, 'observer', present, 0), false);
  assert.equal(startTelephone(g, 'p0', new Set(['p0']), 0), false);
  const other = setup().g;
  registerTelephone(g, person('p0'), false);
  assert.equal(other.registered.length, 2);
  assert.equal(registerTelephone(other, person('p0'), true), false);
});

test('cyclic assignments visit each chain and each participant exactly once for every supported size', () => {
  for (let count = 2; count <= 30; count++) {
    const seen = Array.from({ length: count }, () => new Set<number>());
    for (let step = 0; step < count; step++) {
      const assigned = new Set<number>();
      for (let i = 0; i < count; i++) {
        const chain = telephoneChain(i, step, count);
        assigned.add(chain);
        seen[chain].add(i);
      }
      assert.equal(assigned.size, count);
    }
    assert.ok(seen.every(s => s.size === count));
  }
});

test('all-submit runs finish after exactly N stages, with N unique authors per chain', () => {
  for (const count of [2, 3, 30]) {
    const { g, ids, present } = setup(count);
    startTelephone(g, 'p0', present, 0);
    for (let step = 0; step < count; step++) {
      assert.equal(g.phase, 'playing');
      assert.equal(g.step, step);
      for (const id of ids) {
        assert.equal(submitTelephone(g, id, 1, step, telephoneKind(step) === 'text' ? text(id) : drawing(), step + 1), true);
      }
    }
    assert.equal(g.phase, 'results');
    assert.ok(g.chains.every(c => c.length === count && new Set(c.map(e => e.by)).size === count));
  }
});

test('participants and order freeze; later registration and withdrawal do not change assignment or submission', () => {
  const { g, present } = setup(3);
  startTelephone(g, 'p0', present, 0);
  const frozen = structuredClone(g.participants);
  registerTelephone(g, person('late'), true);
  present.add('late');
  registerTelephone(g, person('p1'), false);
  assert.deepEqual(g.participants, frozen);
  assert.equal(submitTelephone(g, 'late', 1, 0, text(), 1), false);
  assert.equal(submitTelephone(g, 'p1', 1, 0, text(), 1), true);
  assert.equal(telephoneView(g, 'late', present).assignment, undefined);
  for (const id of present) assert.equal(startTelephone(g, id, present, 2), false);
});

test('text is 60s, drawing is 120s; early all-submit advances once and rejects duplicate or stale requests', () => {
  const { g, present } = setup(3);
  startTelephone(g, 'p0', present, 100);
  assert.equal(g.deadline, 60_100);
  assert.equal(submitTelephone(g, 'p0', 1, 0, drawing(), 101), false);
  assert.equal(submitTelephone(g, 'outsider', 1, 0, text(), 101), false);
  assert.equal(submitTelephone(g, 'p0', 1, 0, text(), 101), true);
  assert.equal(submitTelephone(g, 'p0', 1, 0, text(), 102), false);
  assert.equal(submitTelephone(g, 'p1', 1, 0, text(), 103), true);
  assert.equal(submitTelephone(g, 'p2', 1, 0, text(), 104), true);
  assert.equal(g.step, 1);
  assert.equal(g.deadline, 120_104);
  assert.equal(tickTelephone(g, 60_100), false);
  assert.equal(submitTelephone(g, 'p2', 1, 0, text(), 105), false);
  tickTelephone(g, 120_104);
  assert.equal(g.step, 2);
  assert.equal(g.deadline, 180_104);
  tickTelephone(g, 180_104);
  assert.equal(g.phase, 'results');
  assert.equal(g.chains.length, 3);
  assert.ok(g.chains.every(c => c.length === 3));
});

test('deadline wins at equality regardless of callback order; missing submissions become blank', () => {
  for (const tickFirst of [false, true]) {
    const { g, present } = setup();
    startTelephone(g, 'p0', present, 0);
    submitTelephone(g, 'p0', 1, 0, text('keep'), 59_999);
    if (tickFirst) tickTelephone(g, 60_000);
    telephoneAction(g, person('p1'), { a: 'telephoneSubmit', round: 1, step: 0, answer: text('too late') }, present, 60_000, () => 0);
    assert.equal(g.step, 1);
    assert.deepEqual(g.chains[1][0].answer, text(''));
    assert.deepEqual(g.chains[0][0].answer, text('keep'));
    assert.equal(tickTelephone(g, 60_000), false);
    tickTelephone(g, 180_000);
    assert.equal(g.phase, 'results');
    assert.ok(g.chains.every(c => c[1].answer.kind === 'drawing' && c[1].answer.strokes.length === 0));
  }
});

test('all absent continues, persists through JSON roundtrip and restores current assignment or results without TTL', () => {
  const { g, present } = setup(30);
  startTelephone(g, 'p0', present, 0);
  submitTelephone(g, 'p0', 1, 0, text('retained'), 1);
  present.clear();
  reconcileTelephoneHost(g, present, () => 0);
  assert.equal(g.host, null);
  let restored = JSON.parse(JSON.stringify(g)) as typeof g;
  tickTelephone(restored, 60_000 + 120_000 + 1);
  present.add('p0');
  reconcileTelephoneHost(restored, present, () => 0);
  assert.equal(restored.host, 'p0');
  assert.equal(telephoneView(restored, 'p0', present).step, 2);
  assert.ok(telephoneView(restored, 'p0', present).assignment);
  const end = Array.from({ length: 30 }, (_, n) => telephoneDuration(n)).reduce((a, b) => a + b, 0);
  tickTelephone(restored, end + 100_000_000_000);
  assert.equal(restored.phase, 'results');
  restored = JSON.parse(JSON.stringify(restored)) as typeof g;
  assert.deepEqual(restored.chains[0][0].answer, text('retained'));
  assert.ok(restored.chains.every(c => c.length === 30 && new Set(c.map(e => e.by)).size === 30));
});

test('host randomly transfers to present registrants including next-round waiters, and recovers after no candidates', () => {
  const { g, present } = setup(3);
  startTelephone(g, 'p0', present, 0);
  present.delete('p0');
  assert.equal(reconcileTelephoneHost(g, present, () => 0.99), true);
  assert.equal(g.host, 'p2');
  present.clear();
  assert.equal(reconcileTelephoneHost(g, present, () => 0), true);
  assert.equal(g.host, null);
  registerTelephone(g, person('late'), true);
  present.add('late');
  reconcileTelephoneHost(g, present, () => 0);
  assert.equal(g.host, 'late');
  assert.equal(g.participants.some(p => p.id === 'late'), false);
  assert.equal(startTelephone(g, 'late', present, 1), false);
});

test('only eligible results host restarts; absent host permits any present registrant; invalid starts preserve history', () => {
  const { g, present } = setup();
  startTelephone(g, 'p0', present, 0);
  tickTelephone(g, 180_000);
  const history = structuredClone(g.chains);
  assert.equal(canStartTelephone(g, 'p1', present), false);
  assert.equal(startTelephone(g, 'p1', present, 190_000), false);
  assert.deepEqual(g.chains, history);
  present.delete('p0');
  registerTelephone(g, person('late'), true);
  present.add('late');
  assert.equal(canStartTelephone(g, 'p1', present), true);
  assert.equal(startTelephone(g, 'late', present, 200_000), true);
  assert.equal(g.host, 'late');
  assert.deepEqual(g.participants.map(p => p.id), ['p1', 'late']);
  assert.equal(g.round, 2);
  assert.ok(g.chains.every(c => !c.length));
  assert.equal(g.revealed, 0);
  assert.equal(g.page, 0);
  assert.equal(submitTelephone(g, 'p1', 1, 0, text('stale'), 200_001), false);
});

test('wire projections expose only own current answer and the required predecessor; secret storage never reaches viewers', () => {
  const { g, present } = setup(3);
  startTelephone(g, 'p0', present, 0);
  submitTelephone(g, 'p0', 1, 0, text('p0 secret'), 1);
  submitTelephone(g, 'p1', 1, 0, text('p1 secret'), 1);
  const observer = telephoneView(g, 'observer', present);
  assert.equal(JSON.stringify(observer).includes('secret'), false);
  assert.equal(JSON.stringify(telephoneView(g, 'p1', present)).includes('p0 secret'), false);
  assert.deepEqual(telephoneView(g, 'p0', present).assignment?.own, text('p0 secret'));
  submitTelephone(g, 'p2', 1, 0, text('p2 secret'), 2);
  assert.deepEqual(telephoneView(g, 'p1', present).assignment?.previous?.answer, text('p0 secret'));
  assert.equal(JSON.stringify(telephoneView(g, 'p1', present)).includes('p2 secret'), false);
  const item: Item & { telephoneState: typeof g; futureSecret: string } = { id: 'i', kind: 'telephone', x: 0, z: 0, ry: 0,
    createdBy: 'p0', updatedBy: 'p0', game: emptyTelephoneView(), telephoneState: g, futureSecret: 'do not send' };
  for (const id of ['observer', 'late', 'p0', 'p1', 'p2']) {
    const projected = telephoneItemFor(item, id, present);
    assert.equal('telephoneState' in projected, false);
    assert.equal('futureSecret' in projected, false);
    assert.equal(projected.kind, 'telephone');
  }
  const copy = telephoneView(g, 'p1', present);
  if (copy.assignment?.previous?.answer.kind === 'text') copy.assignment.previous.answer.text = 'mutated';
  assert.deepEqual(g.chains[0][0].answer, text('p0 secret'));
  assert.equal(telephoneState(item), g);
});

test('results publish in chain/step order, synchronize navigation and restore only published entries on reconnect', () => {
  const { g, present } = setup();
  startTelephone(g, 'p0', present, 0);
  submitTelephone(g, 'p0', 1, 0, text('private result'), 1);
  tickTelephone(g, 180_000);
  assert.equal(telephoneView(g, 'p0', present).results.length, 0);
  assert.equal(telephoneAction(g, person('p1'), { a: 'telephoneReveal', round: 1 }, present, 180_001, () => 0), false);
  assert.equal(telephoneAction(g, person('p0'), { a: 'telephonePage', round: 1, page: 3 }, present, 180_001, () => 0), false);
  for (let n = 0; n < 4; n++) {
    telephoneAction(g, person('p0'), { a: 'telephoneReveal', round: 1 }, present, 180_001, () => 0);
    const a = telephoneView(g, 'observer', present), b = telephoneView(g, 'late', present);
    assert.deepEqual(a.results, b.results);
    assert.equal(a.results.length, n + 1);
    assert.equal(a.page, n);
    assert.deepEqual([a.results[n].chain, a.results[n].step], [Math.floor(n / 2), n % 2]);
  }
  telephoneAction(g, person('p0'), { a: 'telephonePage', round: 1, page: 0 }, present, 180_001, () => 0);
  assert.equal(telephoneView(JSON.parse(JSON.stringify(g)), 'observer', present).page, 0);
  assert.equal(telephoneAction(g, person('p0'), { a: 'telephoneReveal', round: 0 }, present, 180_001, () => 0), false);
  startTelephone(g, 'p0', present, 200_000);
  assert.equal(telephoneView(g, 'observer', present).results.length, 0);
  assert.equal(JSON.stringify(g).includes('private result'), false);
});

test('malformed drawings and text never become stored answers', () => {
  const { g, present } = setup();
  startTelephone(g, 'p0', present, 0);
  for (const value of [null, {}, { kind: 'text', text: 123 }, text('a'.repeat(1001))])
    assert.equal(submitTelephone(g, 'p0', 1, 0, value, 1), false);
  tickTelephone(g, 60_000);
  for (const value of [{ kind: 'drawing', strokes: null }, { kind: 'drawing', strokes: [{ color: 'url(secret)', size: 4, pts: [0, 0] }] },
    { kind: 'drawing', strokes: [{ color: '#111111', size: Infinity, pts: [0, 0] }] },
    { kind: 'drawing', strokes: [{ color: '#111111', size: 4, pts: [NaN, 0] }] },
    { kind: 'drawing', strokes: [{ color: '#111111', size: 4, pts: [621, 0] }] },
    { kind: 'drawing', strokes: [{ color: '#111111', size: 4, pts: [1] }] },
    { kind: 'drawing', strokes: [{ color: '#111111', size: 4, pts: Array((TELEPHONE_MAX_POINTS + 1) * 2).fill(1) }] }])
    assert.equal(submitTelephone(g, 'p0', 1, 1, value, 60_001), false);
  assert.equal(submitTelephone(g, 'p0', 1, 1, drawing(), 60_001), true);
});

test('submission stores only validated answer fields and copies caller-owned arrays', () => {
  const { g, present } = setup();
  startTelephone(g, 'p0', present, 0);
  const answer = { ...text('clean'), extra: 'unbounded payload' };
  assert.equal(submitTelephone(g, 'p0', 1, 0, answer, 1), true);
  assert.deepEqual(g.chains[0][0].answer, text('clean'));
  tickTelephone(g, 60_000);
  const picture = drawing();
  assert.ok(picture.kind === 'drawing');
  assert.equal(submitTelephone(g, 'p0', 1, 1, picture, 60_001), true);
  picture.strokes[0].pts[0] = 999;
  assert.deepEqual(g.chains[1][1].answer, drawing());
});

test('empty sessions retain playing and finished history until the item is explicitly removed', () => {
  const item: Item = { id: 'retained', kind: 'telephone', x: 0, z: 0, ry: 0, createdBy: 'p0', updatedBy: 'p0', game: emptyTelephoneView() };
  assert.equal(hasTelephoneHistory([item]), false);
  const g = telephoneState(item);
  for (const id of ['p0', 'p1']) registerTelephone(g, person(id), true);
  startTelephone(g, 'p0', new Set(['p0', 'p1']), 0);
  assert.equal(hasTelephoneHistory([item]), true);
  tickTelephone(g, 1_000_000_000_000);
  assert.equal(g.phase, 'results');
  assert.equal(hasTelephoneHistory([JSON.parse(JSON.stringify(item))]), true);
  assert.equal(hasTelephoneHistory([]), false);
});
