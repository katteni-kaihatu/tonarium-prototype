import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canReadChat, reactChat } from './chat-reactions.ts';
import { REACTIONS } from './timeline.ts';
import type { ChatMessage } from './protocol.ts';

const message = (extra: Partial<ChatMessage> = {}): ChatMessage => ({ id: 'message', from: 'author', fromName: 'Author', text: 'hello', at: 1, scope: 'all', ...extra });
const command = (emoji = REACTIONS[0] as string, on: unknown = true) => ({ t: 'chatReact', id: 'message', emoji, on });

test('chat reactions are idempotent and cancellation only removes the authenticated user', () => {
  const m = message(), history = [m];
  assert.equal(reactChat(history, 'a', command()), m);
  assert.equal(reactChat(history, 'a', command()), null);
  reactChat(history, 'b', command());
  reactChat(history, 'a', command(REACTIONS[1]));
  assert.deepEqual(m.reactions, { [REACTIONS[0]]: ['a', 'b'], [REACTIONS[1]]: ['a'] });
  reactChat(history, 'a', command(REACTIONS[0], false));
  assert.equal(reactChat(history, 'a', command(REACTIONS[0], false)), null);
  assert.deepEqual(m.reactions?.[REACTIONS[0]], ['b']);
  reactChat(history, 'b', command(REACTIONS[0], false));
  assert.equal(m.reactions?.[REACTIONS[0]], undefined);
  assert.equal(m.reactionRevision, 5);
});

test('reject invalid types, emojis, actor spoofing, system logs and unavailable history', () => {
  const m = message();
  for (const input of [null, [], 1, command('invalid'), command('__proto__'), command(REACTIONS[0], 'true'),
    { ...command(), id: 1 }, { ...command(), emoji: {} }, { ...command(), user: 'other' }, { ...command(), sid: 'other' }]) {
    assert.equal(reactChat([m], 'a', input), null);
  }
  assert.equal(reactChat([], 'a', command()), null);
  assert.equal(reactChat([message({ from: null })], 'a', command()), null);
  assert.equal(m.reactions, undefined);
});

test('saved recipients control reads and reactions, including directed dice messages', () => {
  for (const scope of ['near', 'all'] as const) {
    const m = message({ scope, to: ['a'] });
    assert.equal(canReadChat(m, 'b'), false);
    assert.equal(reactChat([m], 'b', command()), null);
    assert.equal(canReadChat(m, 'a'), true);
    assert.equal(reactChat([m], 'a', command()), m);
  }
});
