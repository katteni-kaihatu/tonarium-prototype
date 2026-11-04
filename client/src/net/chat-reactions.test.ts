import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PendingChatReactions } from './chat-reactions.ts';
import type { ChatMessage, RoomServerMsg } from '../../../shared/protocol.ts';
import { REACTIONS } from '../../../shared/timeline.ts';

const body: ChatMessage = { id: 'message', from: 'a', fromName: 'A', text: 'hello', at: 1, scope: 'all' };
const update = (reactionRevision: number): Extract<RoomServerMsg, { t: 'chatReactions' }> => ({ t: 'chatReactions', sid: 'room', id: body.id,
  reactionRevision, reactions: reactionRevision === 2 ? {} : { [REACTIONS[0]]: ['a'] } });

test('updates before body, stale peer retransmission and snapshot races retain the newest state', () => {
  const pending = new PendingChatReactions();
  assert.deepEqual(pending.receive(update(2), []), []);
  pending.receive(update(1), []);
  const m = pending.body('room', body);
  assert.equal(m.reactionRevision, 2);
  assert.deepEqual(m.reactions, {});
  const [latest] = pending.receive(update(3), [m]);
  for (const older of [body, m, { ...body, ...update(1) }]) {
    assert.equal(pending.body('room', older, latest).reactionRevision, 3);
  }
  assert.equal(pending.receive(update(2), [latest])[0], latest);
  assert.equal(pending.receive(update(3), [latest]).length, 1);
});

test('pending updates are isolated by session and bounded to the chat history size', () => {
  const pending = new PendingChatReactions();
  pending.receive(update(1), []);
  assert.equal(pending.body('other', body).reactions, undefined);
  for (let i = 0; i < 500; i++) pending.receive({ ...update(1), id: String(i) }, []);
  assert.equal(pending.body('room', body).reactions, undefined);
  assert.equal(pending.body('room', { ...body, id: '499' }).reactionRevision, 1);
});
