import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserAiBroker } from './browser-ai.ts';
import { BrowserAiPool } from './browser-ai-pool.ts';
import { BROWSER_AI_MODEL, type BrowserAiCooperation, type BrowserAiGeneration, type BrowserAiJob, type BrowserAiServerMsg } from '../shared/ai-support.ts';

const personal = (requestId = 'original-owner-request', kind: 'npc' | 'gm' = 'npc'): BrowserAiGeneration => ({
  requestId, kind, maxTokens: 96, temperature: .7,
  messages: [{ role: 'system', content: 'PRIVATE_OWNER_IDENTIFIER:alice. PRIVATE_INVENTORY: rare gem. PRIVATE_QUEST: hidden temple.' },
    { role: 'user', content: 'PRIVATE_DIALOGUE: my personal concern.' }],
});
const shared = (kind: 'npc' | 'gm' = 'npc'): BrowserAiGeneration => ({
  requestId: 'public-template-id', kind, maxTokens: 80, temperature: .7,
  messages: [{ role: 'system', content: 'A public innkeeper offers a brief welcoming thought.' }, { role: 'user', content: 'Offer a quiet thought about resting.' }],
});
const cooperation = (change: Partial<BrowserAiCooperation> = {}): BrowserAiCooperation => ({ version: 2, shareIdle: true, allowRemote: true, idle: true, ...change });
const response = (job: BrowserAiJob, text = 'A shared public reply.') => ({ t: 'aiSupportResult', leaseId: job.leaseId, epoch: job.epoch, text });

function fixture(t: TestContext) {
  let now = 0;
  const pool = new BrowserAiPool({ now: () => now });
  const all: BrowserAiBroker[] = [];
  t.after(() => { for (const broker of all) broker.close(); });
  const peer = (initialUser: string, options: { session?: string; eligible?: boolean; ready?: boolean; cooperation?: BrowserAiCooperation | null } = {}) => {
    let user: string | null = initialUser, session: string | null = options.session ?? 'fantasy-one', eligible = options.eligible ?? true;
    const sent: BrowserAiServerMsg[] = [];
    const broker = new BrowserAiBroker(message => sent.push(structuredClone(message)), { now: () => now }); all.push(broker);
    const status = (ready = true, choice: BrowserAiCooperation | null = options.cooperation === undefined ? cooperation() : options.cooperation) =>
      broker.setReady({ t: 'aiSupport', ready, epoch: `epoch-${initialUser}`, model: BROWSER_AI_MODEL, ...(choice ? { cooperation: choice } : {}) });
    status(options.ready ?? true);
    const unregister = pool.register(broker, { user: () => user, session: () => session, eligible: () => eligible });
    const jobs = () => sent.filter((message): message is Extract<BrowserAiServerMsg, { t: 'aiSupportJob' }> => message.t === 'aiSupportJob').map(message => message.job);
    const job = () => { const value = jobs().at(-1); assert.ok(value); return value; };
    return { broker, sent, status, unregister, jobs, job,
      move(next: { user?: string | null; session?: string | null; eligible?: boolean }) {
        if (next.user !== undefined) user = next.user;
        if (next.session !== undefined) session = next.session;
        if (next.eligible !== undefined) eligible = next.eligible;
      },
    };
  };
  return { pool, peer, advance(value: number) { now = value; } };
}

test('a ready owner uses their private worker once and never exposes the personal payload to a donor', async t => {
  const f = fixture(t), owner = f.peer('alice', { cooperation: null }), donor = f.peer('bob');
  const pending = f.pool.generateFor('alice', 'fantasy-one', owner.broker, personal(), new AbortController().signal, shared());
  assert.equal(owner.job().scope, 'self'); assert.equal(owner.job().requestId, personal().requestId);
  assert.deepEqual(owner.job().messages, personal().messages); assert.equal(donor.jobs().length, 0);
  owner.broker.result(response(owner.job(), 'A private local reply.')); assert.equal(await pending, 'A private local reply.');
});

test('an opted-in owner borrows only the separate public payload with an opaque ID', async t => {
  const f = fixture(t), owner = f.peer('alice', { ready: false }), donor = f.peer('bob');
  const publicRequest = shared(), pending = f.pool.generateFor('alice', 'fantasy-one', owner.broker, personal(), new AbortController().signal, publicRequest);
  const job = donor.job(); publicRequest.messages[0].content = 'Changed after assignment.';
  assert.equal(job.scope, 'shared'); assert.notEqual(job.requestId, personal().requestId); assert.notEqual(job.requestId, 'public-template-id');
  assert.deepEqual(job.messages, shared().messages); assert.equal(job.maxTokens, 80); assert.equal(owner.jobs().length, 0);
  assert.doesNotMatch(JSON.stringify(job), /alice|PRIVATE_|original-owner-request|public-template-id/);
  assert.deepEqual(Object.keys(job).sort(), ['epoch', 'expiresAt', 'kind', 'leaseId', 'maxTokens', 'messages', 'requestId', 'scope', 'temperature'].sort());
  donor.broker.result(response(job)); assert.equal(await pending, 'A shared public reply.');
});

test('legacy consent, declined remote processing and a missing or malformed public payload never borrow another device', async t => {
  for (const ownerChoice of [null, cooperation({ allowRemote: false })]) {
    const f = fixture(t), owner = f.peer('alice', { ready: false, cooperation: ownerChoice }), donor = f.peer('bob');
    assert.equal(await f.pool.generateFor('alice', 'fantasy-one', owner.broker, personal(), new AbortController().signal, shared()), undefined);
    assert.equal(donor.jobs().length, 0);
  }
  const f = fixture(t), owner = f.peer('alice', { ready: false }), donor = f.peer('bob');
  for (const publicRequest of [undefined, { ...shared(), kind: 'gm' as const }, { ...shared(), private: 'must not be serialized' } as BrowserAiGeneration]) {
    assert.equal(await f.pool.generateFor('alice', 'fantasy-one', owner.broker, personal(), new AbortController().signal, publicRequest), undefined);
  }
  assert.equal(donor.jobs().length, 0);
});

test('different worlds, legacy donors, non-idle donors, withdrawn support and ineligible members cannot contribute', async t => {
  const f = fixture(t), owner = f.peer('alice', { ready: false });
  const donors = [
    f.peer('other-world', { session: 'fantasy-two' }), f.peer('legacy', { cooperation: null }),
    f.peer('no-sharing', { cooperation: cooperation({ shareIdle: false }) }),
    f.peer('own-chat-open', { cooperation: cooperation({ idle: false }) }), f.peer('not-ready', { ready: false }),
    f.peer('outside-fantasy', { eligible: false }), f.peer('alice'),
  ];
  assert.equal(await f.pool.generateFor('alice', 'fantasy-one', owner.broker, personal(), new AbortController().signal, shared()), undefined);
  assert.ok(donors.every(donor => donor.jobs().length === 0));
  assert.equal(await f.pool.generateFor('forged-owner', 'fantasy-one', owner.broker, personal(), new AbortController().signal, shared()), undefined);
  owner.move({ eligible: false });
  assert.equal(await f.pool.generateFor('alice', 'fantasy-one', owner.broker, personal(), new AbortController().signal, shared()), undefined);
});

test('simultaneous loans keep provider ownership and reject forged, duplicate and repeated pending requests', async t => {
  const f = fixture(t), alice = f.peer('alice', { ready: false }), carol = f.peer('carol', { ready: false }), bob = f.peer('bob'), dave = f.peer('dave');
  const a = f.pool.generateFor('alice', 'fantasy-one', alice.broker, personal(), new AbortController().signal, shared());
  const duplicate = await f.pool.generateFor('alice', 'fantasy-one', alice.broker, personal(), new AbortController().signal, shared());
  assert.equal(duplicate, undefined); assert.equal(dave.jobs().length, 0);
  const c = f.pool.generateFor('carol', 'fantasy-one', carol.broker, personal(), new AbortController().signal, shared());
  assert.equal(bob.jobs().length, 1); assert.equal(dave.jobs().length, 1);
  assert.equal(bob.broker.result(response(dave.job())), false); assert.equal(dave.broker.result(response(bob.job())), false);
  assert.equal(alice.broker.result(response(bob.job())), false);
  assert.equal(bob.broker.result(response(bob.job(), 'For Alice.')), true); assert.equal(await a, 'For Alice.');
  assert.equal(bob.broker.result(response(bob.job(), 'A duplicate.')), false);
  assert.equal(dave.broker.result(response(dave.job(), 'For Carol.')), true); assert.equal(await c, 'For Carol.');
});

test('round-robin loans spread sequential work fairly and a busy worker never receives a second job', async t => {
  const f = fixture(t), owner = f.peer('alice', { ready: false }), donors = [f.peer('bob'), f.peer('carol'), f.peer('dave')];
  for (let index = 0; index < 6; index++) {
    const pending = f.pool.generateFor('alice', 'fantasy-one', owner.broker, personal(`fair-${index}`), new AbortController().signal, shared());
    const donor = donors[index % donors.length];
    assert.equal(donor.jobs().length, Math.floor(index / donors.length) + 1);
    donor.broker.result(response(donor.job())); await pending;
  }
  const pending = f.pool.generateFor('alice', 'fantasy-one', owner.broker, personal('busy-first'), new AbortController().signal, shared());
  const second = f.pool.generateFor('alice', 'fantasy-one', owner.broker, personal('busy-second'), new AbortController().signal, shared());
  assert.equal(donors[0].jobs().length, 3); assert.equal(donors[1].jobs().length, 3); assert.equal(donors[2].jobs().length, 2);
  donors[0].broker.result(response(donors[0].job())); donors[1].broker.result(response(donors[1].job())); await Promise.all([pending, second]);
});

test('resource withdrawal cancels one shared attempt and never silently retries another donor', async t => {
  const f = fixture(t), owner = f.peer('alice', { ready: false }), donor = f.peer('bob'), spare = f.peer('carol');
  let serverCalls = 0;
  const pending = f.pool.generateFor('alice', 'fantasy-one', owner.broker, personal(), new AbortController().signal, shared()).then(text => {
    if (text !== undefined) return text; serverCalls++; return 'Server fallback.';
  });
  const old = donor.job(); donor.status(false);
  assert.equal(await pending, 'Server fallback.'); assert.equal(serverCalls, 1); assert.equal(spare.jobs().length, 0);
  assert.equal(donor.broker.result(response(old, 'Late after memory pressure.')), false); assert.equal(serverCalls, 1);
  assert.equal(donor.sent.filter(message => message.t === 'aiSupportCancel').length, 1);
});

test('personal conversation preempts a contribution and requires interruption acknowledgement before personal reuse', async t => {
  const f = fixture(t), owner = f.peer('alice', { ready: false }), donor = f.peer('bob');
  const pending = f.pool.generateFor('alice', 'fantasy-one', owner.broker, personal(), new AbortController().signal, shared()), old = donor.job();
  const release = f.pool.beginConversation('bob');
  assert.equal(await pending, undefined); assert.equal(donor.broker.available, false); assert.equal(donor.broker.result(response(old)), false);
  assert.equal(await f.pool.generateFor('bob', 'fantasy-one', donor.broker, personal('own-before-ack'), new AbortController().signal, shared()), undefined);
  donor.status();
  const own = f.pool.generateFor('bob', 'fantasy-one', donor.broker, personal('own-after-ack'), new AbortController().signal, shared());
  assert.equal(donor.job().scope, 'self'); donor.broker.result(response(donor.job(), 'Personal reply.')); assert.equal(await own, 'Personal reply.');
  release(); release();
  assert.equal(await f.pool.generateFor('alice', 'fantasy-one', owner.broker, personal('cooling'), new AbortController().signal, shared()), undefined);
  f.advance(2000);
  const resumed = f.pool.generateFor('alice', 'fantasy-one', owner.broker, personal('after-cooldown'), new AbortController().signal, shared());
  assert.equal(donor.job().scope, 'shared'); donor.broker.result(response(donor.job())); await resumed;
});

test('overlapping NPC and GM conversations reserve every connection of the same contributor until all finish', async t => {
  const f = fixture(t), owner = f.peer('alice', { ready: false }), donor = f.peer('bob'), otherTab = f.peer('bob');
  const a = f.pool.beginConversation('bob'), b = f.pool.beginConversation('bob');
  a(); f.advance(5000);
  assert.equal(await f.pool.generateFor('alice', 'fantasy-one', owner.broker, personal(), new AbortController().signal, shared()), undefined);
  assert.equal(donor.jobs().length, 0); assert.equal(otherTab.jobs().length, 0);
  b(); f.advance(6999);
  assert.equal(await f.pool.generateFor('alice', 'fantasy-one', owner.broker, personal(), new AbortController().signal, shared()), undefined);
  f.advance(7000);
  const pending = f.pool.generateFor('alice', 'fantasy-one', owner.broker, personal(), new AbortController().signal, shared());
  donor.broker.result(response(donor.job())); await pending;
});

test('canceling one owner stops their remote lease without canceling another player or a personal conversation', async t => {
  const f = fixture(t), owner = f.peer('alice', { ready: false }), donor = f.peer('bob'), other = f.peer('carol');
  const a = f.pool.generateFor('alice', 'fantasy-one', owner.broker, personal(), new AbortController().signal, shared()), old = donor.job();
  const c = f.pool.generateFor('carol', 'fantasy-one', other.broker, personal(), new AbortController().signal, shared());
  f.pool.cancelOwner('alice'); assert.equal(await a, undefined); assert.equal(donor.broker.result(response(old)), false);
  assert.equal(other.broker.pendingScope, 'self'); assert.equal(other.sent.some(message => message.t === 'aiSupportCancel'), false);
  other.broker.result(response(other.job(), 'Unaffected personal reply.')); assert.equal(await c, 'Unaffected personal reply.');
});

test('request abort, provider removal and requester removal all release their remote assignment', async t => {
  for (const operation of ['abort', 'provider', 'requester', 'close'] as const) {
    const f = fixture(t), owner = f.peer('alice', { ready: false }), donor = f.peer('bob'), controller = new AbortController();
    const pending = f.pool.generateFor('alice', 'fantasy-one', owner.broker, personal(), controller.signal, shared()), old = donor.job();
    if (operation === 'abort') controller.abort();
    else if (operation === 'provider') donor.unregister();
    else if (operation === 'requester') owner.unregister();
    else donor.broker.close();
    assert.equal(await pending, undefined); assert.equal(donor.broker.result(response(old)), false);
    donor.unregister(); donor.unregister(); owner.unregister();
  }
});

test('changed remote permission or membership cannot authorize an already completed remote answer', async t => {
  for (const operation of ['remote-off', 'owner-world', 'provider-world', 'provider-identity', 'provider-ineligible'] as const) {
    const f = fixture(t), owner = f.peer('alice', { ready: false }), donor = f.peer('bob');
    const pending = f.pool.generateFor('alice', 'fantasy-one', owner.broker, personal(), new AbortController().signal, shared());
    if (operation === 'remote-off') owner.status(false, cooperation({ allowRemote: false }));
    else if (operation === 'owner-world') owner.move({ session: 'fantasy-two' });
    else if (operation === 'provider-world') donor.move({ session: 'fantasy-two' });
    else if (operation === 'provider-identity') donor.move({ user: 'another-user' });
    else donor.move({ eligible: false });
    donor.broker.result(response(donor.job())); assert.equal(await pending, undefined);
  }
});
