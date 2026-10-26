import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { SystemService } from './system-service.ts';
import { prepareSystemBundle, validateSystemSubmission } from './system-catalog.ts';
import { systemDemoMap } from '../shared/system-demo.ts';
import type { SystemCommand, SystemManifest } from '../shared/system-types.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serialized = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function temporary(t: { after(fn: () => void): void }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-system-service-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true })); return directory;
}
function input(service: SystemService, instanceId: string, name: string, id: string): Exclude<SystemCommand, { kind: 'map' }> {
  return { kind: 'input', instanceId, input: name, payload: {}, id, revision: service.view('room').revision };
}

test('central service bootstraps packages, serves verified originals, and persists composed map behavior', async t => {
  let now = 1_700_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const directory = temporary(t);
  const service = new SystemService(directory, root); t.after(() => service.dispose());
  assert.deepEqual(service.startupErrors, []);
  assert.deepEqual([...new Set(service.catalog.current().entries.map(e => e.id))].sort(), ['button', 'camera-trigger', 'chair', 'timer']);
  assert.deepEqual(service.catalog.current().entries, validateSystemSubmission(root).catalog.entries);
  const server = http.createServer((req, res) => {
    if (!service.http(req, res, new URL(req.url ?? '/', 'http://local').pathname)) res.writeHead(404).end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const response = await fetch(`${base}/api/shared-systems`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(await response.json(), service.catalog.current());
  const entry = service.catalog.current().entries[0];
  const original = await fetch(`${base}/system-originals/${entry.integrity}`);
  assert.equal(original.status, 200);
  assert.equal(await original.text(), service.catalog.read(entry.integrity).toString('utf8'));
  const head = await fetch(`${base}/api/shared-systems`, { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
  assert.equal((await fetch(`${base}/api/shared-systems`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${base}/system-originals/not-a-hash`)).status, 404);

  const map = structuredClone(systemDemoMap);
  map.systems.find(s => s.systemId === 'timer')!.config.duration = 1;
  service.load('room', 'alice', map, ['alice', 'bob']);
  assert.equal(service.view('room').objects['timer-text'].text, '00:01');
  service.apply('room', 'alice', { kind: 'interact', objectId: 'start-button', id: 'start', revision: service.view('room').revision }, ['alice', 'bob']);
  assert.equal(service.view('room').systems.find(s => s.instanceId === 'countdown')!.state.running, true);
  now += 1000; assert.equal(service.tick('room', ['alice', 'bob']), true);
  assert.equal(service.view('room').objects['timer-text'].text, '00:00');
  assert.equal(service.view('room').systems.find(s => s.instanceId === 'countdown')!.state.running, false);
  service.apply('room', 'alice', { kind: 'interact', objectId: 'chair-object', id: 'sit', revision: service.view('room').revision }, ['alice', 'bob']);
  assert.equal(service.view('room').seats['chair-object'], 'alice');
  const beforeConflict = service.view('room');
  assert.throws(() => service.apply('room', 'bob', { kind: 'interact', objectId: 'chair-object', id: 'other-sit', revision: beforeConflict.revision }, ['alice', 'bob']), /occupied/);
  assert.deepEqual(service.view('room'), beforeConflict);
  service.dispose();
  const restarted = new SystemService(directory, root); t.after(() => restarted.dispose());
  assert.deepEqual(serialized(restarted.view('room')), serialized(beforeConflict));
  assert.equal(restarted.leave('room', 'alice'), true);
  assert.equal(restarted.view('room').seats['chair-object'], undefined);
  assert.equal(restarted.view('room').systems.find(s => s.instanceId === 'countdown')!.state.remaining, 0);
});

test('Docker bundle startup and failed replacement preserve registered packages and map objects', t => {
  const directory = temporary(t), data = path.join(directory, 'data'), source = path.join(directory, 'image');
  const bundle = validateSystemSubmission(root);
  prepareSystemBundle(bundle, path.join(source, 'system-bundle'));
  const service = new SystemService(data, source);
  assert.deepEqual(service.startupErrors, []);
  service.load('room', 'alice', systemDemoMap, ['alice']);
  service.apply('room', 'alice', input(service, 'countdown', 'start', 'start'), ['alice']);
  const before = service.view('room'); service.dispose();
  fs.writeFileSync(path.join(source, 'system-bundle', 'objects', bundle.catalog.entries[0].integrity), 'corrupt artifact');
  const replacement = new SystemService(data, source); t.after(() => replacement.dispose());
  assert.equal(replacement.startupErrors.length, 1);
  assert.equal(replacement.catalog.current().entries.length, bundle.catalog.entries.length);
  assert.deepEqual(serialized(replacement.view('room')), serialized(before));
});

test('central version registration upgrades live instances and survives incompatible updates and restart', t => {
  let now = 1_700_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const directory = temporary(t), data = path.join(directory, 'data'), source = path.join(directory, 'source');
  fs.cpSync(path.join(root, 'shared-systems'), path.join(source, 'shared-systems'), { recursive: true });
  const service = new SystemService(data, source); t.after(() => service.dispose());
  service.load('room', 'alice', systemDemoMap, ['alice']);
  service.apply('room', 'alice', input(service, 'countdown', 'start', 'start'), ['alice']);
  now += 1250; service.tick('room', ['alice']);
  const objects = service.view('room').objects;
  const oldTimer = service.view('room').systems.find(s => s.instanceId === 'countdown')!;
  assert.equal(oldTimer.state.remaining, 8.75);
  const original: SystemManifest = service.catalog.current().entries.find(entry => entry.id === oldTimer.systemId && entry.version === oldTimer.version)!.manifest;
  const upgraded = { ...structuredClone(original), version: '1.1.0', title: 'Updated timer', state: { ...original.state, visits: { type: 'number' as const, default: 17 } } };
  const folder = path.join(source, 'shared-systems/timer/1.1.0'); fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, 'system.json'), JSON.stringify(upgraded));
  service.catalog.publish(validateSystemSubmission(source));
  assert.equal(service.tick('room', ['alice']), true);
  const migrated = service.view('room'); const timer = migrated.systems.find(s => s.instanceId === 'countdown')!;
  assert.equal(timer.version, '1.1.0'); assert.deepEqual(timer.state, { ...oldTimer.state, visits: 17 });
  assert.deepEqual(timer.bindings, oldTimer.bindings); assert.deepEqual(timer.config, oldTimer.config);
  assert.deepEqual(migrated.objects, objects);
  assert.deepEqual(migrated.map, systemDemoMap);

  const incompatible = { ...structuredClone(upgraded), version: '2.0.0' };
  delete incompatible.inputs.pause; delete incompatible.handlers.pause;
  const incompatibleFolder = path.join(source, 'shared-systems/timer/2.0.0'); fs.mkdirSync(incompatibleFolder);
  fs.writeFileSync(path.join(incompatibleFolder, 'system.json'), JSON.stringify(incompatible));
  service.catalog.publish(validateSystemSubmission(source)); service.tick('room', ['alice']);
  assert.equal(service.view('room').systems.find(s => s.instanceId === 'countdown')!.version, '1.1.0');
  assert.ok(service.view('room').diagnostics.some(message => message.includes('retained')));
  assert.deepEqual(service.view('room').objects, objects);
  service.dispose();
  const restarted = new SystemService(data, source); t.after(() => restarted.dispose());
  assert.equal(restarted.view('room').systems.find(s => s.instanceId === 'countdown')!.version, '1.1.0');
  assert.deepEqual(serialized(restarted.view('room').objects), serialized(objects));
  now += 500;
  restarted.apply('room', 'alice', input(restarted, 'countdown', 'pause', 'pause'), ['alice']);
  const paused = restarted.view('room').systems.find(s => s.instanceId === 'countdown')!;
  assert.equal(paused.state.running, false); assert.equal(paused.state.remaining, 8.25); assert.equal(paused.state.deadline, oldTimer.state.deadline);
  restarted.apply('room', 'alice', input(restarted, 'countdown', 'reset', 'reset'), ['alice']);
  assert.equal(restarted.view('room').objects['timer-text'].text, '00:10');
});

test('releasing an item scope clears every actor budget while retaining saved state and other scopes limits', t => {
  t.mock.method(Date, 'now', () => 1700000000000);
  const service = new SystemService(temporary(t), root); t.after(() => service.dispose());
  const released = JSON.stringify(['timed-camera', 'room', 'first']), kept = JSON.stringify(['timed-camera', 'room', 'second']);
  const participants = ['alice', 'bob'];
  for (const scope of [released, kept]) {
    service.load(scope, 'server', systemDemoMap, ['server']);
    for (const actor of participants) {
      const command: Exclude<SystemCommand, { kind: 'map' }> = { kind: 'input', id: `budget-${actor}`, revision: service.view(scope).revision, instanceId: 'countdown', input: 'reset', payload: {} };
      for (let count = 0; count < 20; count++) service.apply(scope, actor, command, participants);
      assert.throws(() => service.apply(scope, actor, command, participants), /rate exceeded/);
    }
  }
  const before = serialized(service.view(released));
  service.release(released);
  assert.deepEqual(serialized(service.view(released)), before);
  for (const actor of participants) {
    const command = (scope: string): Exclude<SystemCommand, { kind: 'map' }> => ({ kind: 'input', id: `after-release-${actor}`, revision: service.view(scope).revision, instanceId: 'countdown', input: 'reset', payload: {} });
    assert.doesNotThrow(() => service.apply(released, actor, command(released), participants));
    assert.throws(() => service.apply(kept, actor, command(kept), participants), /rate exceeded/);
  }
});
