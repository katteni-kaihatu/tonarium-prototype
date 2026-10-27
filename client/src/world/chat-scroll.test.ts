import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scrollChatAnchor, scrollChatBottom } from './chat-scroll.ts';

test('chat scrolling never returns a browser promise as a React effect cleanup', async () => {
  for (const result of [undefined, Promise.resolve()]) {
    const calls: unknown[] = [];
    assert.equal(scrollChatAnchor({ scrollIntoView: options => { calls.push(options); return result; } }), undefined);
    assert.equal(scrollChatBottom({ scrollHeight: 480, scrollTo: options => { calls.push(options); return result; } }), undefined);
    assert.deepEqual(calls, [{ block: 'nearest' }, { top: 480, behavior: 'smooth' }]);
    await result;
  }
});

test('closing a chat before its scroll element exists is safe', () => {
  assert.equal(scrollChatAnchor(null), undefined);
  assert.equal(scrollChatBottom(null), undefined);
});
