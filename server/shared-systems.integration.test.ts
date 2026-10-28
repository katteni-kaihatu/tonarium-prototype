import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { testServerEnv } from './test-db.ts';
import { devLogin } from './test-auth.ts';
import { WebSocket } from 'ws';
import { KokosyncClient } from '../vendor/kokosync/index.js';
import { importKey, open, PACKET_TOPIC, receiveBlob, seal, sendPacket, type Envelope, type SyncConfig } from '../shared/session-wire.ts';
import { COMPAT_VERSION, type RoomClientMsg, type SessionSnapshot } from '../shared/protocol.ts';
import type { Item } from '../shared/items.ts';
import type { SystemCommand, SystemValue, SystemView } from '../shared/system-types.ts';
import { systemDemoMap } from '../shared/system-demo.ts';
import { SystemCommandQueue } from '../client/src/systems/command-queue.ts';
import { CameraCountdown } from '../client/src/systems/camera-countdown.ts';

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function until<T>(read: () => T | undefined, label: string, timeout = 15_000): Promise<T> {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = read(); if (value !== undefined) return value; await delay(25); }
  throw new Error(`Timed out: ${label}`);
}
const serialized = <T>(value: T): T => JSON.parse(JSON.stringify(value));
type InputCommand = Exclude<SystemCommand, { kind: 'map' }>;
type InputOperation = { kind: 'interact'; objectId: string } | { kind: 'input'; instanceId: string; input: string; payload: Record<string, SystemValue> };

test('live shared systems: code-map load, late snapshots, native items, occupied seats and reconnect converge', { skip: process.env.KOKOSYNC_INTEGRATION !== '1', timeout: 150_000 }, async t => {
  const dbEnv = await testServerEnv(t);
  const began = Date.now(), listener = net.createServer();
  await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = (listener.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => listener.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`, sid = 'shared-systems-test', otherSid = 'shared-systems-other';
  const data = await mkdtemp(path.join(os.tmpdir(), 'tonarium-live-systems-'));
  await writeFile(path.join(data, 'sessions.json'), JSON.stringify({ name: 'System integration', sessions: [{ id: sid, name: 'System integration' }, { id: otherSid, name: 'Independent integration' }] }));
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: { ...process.env, ...dbEnv, SERVER_PORT: String(port), DATA_DIR: data, SESSIONS_FILE: path.join(data, 'sessions.json'), LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '', LIVEKIT_ROOM_PREFIX: `systems-integration-${crypto.randomUUID()}`, CHAT_TRANSLATION_PROVIDER: 'mock' },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  const remember = (chunk: Buffer) => { logs = (logs + chunk.toString()).slice(-20_000); };
  child.stdout.on('data', remember); child.stderr.on('data', remember);
  const homes = new Set<WebSocket>(), clients = new Set<KokosyncClient>(), queues = new Set<SystemCommandQueue>();
  t.after(async () => {
    for (const queue of queues) queue.dispose();
    for (const client of clients) client.close();
    for (const home of homes) home.terminate();
    if (child.exitCode === null && !child.signalCode) {
      child.kill();
      await until(() => child.exitCode !== null || child.signalCode ? true : undefined, 'test server shutdown', 10_000).catch(async () => { child.kill('SIGKILL'); await delay(100); });
    }
    assert.equal(path.dirname(path.resolve(data)), path.resolve(os.tmpdir()));
    await rm(data, { recursive: true, force: true });
  });
  await until(() => {
    if (child.exitCode !== null) throw new Error(`Test server exited ${child.exitCode}: ${logs}`);
    return logs.includes('server on http://') ? true : undefined;
  }, 'full Tonarium server startup');
  const catalogResponse = await fetch(`${base}/api/shared-systems`);
  assert.equal(catalogResponse.status, 200);
  const catalog = await catalogResponse.json();
  const systemIds = [...new Set(catalog.entries.map((entry: { id: string }) => entry.id))].sort();
  assert.deepEqual(systemIds, ['button', 'camera-trigger', 'chair', 'timer']);
  for (const entry of catalog.entries) {
    const originalResponse = await fetch(`${base}/system-originals/${entry.integrity}`);
    assert.equal(originalResponse.status, 200);
    const original = Buffer.from(await originalResponse.arrayBuffer());
    assert.equal(`sha256-${createHash('sha256').update(original).digest('hex')}`, entry.integrity);
    assert.deepEqual(JSON.parse(original.toString('utf8')), entry.manifest);
    assert.equal(entry.manifest.id, entry.id); assert.equal(entry.manifest.version, entry.version);
  }

  async function peer(name: string, room = sid, previous?: { home: WebSocket; id: string; login: Awaited<ReturnType<typeof devLogin>> }) {
    const login = previous?.login ?? await devLogin(base, name);
    const home = previous?.home ?? new WebSocket(base.replace('http', 'ws') + '/ws', { headers: login.headers }); homes.add(home);
    const homeMessages: any[] = [];
    home.on('message', bytes => { homeMessages.push(JSON.parse(bytes.toString())); if (homeMessages.length > 200) homeMessages.shift(); });
    if (!previous) await new Promise<void>((resolve, reject) => { home.once('open', resolve); home.once('error', reject); });
    const id = login.id;
    if (!previous) {
      home.send(JSON.stringify({ t: 'hello', compat: COMPAT_VERSION }));
      home.send(JSON.stringify({ t: 'join', sid: room }));
    }
    const requestId = crypto.randomUUID();
    home.send(JSON.stringify({ t: 'prepareSync', requestId, peerPositions: false, peerDelivery: false }));
    const reply = await until(() => homeMessages.find(message => message.requestId === requestId), `sync grant for ${name}`, 45_000);
    assert.equal(reply.t, 'syncConfig', JSON.stringify(reply));
    const config: SyncConfig = reply.config, key = await importKey(config.key);
    const client = await KokosyncClient.connect({ url: base, room: config.room, peer: config.peer, transport: 'websocket', timeout: 45_000,
      websocketUrl: `/sync/ws?token=${config.token}`, websocketFactory: url => new WebSocket(url, { origin: base }) as unknown as globalThis.WebSocket });
    clients.add(client);
    let view: SystemView | undefined, snapshot: SessionSnapshot | undefined, ordinal = 0, sequence = 0, incoming = Promise.resolve(), queue: SystemCommandQueue | undefined, holdNextCommand = false;
    const frames: { ordinal: number; value: any }[] = [], failures: string[] = [], items = new Map<string, Item>();
    const sentCommands: InputCommand[] = [];
    const receive = async (packet: unknown, sender: string, latest = false) => {
      if (sender !== config.server || (packet as Envelope)?.grant !== config.token) return;
      const apply = async () => {
        const decoded = await open(key, config.token, latest ? 'server-position' : 'server', packet), value = decoded.value;
        if (value.kind === 'snapshot') {
          snapshot = value.snapshot; view = snapshot!.systems;
          items.clear(); for (const item of snapshot!.items) items.set(item.id, item);
        }
        const message = value.message;
        if (message?.t === 'systemState' && (!view || message.view.revision >= view.revision)) view = message.view;
        if (message?.t === 'systemState' && message.commandResult) queue?.reply({ sid: message.sid, mapId: message.view.map.id, revision: view!.revision, commandId: message.commandResult.id, outcome: message.commandResult.outcome, error: message.error });
        if (message?.t === 'item') items.set(message.item.id, message.item);
        if (message?.t === 'itemRemove') items.delete(message.id);
        if (message?.t === 'itemMove' && items.has(message.id)) Object.assign(items.get(message.id)!, { x: message.x, z: message.z, ry: message.ry });
        frames.push({ ordinal: ++ordinal, value }); if (frames.length > 1000) frames.shift();
      };
      if (latest) return apply();
      const task = incoming.then(apply); incoming = task.catch(error => { failures.push(String(error)); }); return task;
    };
    client.on('message', frame => { if (frame.topic === PACKET_TOPIC) return receive(frame.value, frame.peer).catch(() => {}); });
    client.on('latest', frame => receive(frame.value, frame.peer, true).catch(error => { failures.push(String(error)); }));
    client.on('blob_open', frame => receiveBlob(client, frame, sender => sender === config.server, receive).catch(error => { failures.push(String(error)); }));
    const send = async (message: RoomClientMsg) => sendPacket(client, config.server, await seal(key, config.token, 'client', ++sequence, message));
    await send({ t: 'sync' });
    await until(() => { if (failures.length) throw new Error(failures.join('\n')); return snapshot; }, `initial encrypted snapshot for ${name}`, 45_000);
    queue = new SystemCommandQueue({
      context: () => view ? { sid: room, mapId: view.map.id, revision: view.revision, ready: home.readyState === WebSocket.OPEN } : undefined,
      send(command) {
        sentCommands.push(structuredClone(command));
        const transmit = () => send({ t: 'systemCommand', command }).catch(error => { failures.push(String(error)); queue!.reset(String(error)); });
        if (holdNextCommand) {
          holdNextCommand = false;
          void until(() => view!.revision > command.revision ? true : undefined, 'forced server tick before command delivery', 5000).then(transmit).catch(error => { failures.push(String(error)); queue!.reset(String(error)); });
        } else void transmit();
      },
      error(message) { failures.push(message); },
    });
    queues.add(queue);
    return { id, login, home, homeMessages, client, config, frames, failures, items, send, queue, sentCommands, forceNextTickConflict() { holdNextCommand = true; }, get view() { return view!; }, get snapshot() { return snapshot!; }, get ordinal() { return ordinal; } };
  }
  type Peer = Awaited<ReturnType<typeof peer>>;
  const timer = (p: Peer) => p.view.systems.find(system => system.instanceId === 'countdown')!;
  const noteId = 'system-map:system-demo:timer-text', chessId = 'system-map:system-demo:menu-chess-button';
  const text = (p: Peer) => { const item = p.items.get(noteId); return item?.kind === 'note' ? item.text : undefined; };
  const laterMessage = (p: Peer, after: number, predicate: (message: any) => boolean) => p.frames.find(frame => frame.ordinal > after && predicate(frame.value.message))?.value.message;
  async function command(p: Peer, operation: InputOperation, accepted: () => boolean): Promise<InputCommand> {
    const input = { ...operation, id: `integration-${crypto.randomUUID()}`, revision: p.view.revision }, after = p.ordinal;
    assert.equal(p.queue.enqueue(input), true);
    const outcome = await until(() => {
      if (p.failures.length) throw new Error(p.failures.join('\n'));
      return laterMessage(p, after, message => message?.t === 'systemState' && message.commandResult?.id === input.id && (message.commandResult.outcome !== 'rejected' || message.error !== 'system revision conflict'));
    }, 'correlated system command acknowledgement');
    assert.notEqual(outcome.commandResult.outcome, 'rejected', outcome.error);
    assert.equal(accepted(), true, `Applied command ${input.id} did not reach its expected state`);
    return p.sentCommands.filter(sent => sent.id === input.id).at(-1)!;
  }
  async function resync(p: Peer) {
    const after = p.ordinal; await p.send({ t: 'systemResync' });
    return until(() => laterMessage(p, after, message => message?.t === 'systemState'), 'explicit system resync');
  }
  const a = await peer('systems-a'), other = await peer('systems-other', otherSid);
  assert.equal(a.view.map.id, 'empty'); assert.equal(other.view.map.id, 'empty');
  await a.send({ t: 'systemLoad', mapId: 'system-demo' });
  await until(() => a.view.map.id === 'system-demo' && a.items.has(noteId) && a.items.has(chessId) ? true : undefined, 'registered code-map and native item load');
  assert.deepEqual(a.view.map, systemDemoMap); assert.equal(text(a), '00:10'); assert.equal(a.items.get(chessId)?.kind, 'chess');
  await command(a, { kind: 'interact', objectId: 'menu-chess-button' }, () => timer(a).state.running === true);
  await until(() => Number(timer(a).state.remaining) < 9.9 ? true : undefined, 'server timer progress');
  await command(a, { kind: 'interact', objectId: 'pause-button' }, () => timer(a).state.running === false);
  assert.ok(Number(timer(a).state.remaining) > 0 && Number(timer(a).state.remaining) < 10);
  await command(a, { kind: 'interact', objectId: 'chair-object' }, () => a.view.seats['chair-object'] === a.id);
  const paused = serialized(a.view), pausedText = text(a);
  const b = await peer('systems-b');
  assert.deepEqual(b.snapshot.systems, paused); assert.deepEqual(b.view, a.view); assert.equal(text(b), pausedText);
  assert.deepEqual(b.items.get(noteId), a.items.get(noteId)); assert.deepEqual(b.items.get(chessId), a.items.get(chessId));

  const resumeFrom = Number(timer(b).state.remaining), beforeNote = text(b);
  await command(b, { kind: 'interact', objectId: 'menu-chess-button' }, () => timer(b).state.running === true);
  await until(() => Number(timer(a).state.remaining) < resumeFrom - 1 && text(a) !== beforeNote && text(a) === text(b) ? true : undefined, 'timer and actual note changes reach both peers');
  await command(a, { kind: 'interact', objectId: 'pause-button' }, () => timer(a).state.running === false);
  await until(() => JSON.stringify(a.view) === JSON.stringify(b.view) && text(a) === text(b) ? true : undefined, 'paused peer convergence');
  const beforeOccupied = serialized(a.view), aErrorCount = a.frames.filter(frame => frame.value.message?.error).length, occupiedAfter = b.ordinal;
  const occupiedCommand: InputCommand = { kind: 'interact', objectId: 'chair-object', id: `integration-${crypto.randomUUID()}`, revision: b.view.revision };
  await b.send({ t: 'systemCommand', command: occupiedCommand });
  const occupied = await until(() => laterMessage(b, occupiedAfter, message => message?.t === 'systemState' && message.commandResult?.id === occupiedCommand.id), 'occupied chair rejection');
  assert.equal(occupied.commandResult.outcome, 'rejected'); assert.match(occupied.error, /occupied/); await resync(a);
  assert.deepEqual(a.view, beforeOccupied); assert.deepEqual(b.view, beforeOccupied);
  assert.equal(a.frames.filter(frame => frame.value.message?.error).length, aErrorCount, 'rejected seat request is sent only to its actor');

  b.client.close();
  const b2 = await peer('systems-b', sid, b);
  assert.notEqual(b2.config.token, b.config.token); assert.equal(b2.id, b.id);
  assert.deepEqual(b2.snapshot.systems, a.view); assert.equal(text(b2), text(a)); assert.equal(b2.view.seats['chair-object'], a.id);
  const reset = await command(b2, { kind: 'interact', objectId: 'reset-button' }, () => timer(b2).state.remaining === 10 && timer(b2).state.running === false);
  await until(() => JSON.stringify(a.view) === JSON.stringify(b2.view) && text(a) === '00:10' ? true : undefined, 'reset reaches both peers');
  const resetView = serialized(b2.view), duplicateAfter = b2.ordinal;
  await b2.send({ t: 'systemCommand', command: reset });
  const duplicate = await until(() => laterMessage(b2, duplicateAfter, message => message?.t === 'systemState' && message.commandResult?.id === reset.id), 'duplicate command response');
  assert.equal(duplicate.commandResult.outcome, 'duplicate');
  assert.deepEqual(b2.view, resetView);
  const staleAfter = b2.ordinal;
  const staleCommand: InputCommand = { kind: 'interact', objectId: 'reset-button', id: `integration-${crypto.randomUUID()}`, revision: b2.view.revision - 1 };
  await b2.send({ t: 'systemCommand', command: staleCommand });
  const stale = await until(() => laterMessage(b2, staleAfter, message => message?.t === 'systemState' && message.commandResult?.id === staleCommand.id), 'stale command rejection');
  assert.equal(stale.commandResult.outcome, 'rejected'); assert.match(stale.error, /revision conflict/); await resync(b2); assert.deepEqual(b2.view, resetView);

  const simultaneousRevision = b2.view.revision, simultaneousAfter = b2.ordinal;
  const rawStart: InputCommand = { kind: 'interact', objectId: 'menu-chess-button', id: `integration-${crypto.randomUUID()}`, revision: simultaneousRevision };
  const rawPause: InputCommand = { kind: 'interact', objectId: 'pause-button', id: `integration-${crypto.randomUUID()}`, revision: simultaneousRevision };
  await b2.send({ t: 'systemCommand', command: rawStart }); await b2.send({ t: 'systemCommand', command: rawPause });
  const firstRaw = await until(() => laterMessage(b2, simultaneousAfter, message => message?.commandResult?.id === rawStart.id), 'first raw same-revision command');
  const secondRaw = await until(() => laterMessage(b2, simultaneousAfter, message => message?.commandResult?.id === rawPause.id), 'second raw same-revision command');
  assert.equal(firstRaw.commandResult.outcome, 'applied'); assert.equal(secondRaw.commandResult.outcome, 'rejected'); assert.match(secondRaw.error, /revision conflict/);
  assert.equal(timer(b2).state.running, true, 'raw pause was rejected instead of silently applied');
  b2.forceNextTickConflict();
  const forcedAfter = b2.ordinal;
  const recoveredPause = await command(b2, { kind: 'interact', objectId: 'pause-button' }, () => timer(b2).state.running === false);
  const recoveredFrames = b2.frames.filter(frame => frame.ordinal > forcedAfter && frame.value.message?.commandResult?.id === recoveredPause.id).map(frame => frame.value.message);
  assert.equal(recoveredFrames[0].commandResult.outcome, 'rejected'); assert.equal(recoveredFrames[0].error, 'system revision conflict');
  assert.equal(recoveredFrames.at(-1)!.commandResult.outcome, 'applied');
  const recoveredAttempts = b2.sentCommands.filter(input => input.id === recoveredPause.id);
  assert.ok(recoveredAttempts.length >= 2); assert.ok(recoveredAttempts.at(-1)!.revision > recoveredAttempts[0].revision);
  const burstAfter = b2.ordinal, burstRevision = b2.view.revision;
  const burst: InputCommand[] = ['menu-chess-button', 'pause-button', 'reset-button'].map(objectId => ({ kind: 'interact', objectId, id: `integration-${crypto.randomUUID()}`, revision: burstRevision }));
  for (const input of burst) assert.equal(b2.queue.enqueue(input), true);
  for (const input of burst) {
    const result = await until(() => laterMessage(b2, burstAfter, message => message?.commandResult?.id === input.id && message.commandResult.outcome === 'applied'), 'queued rapid start/pause/reset acknowledgement');
    assert.equal(result.commandResult.outcome, 'applied');
  }
  assert.equal(b2.queue.size, 0); assert.equal(timer(b2).state.remaining, 10); assert.equal(timer(b2).state.running, false);
  await until(() => JSON.stringify(a.view) === JSON.stringify(b2.view) && text(a) === '00:10' ? true : undefined, 'queue conflict recovery converges with the other peer');

  a.home.send(JSON.stringify({ t: 'leave' }));
  await until(() => b2.view.seats['chair-object'] === undefined ? true : undefined, 'departing participant releases chair');
  await command(b2, { kind: 'interact', objectId: 'chair-object' }, () => b2.view.seats['chair-object'] === b2.id);
  a.home.send(JSON.stringify({ t: 'join', sid }));
  const a2 = await peer('systems-a', sid, a);
  assert.equal(a2.view.seats['chair-object'], b2.id); assert.equal(text(a2), '00:10');
  await command(b2, { kind: 'interact', objectId: 'menu-chess-button' }, () => timer(b2).state.running === true);
  await until(() => timer(b2).state.remaining === 0 && timer(b2).state.running === false && timer(a2).state.remaining === 0 && text(b2) === '00:00' && text(a2) === '00:00' ? true : undefined, 'real ten-second timer completion converges', 20_000);
  assert.deepEqual(a2.view, b2.view);
  const c = await peer('systems-c');
  assert.deepEqual(c.snapshot.systems, b2.view); assert.equal(text(c), '00:00'); assert.equal(c.view.seats['chair-object'], b2.id);

  const globalBeforeCameras = serialized(b2.view);
  await b2.send({ t: 'mode', mode: '3d' });
  await until(() => b2.homeMessages.findLast(message => message.t === 'users')?.list.some((user: { id: string; mode: string }) => user.id === b2.id && user.mode === '3d') ? true : undefined, 'camera requester enters 3D mode');
  const camera = (p: Peer, id: string) => { const item = p.items.get(id); return item?.kind === 'camera' ? item : undefined; };
  const shot = (p: Peer, id: string) => camera(p, id)?.timerState?.systems.find(system => system.instanceId === 'camera-shot')?.state;
  const cameraTimer = (p: Peer, id: string) => camera(p, id)?.timerState?.systems.find(system => system.instanceId === 'camera-delay')?.state;
  async function spawnCamera(x: number, variant?: 'camera-timer') {
    const previous = new Set(b2.items.keys());
    await b2.send({ t: 'itemCreate', kind: 'camera', variant, x, z: -4, ry: Math.PI });
    return until(() => [...b2.items.values()].find(item => item.kind === 'camera' && item.variant === variant && item.createdBy === b2.id && !previous.has(item.id)), 'normal itemCreate camera result');
  }
  const firstCamera = await spawnCamera(-2, 'camera-timer'), secondCamera = await spawnCamera(0, 'camera-timer'), nativeCamera = await spawnCamera(2);
  assert.notEqual(firstCamera.id, secondCamera.id); assert.notEqual(firstCamera.id, nativeCamera.id);
  for (const item of [firstCamera, secondCamera, nativeCamera]) assert.equal(item.mapPlacement, undefined);
  await until(() => [a2, c].every(p => [firstCamera, secondCamera, nativeCamera].every(item => p.items.has(item.id))) ? true : undefined, 'all normal menu camera items reach peers');
  assert.equal(shot(b2, firstCamera.id)?.busy, false); assert.equal(shot(b2, secondCamera.id)?.busy, false);
  assert.equal(cameraTimer(b2, firstCamera.id)?.remaining, 5); assert.equal(cameraTimer(b2, secondCamera.id)?.remaining, 5);
  assert.equal(camera(b2, nativeCamera.id)?.timerState, undefined);
  assert.deepEqual(b2.view, globalBeforeCameras, 'normal timer camera creation must not replace the global code map');

  const photoToken = crypto.randomUUID(), firstStarted = Date.now(), ownerCountdown = new CameraCountdown();
  ownerCountdown.begin(photoToken);
  await b2.send({ t: 'itemAction', id: firstCamera.id, action: { a: 'timedCameraRequest', token: photoToken } });
  await until(() => shot(b2, firstCamera.id)?.busy === true && shot(b2, firstCamera.id)?.token === photoToken ? true : undefined, 'real itemAction starts only the requested camera');
  assert.equal(shot(b2, firstCamera.id)?.requester, b2.id); assert.equal(shot(b2, firstCamera.id)?.sequence, 1);
  assert.equal(ownerCountdown.update(camera(b2, firstCamera.id)!.timerState, b2.id, Date.now()).capture, false);
  assert.equal(shot(b2, secondCamera.id)?.busy, false); assert.equal(shot(b2, secondCamera.id)?.token, '');
  assert.equal(cameraTimer(b2, secondCamera.id)?.remaining, 5);
  const runningSnapshotAfter = c.ordinal; await c.send({ t: 'sync' });
  const runningSnapshot = await until(() => c.frames.find(frame => frame.ordinal > runningSnapshotAfter && frame.value.kind === 'snapshot')?.value.snapshot as SessionSnapshot | undefined, 'fresh encrypted snapshot contains active normal camera timers');
  const activeSnapshotCamera = runningSnapshot.items.find(item => item.id === firstCamera.id);
  assert.equal(activeSnapshotCamera?.kind, 'camera');
  if (activeSnapshotCamera?.kind !== 'camera') assert.fail('camera missing from active snapshot');
  assert.equal(activeSnapshotCamera.variant, 'camera-timer');
  assert.equal(activeSnapshotCamera.timerState?.systems.find(system => system.instanceId === 'camera-shot')?.state.token, photoToken);
  assert.equal(activeSnapshotCamera.timerState?.systems.find(system => system.instanceId === 'camera-shot')?.state.busy, true);
  assert.deepEqual(runningSnapshot.systems, globalBeforeCameras);
  await until(() => [a2, b2, c].every(p => shot(p, firstCamera.id)?.['completed-token'] === photoToken && shot(p, firstCamera.id)?.busy === false) ? true : undefined, 'normal timer camera completes after five real server seconds', 12_000);
  assert.ok(Date.now() - firstStarted >= 4900, 'photo completed before its five-second delay');
  assert.equal(shot(b2, firstCamera.id)?.['completed-by'], b2.id); assert.equal(cameraTimer(b2, firstCamera.id)?.remaining, 0);
  assert.equal(ownerCountdown.update(camera(b2, firstCamera.id)!.timerState, b2.id, Date.now()).capture, true);
  assert.equal(ownerCountdown.update(camera(b2, firstCamera.id)!.timerState, b2.id, Date.now()).capture, false);
  assert.equal(shot(b2, secondCamera.id)?.['completed-token'], ''); assert.equal(shot(b2, secondCamera.id)?.busy, false);
  assert.equal(camera(b2, nativeCamera.id)?.timerState, undefined);
  const cameraLate = await peer('camera-systems-late');
  const lateSnapshotCamera = cameraLate.snapshot.items.find(item => item.id === firstCamera.id);
  assert.equal(lateSnapshotCamera?.kind, 'camera');
  if (lateSnapshotCamera?.kind !== 'camera') assert.fail('camera missing from late snapshot');
  assert.equal(lateSnapshotCamera.timerState?.systems.find(system => system.instanceId === 'camera-shot')?.state['completed-token'], photoToken);
  assert.equal(new CameraCountdown().update(lateSnapshotCamera.timerState, b2.id, Date.now()).capture, false, 'a late tab must not replay a completed photo');
  assert.deepEqual(cameraLate.snapshot.systems, globalBeforeCameras);

  await b2.send({ t: 'itemMove', id: nativeCamera.id, x: 4, z: 3, ry: 0.5 });
  await until(() => [a2, b2, c, cameraLate].every(p => camera(p, nativeCamera.id)?.ry === 0.5) ? true : undefined, 'ordinary camera still moves independently');
  assert.equal(camera(b2, nativeCamera.id)?.timerState, undefined);
  const cancelledToken = crypto.randomUUID();
  await b2.send({ t: 'itemAction', id: secondCamera.id, action: { a: 'timedCameraRequest', token: cancelledToken } });
  await until(() => shot(b2, secondCamera.id)?.busy === true && shot(b2, secondCamera.id)?.token === cancelledToken ? true : undefined, 'second independent camera starts');
  const cancelledDeadline = Number(shot(b2, secondCamera.id)?.deadline);
  await b2.send({ t: 'itemRemove', id: secondCamera.id });
  const cameraPeers = [a2, b2, c, cameraLate];
  await until(() => cameraPeers.every(p => !p.items.has(secondCamera.id)) ? true : undefined, 'running camera removal reaches every peer');
  const removedOrdinals = new Map(cameraPeers.map(p => [p, p.ordinal]));
  await delay(Math.max(0, cancelledDeadline - Date.now()) + 300);
  for (const p of cameraPeers) {
    assert.equal(p.items.has(secondCamera.id), false);
    assert.equal(laterMessage(p, removedOrdinals.get(p)!, message => message?.t === 'item' && message.item?.id === secondCamera.id), undefined, 'removed camera must not receive a late completion or respawn');
    assert.equal(shot(p, firstCamera.id)?.['completed-token'], photoToken);
    assert.equal(camera(p, nativeCamera.id)?.timerState, undefined);
    assert.deepEqual(p.view, globalBeforeCameras);
  }
  const afterRemovalSnapshot = c.ordinal; await c.send({ t: 'sync' });
  const removedSnapshot = await until(() => c.frames.find(frame => frame.ordinal > afterRemovalSnapshot && frame.value.kind === 'snapshot')?.value.snapshot as SessionSnapshot | undefined, 'post-deadline snapshot confirms camera removal');
  assert.equal(removedSnapshot.items.some(item => item.id === secondCamera.id), false);
  assert.equal(removedSnapshot.items.some(item => item.id === firstCamera.id), true);
  assert.equal(removedSnapshot.items.some(item => item.id === nativeCamera.id), true);

  await resync(other); assert.equal(other.view.map.id, 'empty'); assert.equal(other.items.size, 0);
  for (const p of [a, b, b2, a2, c, cameraLate, other]) assert.deepEqual(p.failures, []);
  assert.equal(/bad room message|system tick|System registration:/.test(logs), false, logs);
  const revisionRetries = [a, b, b2, a2, c, other].reduce((total, p) => total + p.frames.filter(frame => frame.value.message?.commandResult?.outcome === 'rejected' && frame.value.message.error === 'system revision conflict' && p.sentCommands.some(input => input.id === frame.value.message.commandResult.id)).length, 0);
  const forcedRetries = recoveredFrames.filter(message => message.commandResult.outcome === 'rejected' && message.error === 'system revision conflict').length;
  t.diagnostic(`Full Node server + encrypted kokosync relay: verified ${catalog.entries.length} hashed originals across ${systemIds.length} system IDs, load, late joins, reconnect, native items, occupancy, raw same-revision rejection, actual client queue recovery, rapid controls, real 10s completion, two normal-menu timer-camera spawns, independent real 5s completion, active/late snapshots, native-camera movement and deletion before its deadline without replay in ${Date.now() - began}ms; queue revision-conflict retries=${revisionRetries}, forced-pause retries=${forcedRetries}, other control retries=${revisionRetries - forcedRetries}. Raw same-revision commands returned applied then rejected, and all queued controls eventually applied. Audio and browser rendering were outside this test.`);
});
