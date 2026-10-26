import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SystemCommandQueue, type QueuedSystemCommand, type SystemCommandContext, type SystemCommandReply } from './command-queue.ts';

const command = (id: string, input = 'start'): QueuedSystemCommand => ({ kind: 'input', id, revision: 0, instanceId: 'countdown', input, payload: {} });
function harness(options: { maxRetries?: number; onSend?: (command: QueuedSystemCommand) => void } = {}) {
  const state = { context: { sid: 'room', mapId: 'map', revision: 10, ready: true } as SystemCommandContext | undefined };
  const sent: QueuedSystemCommand[] = [], errors: string[] = [], callbacks: (() => void)[] = [];
  let nextTimer = 0;
  const timers = new Map<number, { callback: () => void; milliseconds: number }>();
  const queue = new SystemCommandQueue({
    context: () => state.context,
    send: input => { sent.push(structuredClone(input)); options.onSend?.(input); },
    error: message => errors.push(message),
    maxRetries: options.maxRetries,
    timers: {
      set: (callback, milliseconds) => { const id = ++nextTimer; timers.set(id, { callback, milliseconds }); callbacks.push(callback); return id; },
      clear: handle => { timers.delete(handle as number); },
    },
  });
  const reply = (commandId: string, outcome: SystemCommandReply['outcome'], revision: number, error?: string, scope = { sid: 'room', mapId: 'map' }) => queue.reply({ ...scope, commandId, outcome, revision, error });
  return { state, sent, errors, timers, callbacks, queue, reply };
}

test('immediate inputs serialize and use the newest state revision at each dispatch', () => {
  const h = harness();
  for (const [id, input] of [['first', 'start'], ['second', 'pause'], ['third', 'reset']]) assert.equal(h.queue.enqueue(command(id, input)), true);
  assert.equal(h.queue.size, 3); assert.equal(h.sent.length, 1); assert.equal(h.sent[0].revision, 10);
  h.state.context!.revision = 12;
  assert.equal(h.reply('first', 'applied', 11), true);
  assert.deepEqual(h.sent.map(input => [input.id, input.revision]), [['first', 10], ['second', 12]]);
  h.state.context!.revision = 14;
  assert.equal(h.reply('second', 'applied', 13), true);
  assert.deepEqual(h.sent.map(input => [input.id, input.revision]), [['first', 10], ['second', 12], ['third', 14]]);
  assert.equal(h.reply('first', 'applied', 100), false);
  assert.equal(h.queue.size, 1);
  assert.equal(h.reply('third', 'duplicate', 15), true);
  assert.equal(h.queue.size, 0); assert.equal(h.timers.size, 0); assert.deepEqual(h.errors, []);
});

test('only a correlated explicit conflict retries the same immutable intent at the latest revision', () => {
  const h = harness({ onSend: input => { if (input.kind === 'input') input.payload.user = 'transport-mutated'; } });
  const input = command('seat-user', 'sit');
  if (input.kind !== 'input') throw new Error('input required');
  input.payload.user = 'alice'; h.queue.enqueue(input); input.payload.user = 'caller-mutated';
  assert.equal(h.reply('other-id', 'rejected', 11, 'system revision conflict'), false);
  assert.equal(h.sent.length, 1);
  h.state.context!.revision = 13;
  assert.equal(h.reply('seat-user', 'rejected', 11, 'system revision conflict'), true);
  assert.deepEqual(h.sent.map(attempt => [attempt.id, attempt.revision, attempt.kind === 'input' && attempt.payload.user]), [['seat-user', 10, 'alice'], ['seat-user', 13, 'alice']]);
  h.callbacks[0](); assert.equal(h.queue.size, 1);
  assert.equal(h.reply('seat-user', 'rejected', 11, 'system revision conflict'), false);
  assert.equal(h.sent.length, 2);
  h.reply('seat-user', 'applied', 14);
  assert.equal(h.queue.size, 0); assert.equal(h.timers.size, 0); assert.deepEqual(h.errors, []);
});

test('ordinary rejection is never retried and the next input can continue from the supplied revision', () => {
  const h = harness(); h.queue.enqueue(command('occupied', 'sit')); h.queue.enqueue(command('reset', 'reset'));
  h.reply('occupied', 'rejected', 10, 'seat occupied');
  assert.deepEqual(h.sent.map(input => input.id), ['occupied', 'reset']);
  assert.equal(h.sent[1].revision, 10); assert.deepEqual(h.errors, ['seat occupied']);
  h.reply('reset', 'applied', 11);
  assert.equal(h.queue.size, 0); assert.equal(h.timers.size, 0);
});

test('default conflict budget permits eight retries and then reports failure without another attempt', () => {
  const h = harness(); h.queue.enqueue(command('busy'));
  for (let revision = 11; revision <= 19; revision++) h.reply('busy', 'rejected', revision, 'system revision conflict');
  assert.equal(h.sent.length, 9); assert.equal(h.queue.size, 0); assert.equal(h.timers.size, 0);
  assert.equal(h.errors.length, 1);
  assert.equal(h.reply('busy', 'rejected', 20, 'system revision conflict'), false);
  assert.equal(h.sent.length, 9);
});

test('capacity includes the in-flight input and rejects overflow without disturbing accepted inputs', () => {
  const h = harness();
  for (let i = 0; i < 128; i++) assert.equal(h.queue.enqueue(command(`input-${i}`)), true);
  assert.equal(h.queue.size, 128); assert.equal(h.sent.length, 1);
  assert.equal(h.queue.enqueue(command('overflow')), false);
  assert.equal(h.queue.size, 128); assert.equal(h.sent.length, 1); assert.equal(h.errors.length, 1);
  h.queue.dispose(); assert.equal(h.timers.size, 0);
});

test('unknown timeout clears dependent inputs and ignores a late acknowledgement without automatic replay', () => {
  const h = harness(); h.queue.enqueue(command('uncertain')); h.queue.enqueue(command('dependent', 'pause'));
  const timer = [...h.timers.values()][0]; assert.equal(timer.milliseconds, 15000);
  timer.callback();
  assert.equal(h.queue.size, 0); assert.equal(h.sent.length, 1); assert.equal(h.errors.length, 1); assert.equal(h.timers.size, 0);
  assert.equal(h.reply('uncertain', 'applied', 11), false);
  assert.equal(h.sent.length, 1);
  h.state.context!.revision = 11; h.queue.enqueue(command('manual-new-input'));
  assert.deepEqual(h.sent.map(input => input.id), ['uncertain', 'manual-new-input']);
  timer.callback(); assert.equal(h.queue.size, 1);
  h.queue.dispose();
});

test('a transport exception after an earlier success drops uncertain and dependent inputs without retry', () => {
  let attempts = 0;
  const h = harness({ onSend: () => { if (++attempts === 2) throw new Error('transport lost'); } });
  h.queue.enqueue(command('first')); h.queue.enqueue(command('uncertain')); h.queue.enqueue(command('dependent'));
  h.reply('first', 'applied', 11);
  assert.deepEqual(h.sent.map(input => input.id), ['first', 'uncertain']);
  assert.equal(h.queue.size, 0); assert.equal(h.errors.length, 1); assert.equal(h.timers.size, 0);
  assert.equal(h.reply('uncertain', 'applied', 12), false);
  assert.equal(h.queue.enqueue(command('uncertain')), false);
  assert.equal(h.sent.length, 2);
});

test('session, map and connection changes drop pending work and stale acknowledgements cannot affect a new scope', () => {
  const h = harness(); h.queue.enqueue(command('old-room')); h.queue.enqueue(command('old-dependent'));
  h.state.context = { sid: 'other-room', mapId: 'map', revision: 0, ready: true };
  assert.equal(h.reply('old-room', 'applied', 11), false);
  assert.equal(h.queue.size, 0);
  h.queue.enqueue(command('new-room'));
  assert.equal(h.sent.at(-1)!.revision, 0);
  assert.equal(h.reply('old-room', 'applied', 100), false);
  assert.equal(h.reply('new-room', 'applied', 100), false);
  assert.equal(h.queue.size, 1);
  h.state.context.mapId = 'other-map';
  assert.equal(h.reply('new-room', 'applied', 1, undefined, { sid: 'other-room', mapId: 'map' }), false);
  assert.equal(h.queue.size, 0);
  h.queue.enqueue(command('new-map'));
  h.state.context.ready = false;
  assert.equal(h.reply('new-map', 'applied', 1, undefined, { sid: 'other-room', mapId: 'other-map' }), false);
  assert.equal(h.queue.size, 0); assert.equal(h.timers.size, 0); assert.equal(h.sent.length, 3);
});

test('snapshot reset discards previous pending inputs and old timers even when the session and map IDs match', () => {
  const h = harness(); h.queue.enqueue(command('before-snapshot')); h.queue.enqueue(command('old-dependent'));
  const oldTimer = h.callbacks[0]; h.queue.reset();
  h.state.context!.revision = 1; h.queue.enqueue(command('after-snapshot'));
  assert.equal(h.sent.at(-1)!.revision, 1);
  oldTimer(); assert.equal(h.queue.size, 1);
  assert.equal(h.reply('before-snapshot', 'applied', 100), false);
  h.reply('after-snapshot', 'applied', 2);
  assert.equal(h.queue.size, 0); assert.equal(h.sent.length, 2); assert.deepEqual(h.errors, []);
});

test('unready inputs are not retained and duplicate IDs cannot be correlated to a different intent', () => {
  const h = harness(); h.state.context = undefined;
  assert.equal(h.queue.enqueue(command('not-ready')), false); assert.equal(h.queue.size, 0);
  h.state.context = { sid: 'room', mapId: 'map', revision: 10, ready: true };
  h.queue.enqueue(command('unique')); assert.equal(h.queue.enqueue(command('unique', 'pause')), false);
  h.reply('unique', 'applied', 11); assert.equal(h.queue.enqueue(command('unique')), false);
  assert.equal(h.sent.length, 1); assert.equal(h.queue.size, 0);
  h.queue.dispose(); assert.equal(h.queue.enqueue(command('disposed')), false);
});
