import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { systemDemoMap } from '../shared/system-demo.ts';
import { SystemRuntime } from './system-runtime.ts';
import { validateSystemManifest } from '../shared/systems.ts';
import type { SystemAction, SystemCatalog, SystemManifest, SystemMap, SystemRuntimeState } from '../shared/system-types.ts';

const manifest = (id: string, patch: Partial<SystemManifest>): SystemManifest => ({ schema: 1, sdk: 'tonarium-systems/1', id, version: '1.0.0', title: id, description: 'Runtime test system', license: 'MIT', credits: ['test'], targets: {}, config: {}, state: {}, inputs: {}, outputs: {}, handlers: {}, ...patch });
const button = manifest('button', { targets: { target: { capabilities: ['interact'], required: true } }, inputs: { press: { payload: {} } }, outputs: { pressed: { payload: { user: 'user' } } }, handlers: { press: [{ op: 'emit', port: 'pressed', payload: { user: { actor: true } } }] }, interaction: { target: 'target', input: 'press' } });
const mover = manifest('mover', { targets: { mover: { capabilities: ['move'], required: true } }, state: { opened: { type: 'boolean', default: false } }, inputs: { open: { payload: {} } }, handlers: { open: [{ op: 'set', field: 'opened', value: true }, { op: 'move', target: 'mover', offset: [3, 0, 0] }] } });
const timer = manifest('timer', {
  targets: { display: { capabilities: ['text'], required: false } },
  state: { deadline: { type: 'number', default: 0 }, running: { type: 'boolean', default: false } },
  inputs: { start: { payload: {} }, tick: { payload: {} }, pause: { payload: {} } }, outputs: { finished: { payload: {} } },
  handlers: {
    start: [{ op: 'set', field: 'deadline', value: { calc: 'add', args: [{ now: true }, 1000] } }, { op: 'set', field: 'running', value: true }, { op: 'schedule', key: 'clock', delayMs: 100, input: 'tick', payload: {} }],
    tick: [{ op: 'if', condition: { calc: 'gt', args: [{ state: 'deadline' }, { now: true }] }, then: [{ op: 'text', target: 'display', value: { calc: 'clock', args: [{ calc: 'div', args: [{ calc: 'sub', args: [{ state: 'deadline' }, { now: true }] }, 1000] }] } }, { op: 'schedule', key: 'clock', delayMs: 100, input: 'tick', payload: {} }], else: [{ op: 'set', field: 'running', value: false }, { op: 'emit', port: 'finished', payload: {} }] }],
    pause: [{ op: 'set', field: 'running', value: false }, { op: 'cancel', key: 'clock' }],
  },
});
const chair = manifest('chair', { targets: { seat: { capabilities: ['seat'], required: true } }, inputs: { sit: { payload: { user: 'user' } }, stand: { payload: { user: 'user' } } }, handlers: { sit: [{ op: 'seat', target: 'seat', user: { event: 'user' } }], stand: [{ op: 'unseat', user: { event: 'user' } }] } });
const catalog = (...manifests: SystemManifest[]): SystemCatalog => ({ schema: 1, commit: 'a'.repeat(40), entries: manifests.map(m => { validateSystemManifest(m); return { id: m.id, version: m.version, integrity: 'sha256-' + createHash('sha256').update(JSON.stringify(m)).digest('hex'), manifest: structuredClone(m) }; }) });
const map = (): SystemMap => ({ schema: 1, id: 'test-map', objects: [{ id: 'switch-object', position: [0, 0, 0], capabilities: ['interact'] }, { id: 'mover-object', position: [5, 0, 0], capabilities: ['move'] }, { id: 'clock-object', position: [0, 2, 0], capabilities: ['text'], text: 'ready' }], systems: [{ instanceId: 'switch', systemId: 'button', bindings: { target: ['switch-object'] }, config: {} }, { instanceId: 'countdown', systemId: 'timer', bindings: { display: ['clock-object'] }, config: {} }, { instanceId: 'entrance', systemId: 'mover', bindings: { mover: ['mover-object'] }, config: {} }], connections: [{ from: 'switch', output: 'pressed', to: 'countdown', input: 'start' }, { from: 'countdown', output: 'finished', to: 'entrance', input: 'open' }] });
const install = (runtime: SystemRuntime, definition = map()) => runtime.apply('alice', { kind: 'map', id: 'install', revision: runtime.view().revision, map: definition }, ['alice', 'bob']);

test('button/timer/mover composition changes existing objects and survives restart without room leakage', () => {
  const source = catalog(button, timer, mover); let time = 1000, saved: SystemRuntimeState | undefined;
  const runtime = new SystemRuntime(() => source, state => { saved = state; }, undefined, () => time);
  const other = new SystemRuntime(() => source, () => {}, undefined, () => time); install(runtime); install(other);
  runtime.apply('alice', { kind: 'interact', id: 'click', revision: 1, objectId: 'switch-object' });
  assert.equal(saved!.schedules.length, 1); assert.equal(runtime.view().systems[1].state.running, true);
  const restarted = new SystemRuntime(() => source, state => { saved = state; }, saved, () => time);
  time = 1500; assert.equal(restarted.tick(['alice', 'bob']), true); assert.equal(restarted.view().objects['clock-object'].text, '00:00.5');
  time = 2000; restarted.tick(['alice', 'bob']); assert.deepEqual(restarted.view().objects['mover-object'].position, [8, 0, 0]);
  assert.equal(restarted.view().systems[2].state.opened, true); assert.deepEqual(other.view().objects['mover-object'].position, [5, 0, 0]);
});

test('seats resolve competing users and user selection payloads while departure frees occupancy', () => {
  const source = catalog(chair); const definition: SystemMap = { schema: 1, id: 'seats', objects: [{ id: 'seat-a', position: [0, 0, 0], capabilities: ['seat'] }, { id: 'seat-b', position: [1, 0, 0], capabilities: ['seat'] }], systems: [{ instanceId: 'chair-a', systemId: 'chair', bindings: { seat: ['seat-a'] }, config: {} }, { instanceId: 'chair-b', systemId: 'chair', bindings: { seat: ['seat-b'] }, config: {} }], connections: [] };
  const runtime = new SystemRuntime(() => source, () => {}); install(runtime, definition);
  const sit = (id: string, system: string, user: string) => runtime.apply('alice', { kind: 'input', id, revision: runtime.view().revision, instanceId: system, input: 'sit', payload: { user } }, ['alice', 'bob']);
  sit('first', 'chair-a', 'bob'); assert.equal(runtime.view().seats['seat-a'], 'bob');
  assert.throws(() => sit('occupied', 'chair-a', 'alice'), /occupied/); assert.throws(() => sit('twice', 'chair-b', 'bob'), /already seated/);
  assert.throws(() => sit('absent', 'chair-b', 'mallory'), /unavailable/);
  runtime.leave('bob'); assert.deepEqual(runtime.view().seats, {}); sit('free', 'chair-a', 'alice');
});

test('compatible latest updates preserve stable instances, bindings, object effects, running timers and state', () => {
  let source = catalog(button, timer, mover); let saved: SystemRuntimeState | undefined;
  const runtime = new SystemRuntime(() => source, state => { saved = state; }); install(runtime);
  runtime.apply('alice', { kind: 'input', id: 'open', revision: 1, instanceId: 'entrance', input: 'open', payload: {} });
  runtime.apply('alice', { kind: 'input', id: 'start', revision: 2, instanceId: 'countdown', input: 'start', payload: {} });
  const newer = structuredClone(mover); newer.version = '1.1.0'; newer.state.extra = { type: 'number', default: 7 };
  source = catalog(button, timer, mover, newer); assert.equal(runtime.refresh(), true);
  const updated = runtime.view().systems.find(s => s.instanceId === 'entrance')!;
  assert.equal(updated.version, '1.1.0'); assert.equal(updated.state.opened, true); assert.equal(updated.state.extra, 7); assert.deepEqual(updated.bindings.mover, ['mover-object']);
  assert.deepEqual(runtime.view().objects['mover-object'].position, [8, 0, 0]); assert.equal(saved!.schedules.length, 1); assert.equal(runtime.refresh(), false);
  const incompatible = structuredClone(newer); incompatible.version = '2.0.0'; incompatible.inputs = {}; incompatible.handlers = {};
  source = catalog(button, timer, mover, newer, incompatible); runtime.refresh(); assert.equal(runtime.view().systems.find(s => s.instanceId === 'entrance')!.version, '1.1.0');
  assert.match(runtime.view().diagnostics.join(' '), /retained previous/); assert.equal(runtime.refresh(), false);
});

test('explicit state migration can rename state without replacing objects or instances', () => {
  let source = catalog(button, timer, mover); const runtime = new SystemRuntime(() => source, () => {}); install(runtime);
  runtime.apply('alice', { kind: 'input', id: 'open', revision: 1, instanceId: 'entrance', input: 'open', payload: {} });
  const newer = structuredClone(mover); newer.version = '2.0.0'; newer.state = { open: { type: 'boolean', default: false } }; newer.handlers.open[0] = { op: 'set', field: 'open', value: true }; newer.migrations = [{ from: '1.0.0', renameState: { opened: 'open' } }];
  source = catalog(button, timer, mover, newer); runtime.refresh(); assert.equal(runtime.view().systems[2].state.open, true); assert.equal(runtime.view().systems[2].version, '2.0.0');
  assert.deepEqual(runtime.view().objects['mover-object'].position, [8, 0, 0]);
});

test('failed persistence, stale commands and duplicate identities do not partially apply', () => {
  const source = catalog(button, timer, mover); let fail = false;
  const runtime = new SystemRuntime(() => source, () => { if (fail) throw new Error('disk unavailable'); }); install(runtime);
  const command = { kind: 'input' as const, id: 'open', revision: 1, instanceId: 'entrance', input: 'open', payload: {} };
  fail = true; assert.throws(() => runtime.apply('alice', command), /disk/); assert.equal(runtime.view().revision, 1); assert.deepEqual(runtime.view().objects['mover-object'].position, [5, 0, 0]);
  fail = false; runtime.apply('alice', command); assert.equal(runtime.apply('alice', command), 'duplicate');
  assert.throws(() => runtime.apply('alice', { ...command, revision: 2 }), /id reused/); assert.throws(() => runtime.apply('alice', { ...command, id: 'stale' }), /revision conflict/);
});

test('event cycles roll back and removing a system cancels its scheduled work', () => {
  const relay = manifest('relay', { inputs: { pulse: { payload: {} } }, outputs: { pulse: { payload: {} } }, handlers: { pulse: [{ op: 'emit', port: 'pulse', payload: {} }] } });
  const source = catalog(button, timer, mover, relay); const definition = map();
  definition.systems.push({ instanceId: 'relay-a', systemId: 'relay', bindings: {}, config: {} }); definition.connections.push({ from: 'relay-a', output: 'pulse', to: 'relay-a', input: 'pulse' });
  const runtime = new SystemRuntime(() => source, () => {}); install(runtime, definition);
  assert.throws(() => runtime.apply('alice', { kind: 'input', id: 'loop', revision: 1, instanceId: 'relay-a', input: 'pulse', payload: {} }), /budget/); assert.equal(runtime.view().revision, 1);
  runtime.apply('alice', { kind: 'input', id: 'start', revision: 1, instanceId: 'countdown', input: 'start', payload: {} });
  const removed = structuredClone(definition); removed.systems = removed.systems.filter(s => s.instanceId !== 'countdown'); removed.connections = removed.connections.filter(c => c.from !== 'countdown' && c.to !== 'countdown');
  runtime.apply('alice', { kind: 'map', id: 'remove', revision: 2, map: removed }); assert.equal(runtime.tick(['alice']), false);
  runtime.dispose(); assert.throws(() => runtime.apply('alice', { kind: 'interact', id: 'closed', revision: 3, objectId: 'switch-object' }), /disposed/);
});

test('map edits validate each retained/new instance against its own resolved version', () => {
  let source = catalog(button, timer, mover); const runtime = new SystemRuntime(() => source, () => {}); install(runtime);
  const newer = structuredClone(mover); newer.version = '2.0.0'; newer.targets = { gate: newer.targets.mover }; newer.handlers.open[1] = { op: 'move', target: 'gate', offset: [4, 0, 0] };
  source = catalog(button, timer, mover, newer); runtime.refresh();
  const definition = map(); definition.objects.push({ id: 'new-gate', capabilities: ['move'], position: [0, 0, 0] }); definition.systems.push({ instanceId: 'new-entrance', systemId: 'mover', bindings: { gate: ['new-gate'] }, config: {} });
  runtime.apply('alice', { kind: 'map', id: 'extend', revision: runtime.view().revision, map: definition });
  assert.equal(runtime.view().systems.find(s => s.instanceId === 'entrance')!.version, '1.0.0'); assert.equal(runtime.view().systems.find(s => s.instanceId === 'new-entrance')!.version, '2.0.0');
  runtime.apply('alice', { kind: 'input', id: 'new-open', revision: runtime.view().revision, instanceId: 'new-entrance', input: 'open', payload: {} }); assert.deepEqual(runtime.view().objects['new-gate'].position, [4, 0, 0]);
});

test('tick cleans restored seats and scheduled user references even with no due timer', () => {
  const delayed = structuredClone(chair); delayed.inputs.request = { payload: { user: 'user' } }; delayed.handlers.request = [{ op: 'schedule', key: 'seat', delayMs: 1000, input: 'sit', payload: { user: { event: 'user' } } }];
  const source = catalog(delayed); let saved: SystemRuntimeState | undefined;
  const definition: SystemMap = { schema: 1, id: 'seat-map', objects: [{ id: 'seat-object', capabilities: ['seat'], position: [0, 0, 0] }], systems: [{ instanceId: 'seat', systemId: 'chair', bindings: { seat: ['seat-object'] }, config: {} }], connections: [] };
  const runtime = new SystemRuntime(() => source, state => { saved = state; }, undefined, () => 0); install(runtime, definition);
  runtime.apply('alice', { kind: 'input', id: 'sit', revision: 1, instanceId: 'seat', input: 'sit', payload: { user: 'bob' } }, ['alice', 'bob']);
  runtime.apply('alice', { kind: 'input', id: 'later', revision: 2, instanceId: 'seat', input: 'request', payload: { user: 'bob' } }, ['alice', 'bob']);
  const restarted = new SystemRuntime(() => source, state => { saved = state; }, saved!, () => 1); assert.equal(restarted.tick(['alice']), true);
  assert.deepEqual(restarted.view().seats, {}); assert.deepEqual(saved!.schedules, []); assert.equal(restarted.tick(['alice']), false);
});

test('multiple state-schema migrations can advance a skipped intermediate release', () => {
  let source = catalog(button, timer, mover); const runtime = new SystemRuntime(() => source, () => {}); install(runtime);
  runtime.apply('alice', { kind: 'input', id: 'open', revision: 1, instanceId: 'entrance', input: 'open', payload: {} });
  const second = structuredClone(mover); second.version = '2.0.0'; second.state = { open: { type: 'boolean', default: false } }; second.handlers.open[0] = { op: 'set', field: 'open', value: true }; second.migrations = [{ from: '1.0.0', renameState: { opened: 'open' } }];
  const third = structuredClone(second); third.version = '3.0.0'; third.state = { active: { type: 'boolean', default: false } }; third.handlers.open[0] = { op: 'set', field: 'active', value: true }; third.migrations = [{ from: '2.0.0', renameState: { open: 'active' } }];
  source = catalog(button, timer, mover, second, third); runtime.refresh(); assert.equal(runtime.view().systems[2].version, '3.0.0'); assert.equal(runtime.view().systems[2].state.active, true);
});

test('registered sample packages execute code-authored map bindings without built-in system dispatch', () => {
  const packages = ['button', 'timer', 'chair'].map(id => JSON.parse(fs.readFileSync(new URL(`../shared-systems/${id}/1.0.0/system.json`, import.meta.url), 'utf8')) as SystemManifest);
  const source = catalog(...packages); let time = 0; const runtime = new SystemRuntime(() => source, () => {}, undefined, () => time); install(runtime, systemDemoMap);
  assert.equal(runtime.view().objects['timer-text'].text, '00:10');
  runtime.apply('alice', { kind: 'interact', id: 'start', revision: 1, objectId: 'start-button' });
  time = 1000; runtime.tick(['alice']); assert.equal(runtime.view().objects['timer-text'].text, '00:09');
  runtime.apply('alice', { kind: 'interact', id: 'pause', revision: runtime.view().revision, objectId: 'pause-button' });
  time = 3000; assert.equal(runtime.tick(['alice']), false); assert.equal(runtime.view().systems.find(s => s.instanceId === 'countdown')!.state.running, false);
  runtime.apply('alice', { kind: 'interact', id: 'resume', revision: runtime.view().revision, objectId: 'start-button' });
  time = 13000; runtime.tick(['alice']); assert.equal(runtime.view().objects['timer-text'].text, '00:00');
  assert.equal(runtime.view().systems.find(s => s.instanceId === 'countdown')!.state.running, false);
  assert.equal(runtime.view().systems.find(s => s.instanceId === 'countdown')!.state.remaining, 0);
  runtime.apply('alice', { kind: 'interact', id: 'seat', revision: runtime.view().revision, objectId: 'chair-object' }); assert.equal(runtime.view().seats['chair-object'], 'alice');
  runtime.leave('alice'); assert.deepEqual(runtime.view().seats, {});
});

test('empty lifecycle handlers do not consume the event budget for a valid 128-instance map', () => {
  const source = catalog(manifest('empty-system', {})); const runtime = new SystemRuntime(() => source, () => {});
  const definition: SystemMap = { schema: 1, id: 'many-systems', objects: [], systems: Array.from({ length: 128 }, (_, i) => ({ instanceId: `empty-${i}`, systemId: 'empty-system', bindings: {}, config: {} })), connections: [] };
  install(runtime, definition); assert.equal(runtime.view().systems.length, 128); assert.equal(runtime.view().traces.length, 0);
});

test('failing leave handlers cannot retain occupancy and their diagnostic survives refresh', () => {
  const broken = structuredClone(chair); broken.state.count = { type: 'number', default: 0 };
  broken.handlers.$leave = [{ op: 'set', field: 'count', value: { calc: 'div', args: [1, 0] } }];
  const source = catalog(broken); const runtime = new SystemRuntime(() => source, () => {});
  const definition: SystemMap = { schema: 1, id: 'seat-map', objects: [{ id: 'seat-object', capabilities: ['seat'], position: [0, 0, 0] }], systems: [{ instanceId: 'seat', systemId: 'chair', bindings: { seat: ['seat-object'] }, config: {} }], connections: [] };
  install(runtime, definition); runtime.apply('alice', { kind: 'input', id: 'sit', revision: 1, instanceId: 'seat', input: 'sit', payload: { user: 'bob' } }, ['alice', 'bob']);
  assert.equal(runtime.leave('bob'), true); assert.deepEqual(runtime.view().seats, {}); assert.equal(runtime.view().systems[0].state.count, 0);
  assert.match(runtime.view().diagnostics.join(' '), /leave cleanup failed/); assert.equal(runtime.refresh(), false);
});

test('registered timer pauses at fractional seconds without extending its deadline on immediate resume', () => {
  const packages = ['button', 'timer', 'chair'].map(id => JSON.parse(fs.readFileSync(new URL(`../shared-systems/${id}/1.0.0/system.json`, import.meta.url), 'utf8')) as SystemManifest);
  const source = catalog(...packages); let time = 0; const runtime = new SystemRuntime(() => source, () => {}, undefined, () => time); install(runtime, systemDemoMap);
  const interact = (id: string, objectId: string) => runtime.apply('alice', { kind: 'interact', id, revision: runtime.view().revision, objectId });
  interact('start', 'start-button'); time = 150; interact('pause', 'pause-button');
  assert.equal(runtime.view().systems.find(s => s.instanceId === 'countdown')!.state.remaining, 9.85);
  interact('resume', 'start-button'); assert.equal(runtime.view().systems.find(s => s.instanceId === 'countdown')!.state.deadline, 10000);
  time = 9999; runtime.tick(['alice']); assert.equal(runtime.view().systems.find(s => s.instanceId === 'countdown')!.state.running, true);
  time = 10000; runtime.tick(['alice']); assert.equal(runtime.view().systems.find(s => s.instanceId === 'countdown')!.state.running, false);
});

test('same-map reload preserves the running timer while a new map initializes a reused instance ID', () => {
  const packages = ['button', 'timer', 'chair'].map(id => JSON.parse(fs.readFileSync(new URL(`../shared-systems/${id}/1.0.0/system.json`, import.meta.url), 'utf8')) as SystemManifest);
  const source = catalog(...packages); let time = 0, saved: SystemRuntimeState | undefined;
  const runtime = new SystemRuntime(() => source, state => { saved = state; }, undefined, () => time); install(runtime, systemDemoMap);
  const start = { kind: 'interact' as const, id: 'start', revision: runtime.view().revision, objectId: 'start-button' };
  runtime.apply('alice', start); time = 1000; runtime.tick(['alice']);
  const updated = structuredClone(systemDemoMap); updated.systems.find(system => system.instanceId === 'countdown')!.config.duration = 30;
  runtime.apply('alice', { kind: 'map', id: 'reload', revision: runtime.view().revision, map: updated });
  const continued = runtime.view().systems.find(system => system.instanceId === 'countdown')!;
  assert.equal(continued.state.remaining, 9); assert.equal(continued.state.running, true); assert.equal(continued.state.deadline, 10000);
  assert.equal(runtime.view().objects['timer-text'].text, '00:09'); assert.equal(saved!.schedules.length, 1);
  const other = structuredClone(updated); other.id = 'other-map';
  runtime.apply('alice', { kind: 'map', id: 'switch', revision: runtime.view().revision, map: other });
  const fresh = runtime.view().systems.find(system => system.instanceId === 'countdown')!;
  assert.equal(fresh.config.duration, 30); assert.equal(fresh.state.remaining, 30); assert.equal(fresh.state.running, false); assert.equal(fresh.state.deadline, 0);
  assert.equal(runtime.view().objects['timer-text'].text, '00:30'); assert.equal(saved!.schedules.length, 0);
  const beforeReplay = runtime.view(); assert.equal(runtime.apply('alice', start), 'duplicate'); assert.deepEqual(runtime.view(), beforeReplay);
});

test('new map clears object offsets, occupied seats and scheduled work even when their IDs are reused', () => {
  const source = catalog(button, timer, mover, chair); let saved: SystemRuntimeState | undefined;
  const runtime = new SystemRuntime(() => source, state => { saved = state; }, undefined, () => 0);
  const definition = map(); definition.objects.push({ id: 'seat-object', position: [0, 0, 0], capabilities: ['seat'] });
  definition.systems.push({ instanceId: 'seat', systemId: 'chair', bindings: { seat: ['seat-object'] }, config: {} }); install(runtime, definition);
  const input = (id: string, instanceId: string, name: string, payload = {}) => runtime.apply('alice', { kind: 'input', id, revision: runtime.view().revision, instanceId, input: name, payload }, ['alice', 'bob']);
  input('open', 'entrance', 'open'); input('start', 'countdown', 'start'); input('sit', 'seat', 'sit', { user: 'bob' });
  assert.deepEqual(runtime.view().objects['mover-object'].position, [8, 0, 0]); assert.equal(runtime.view().seats['seat-object'], 'bob'); assert.equal(saved!.schedules.length, 1);
  const other = structuredClone(definition); other.id = 'other-map';
  runtime.apply('alice', { kind: 'map', id: 'switch', revision: runtime.view().revision, map: other }, ['alice', 'bob']);
  assert.deepEqual(runtime.view().objects['mover-object'].position, [5, 0, 0]); assert.equal(runtime.view().systems.find(system => system.instanceId === 'entrance')!.state.opened, false);
  assert.deepEqual(runtime.view().seats, {}); assert.deepEqual(saved!.schedules, []); assert.deepEqual(runtime.view().traces, []);
});

test('map changes dispose old instances against the old map before starting reused IDs with another system', () => {
  const previous = manifest('cleanup', {
    targets: { target: { capabilities: ['move', 'text'], required: true } },
    state: { allowed: { type: 'boolean', default: false }, result: { type: 'number', default: 0 } },
    inputs: { allow: { payload: {} }, later: { payload: {} } },
    handlers: {
      allow: [{ op: 'set', field: 'allowed', value: true }],
      $dispose: [
        { op: 'if', condition: { calc: 'not', args: [{ state: 'allowed' }] }, then: [{ op: 'set', field: 'result', value: { calc: 'div', args: [1, 0] } }] },
        { op: 'move', target: 'target', offset: [99, 0, 0] },
        { op: 'text', target: 'target', value: 'old cleanup text' },
        { op: 'schedule', key: 'old-cleanup', delayMs: 1, input: 'later', payload: {} },
      ],
    },
  });
  const source = catalog(previous, button); let saved: SystemRuntimeState | undefined;
  const runtime = new SystemRuntime(() => source, state => { saved = state; });
  const first: SystemMap = { schema: 1, id: 'first-map', objects: [{ id: 'target', capabilities: ['move', 'text'], position: [1, 0, 0], text: 'old' }], systems: [{ instanceId: 'shared-id', systemId: 'cleanup', bindings: { target: ['target'] }, config: {} }], connections: [] };
  const second: SystemMap = { schema: 1, id: 'second-map', objects: [{ id: 'target', capabilities: ['interact'], position: [5, 0, 0], text: 'new' }], systems: [{ instanceId: 'shared-id', systemId: 'button', bindings: { target: ['target'] }, config: {} }], connections: [] };
  install(runtime, first);
  const before = runtime.view();
  assert.throws(() => runtime.apply('alice', { kind: 'map', id: 'blocked-switch', revision: before.revision, map: second }), /division by zero/);
  assert.deepEqual(runtime.view(), before);
  runtime.apply('alice', { kind: 'input', id: 'allow-cleanup', revision: before.revision, instanceId: 'shared-id', input: 'allow', payload: {} });
  runtime.apply('alice', { kind: 'map', id: 'switch', revision: runtime.view().revision, map: second });
  assert.equal(runtime.view().systems[0].systemId, 'button'); assert.deepEqual(runtime.view().systems[0].state, {});
  assert.deepEqual(runtime.view().objects.target, { position: [5, 0, 0], text: 'new' }); assert.deepEqual(saved!.schedules, []); assert.deepEqual(runtime.view().traces, []);
});

test('clock text preserves millisecond fractions, normalizes float noise and never displays zero before completion', () => {
  const display = manifest('clock-display', {
    targets: { display: { capabilities: ['text'], required: true } },
    inputs: { show: { payload: { seconds: 'number' } } },
    handlers: { show: [{ op: 'text', target: 'display', value: { calc: 'clock', args: [{ event: 'seconds' }] } }] },
  });
  const source = catalog(display), runtime = new SystemRuntime(() => source, () => {});
  const definition: SystemMap = { schema: 1, id: 'clock-display-map', objects: [{ id: 'clock', position: [0, 1, 0], capabilities: ['text'] }], systems: [{ instanceId: 'display', systemId: 'clock-display', bindings: { display: ['clock'] }, config: {} }], connections: [] };
  install(runtime, definition);
  const examples: [number, string][] = [[0, '00:00'], [-1, '00:00'], [0.001, '00:00.001'], [0.00001, '00:00.001'], [0.125, '00:00.125'], [0.5, '00:00.5'], [1.25, '00:01.25'], [12.5, '00:12.5'], [0.1 + 0.2, '00:00.3'], [59.999999999, '01:00'], [60.000000001, '01:00'], [61.125, '01:01.125'], [86400, '1440:00']];
  examples.forEach(([seconds, expected], index) => {
    runtime.apply('alice', { kind: 'input', id: `show-${index}`, revision: runtime.view().revision, instanceId: 'display', input: 'show', payload: { seconds } });
    assert.equal(runtime.view().objects.clock.text, expected, String(seconds));
  });
});

test('registered timer accepts fractional second configuration down to one millisecond without changing integer displays', () => {
  const released = JSON.parse(fs.readFileSync(new URL('../shared-systems/timer/1.0.1/system.json', import.meta.url), 'utf8')) as SystemManifest;
  const source = catalog(released);
  const definition = (duration: number): SystemMap => ({ schema: 1, id: 'fractional-timer-map', objects: [{ id: 'clock', capabilities: ['text'], position: [0, 1, 0] }], systems: [{ instanceId: 'timer', systemId: 'timer', bindings: { display: ['clock'] }, config: { duration } }], connections: [] });
  const examples: [number, string][] = [[0.001, '00:00.001'], [0.125, '00:00.125'], [0.5, '00:00.5'], [1.25, '00:01.25'], [12.5, '00:12.5'], [10, '00:10']];
  for (const [duration, expected] of examples) {
    let time = 0, saved: SystemRuntimeState | undefined;
    const runtime = new SystemRuntime(() => source, state => { saved = state; }, undefined, () => time); install(runtime, definition(duration));
    assert.equal(runtime.view().systems[0].version, '1.0.1');
    assert.equal(runtime.view().systems[0].state.remaining, duration);
    assert.equal(runtime.view().objects.clock.text, expected);
    runtime.apply('alice', { kind: 'input', id: 'start', revision: runtime.view().revision, instanceId: 'timer', input: 'start', payload: {} });
    assert.equal(saved!.schedules[0].due, Math.min(200, duration * 1000));
    time = duration * 1000; assert.equal(runtime.tick(['alice']), true);
    assert.equal(runtime.view().systems[0].state.remaining, 0); assert.equal(runtime.view().systems[0].state.running, false);
    assert.equal(runtime.view().objects.clock.text, '00:00'); assert.equal(saved!.schedules.length, 0);
    time++; assert.equal(runtime.tick(['alice']), false);
  }
  for (const duration of [0, -1, 0.0009, NaN, Infinity]) {
    const runtime = new SystemRuntime(() => source, () => {});
    assert.throws(() => install(runtime, definition(duration)), /number range|value type/);
    assert.equal(runtime.view().revision, 0);
  }
});

test('fractional remaining state survives pause, persistence, restart and a compatible timer release while running', () => {
  const oldTimer = JSON.parse(fs.readFileSync(new URL('../shared-systems/timer/1.0.0/system.json', import.meta.url), 'utf8')) as SystemManifest;
  const newTimer = JSON.parse(fs.readFileSync(new URL('../shared-systems/timer/1.0.1/system.json', import.meta.url), 'utf8')) as SystemManifest;
  const completed = manifest('completion-counter', { state: { count: { type: 'number', default: 0 } }, inputs: { complete: { payload: {} } }, handlers: { complete: [{ op: 'set', field: 'count', value: { calc: 'add', args: [{ state: 'count' }, 1] } }] } });
  let source = catalog(button, oldTimer, chair, completed), time = 1000, saved: SystemRuntimeState | undefined;
  const persist = (state: SystemRuntimeState) => { saved = JSON.parse(JSON.stringify(state)) as SystemRuntimeState; };
  const definition = structuredClone(systemDemoMap); definition.systems.find(system => system.instanceId === 'countdown')!.config.duration = 1.25;
  definition.systems.push({ instanceId: 'finishes', systemId: 'completion-counter', bindings: {}, config: {} });
  definition.connections.push({ from: 'countdown', output: 'finished', to: 'finishes', input: 'complete' });
  let runtime = new SystemRuntime(() => source, persist, undefined, () => time); install(runtime, definition);
  const input = (id: string, name: string) => runtime.apply('alice', { kind: 'input', id, revision: runtime.view().revision, instanceId: 'countdown', input: name, payload: {} });
  const current = () => runtime.view().systems.find(system => system.instanceId === 'countdown')!;
  input('start', 'start'); time = 1125; input('pause', 'pause');
  assert.equal(current().state.remaining, 1.125); assert.equal(current().state.running, false); assert.equal(saved!.schedules.length, 0);
  assert.equal(runtime.view().objects['timer-text'].text, '00:01.125');
  runtime = new SystemRuntime(() => source, persist, saved, () => time);
  assert.equal(current().state.remaining, 1.125); assert.equal(current().config.duration, 1.25);
  time = 5000; input('resume', 'start'); assert.equal(current().state.deadline, 6125);
  time = 5500; runtime.tick(['alice']); assert.equal(current().state.remaining, 0.625);
  assert.equal(runtime.view().objects['timer-text'].text, '00:00.625');
  const before = structuredClone(current()), schedules = structuredClone(saved!.schedules);
  source = catalog(button, oldTimer, newTimer, chair, completed); assert.equal(runtime.refresh(), true);
  assert.equal(current().version, '1.0.1'); assert.equal(current().instanceId, before.instanceId);
  assert.deepEqual(current().bindings, before.bindings); assert.deepEqual(current().config, before.config); assert.deepEqual(current().state, before.state);
  assert.deepEqual(saved!.schedules, schedules);
  runtime = new SystemRuntime(() => source, persist, saved, () => time);
  assert.deepEqual(current().state, before.state); assert.equal(current().version, '1.0.1');
  time = 6124; runtime.tick(['alice']); assert.equal(current().state.remaining, 0.001); assert.equal(runtime.view().objects['timer-text'].text, '00:00.001');
  time = 6125; runtime.tick(['alice']); assert.equal(current().state.remaining, 0); assert.equal(current().state.running, false);
  assert.equal(runtime.view().objects['timer-text'].text, '00:00'); assert.equal(saved!.schedules.length, 0);
  assert.equal(runtime.view().systems.find(system => system.instanceId === 'finishes')!.state.count, 1);
  time = 7000; assert.equal(runtime.tick(['alice']), false); assert.equal(runtime.view().systems.find(system => system.instanceId === 'finishes')!.state.count, 1);
});
