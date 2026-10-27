import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Frame, KokosyncClient } from '../vendor/kokosync/index.js';
import { eventHash, EVENT_TOPIC, MISSING_TOPIC, proposeEvent, RECOVERY_TOPIC, SessionEvents, validPeerOperation, type PeerCommit } from './session-events.ts';
import { base64, importKey, open, seal, type SyncConfig } from './session-wire.ts';

const secret = () => base64(crypto.getRandomValues(new Uint8Array(32)));
function fixture(peer: string) {
  const config: SyncConfig = { sid: 'room', room: 'wire', peer, server: 'server', token: `grant-${peer}`, key: secret(), slot: 0, peerDelivery: true };
  const sent: { to: string; topic: string; value: any }[] = [];
  const client = { capabilities: { peerDelivery: { messageBytes: 4 * 1024 * 1024 } },
    async sendTo(to: string, topic: string, value: any) { sent.push({ to, topic, value }); } } as unknown as KokosyncClient;
  const events = new SessionEvents(client, config);
  events.update(['a', 'b', 'c'].map((p, slot) => ({ peer: p, user: p, grant: `grant-${p}`, slot, delivery: true })));
  return { config, events, sent };
}
const context = { sid: 'room', user: 'user-a', name: 'Alice', at: Date.now() };

test('GIF attachments preserve bytes and retry identity through peer proposals within the image limit', () => {
  const clientRequestId = crypto.randomUUID();
  for (const mime of ['gif', 'jpeg', 'png']) {
    const image = `data:image/${mime};base64,R0lGODlh`;
    const event = proposeEvent({ t: 'chat', scope: 'all', text: 'camera', image, clientRequestId }, context)!;
    assert.equal(event.payload.message.t, 'chat');
    if (event.payload.message.t === 'chat') {
      assert.equal(event.payload.message.m.image, image);
      assert.equal(event.payload.message.m.clientRequestId, clientRequestId);
      assert.equal(event.payload.message.m.scope, 'all');
    }
  }
  for (const image of ['data:image/gif;base64,' + 'A'.repeat(2_000_000), 'data:image/svg+xml;base64,AAAA']) {
    const event = proposeEvent({ t: 'chat', scope: 'all', text: 'camera', image }, context)!;
    if (event.payload.message.t === 'chat') assert.equal(event.payload.message.m.image, undefined);
  }
});

test('peer event remains encrypted until a server commit, independent of property order', async () => {
  const a = fixture('a'), b = fixture('b');
  try {
    const operation = (await a.events.prepare({ t: 'chat', scope: 'all', text: ' hello ' }, context))!;
    assert.ok(validPeerOperation(operation));
    const data = a.sent.find((f) => f.to === 'b')!;
    assert.equal(data.topic, EVENT_TOPIC);
    await assert.rejects(open(await importKey(b.config.key), operation.id, 'event', data.value.packet));
    b.events.receive({ type: 'peer_message', peer: 'a', topic: data.topic, value: data.value });
    const commit: PeerCommit = { kind: 'peerCommit', source: 'a', id: operation.id, key: operation.key, hash: operation.hash };
    const payload = await b.events.resolve(commit);
    assert.equal(payload.message.t, 'chat');
    if (payload.message.t === 'chat') { assert.equal(payload.message.m.text, 'hello'); assert.equal(payload.message.m.id, operation.id); }
    assert.equal(await eventHash({ b: 2, a: 1, c: undefined }), await eventHash({ a: 1, b: 2 }));
  } finally { a.events.close(); b.events.close(); }
});

test('server commit waits for a late P2P copy and closes without leaking pending waits', async () => {
  const a = fixture('a'), b = fixture('b');
  try {
    const operation = (await a.events.prepare({ t: 'chat', scope: 'all', text: 'late' }, context))!;
    const commit: PeerCommit = { kind: 'peerCommit', source: 'a', id: operation.id, key: operation.key, hash: operation.hash };
    const waiting = b.events.resolve(commit);
    await new Promise((r) => setTimeout(r, 10));
    const data = a.sent.find((f) => f.to === 'b')!;
    b.events.receive({ type: 'peer_message', peer: 'a', topic: data.topic, value: data.value });
    assert.equal((await waiting).message.t, 'chat');
    const missing = b.events.resolve({ ...commit, id: crypto.randomUUID() });
    b.events.close();
    await assert.rejects(missing, /Session closed/);
  } finally { a.events.close(); b.events.close(); }
});

test('missing or tampered peer copy recovers only from the authenticated server', async () => {
  const b = fixture('b');
  try {
    const payload = { kind: 'message', message: { t: 'chat', sid: 'room', m: { id: 'x', text: 'recovered' } } };
    const commit: PeerCommit = { kind: 'peerCommit', source: 'a', id: crypto.randomUUID(), key: secret(), hash: await eventHash(payload) };
    const waiting = b.events.resolve(commit);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(b.sent[0].topic, MISSING_TOPIC);
    const value = await seal(await importKey(b.config.key), b.config.token, 'recovery', 1, { id: commit.id, source: 'a', payload });
    await b.events.receive({ type: 'peer_message', peer: 'server', topic: RECOVERY_TOPIC, value });
    assert.deepEqual(await waiting, payload);
  } finally { b.events.close(); }
});

test('proposals limit P2P scope and hide secret dice results', () => {
  assert.equal(proposeEvent({ t: 'itemAction', id: 'telephone', action: { a: 'telephoneSubmit', round: 1, step: 0,
    answer: { kind: 'text', text: 'private answer' } } }, context), null);
  assert.equal(proposeEvent({ t: 'chat', scope: 'near', text: 'private' }, context), null);
  assert.equal(proposeEvent({ t: 'itemMove', id: 'x', x: 0, z: 0, ry: 0 }, context), null);
  const proposal = proposeEvent({ t: 'itemAction', id: 'dice', action: { a: 'diceRoll', sides: 6, count: 3, secret: true } },
    { ...context, item: { id: 'dice', kind: 'dice', x: 0, z: 0, ry: 0, createdBy: 'user-a', updatedBy: 'user-a', roll: null } })!;
  assert.equal(proposal.roll!.results!.length, 3);
  assert.equal(proposal.payload.message.t, 'item');
  if (proposal.payload.message.t === 'item' && proposal.payload.message.item.kind === 'dice')
    assert.equal(proposal.payload.message.item.roll!.results, null);
});
