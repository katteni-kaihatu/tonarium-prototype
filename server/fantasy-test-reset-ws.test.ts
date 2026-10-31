import { markFantasyPlatformDataCurrent } from './fantasy-platform-reset.ts';
import { readFantasySavedProfiles } from './fantasy-test-saved-profiles.ts';
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { COMPAT_VERSION } from '../shared/protocol.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';
import type { FantasyContractBoard } from '../shared/fantasy-contracts.ts';
import { testServerEnv } from './test-db.ts';

interface Message { t: string; enabled?: boolean; profile?: FantasyProfile; error?: string; records?: { name: string }[]; board?: FantasyContractBoard | null }

async function isolated(t: TestContext, flag: string) {
  const prefix = path.join(os.tmpdir(), 'tonarium-test-life-ws-');
  const directory = fs.mkdtempSync(prefix), file = path.join(directory, 'fantasy.json');
  const failureMarker = path.join(directory, 'fail-fantasy-save'), failureReceipt = path.join(directory, 'failed-fantasy-save');
  const preload = path.join(directory, 'inject-save-failure.mjs');
  fs.writeFileSync(preload, `
import fs from 'node:fs';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
const target = ${JSON.stringify(path.resolve(file))};
const marker = ${JSON.stringify(failureMarker)}, receipt = ${JSON.stringify(failureReceipt)};
const rename = fs.renameSync;
fs.renameSync = function(source, destination) {
  if (typeof destination === 'string' && path.resolve(destination) === target && fs.existsSync(marker)) {
    fs.appendFileSync(receipt, 'failed\\n');
    throw Object.assign(new Error('Injected fantasy persistence failure'), { code: 'EIO' });
  }
  return rename(source, destination);
};
syncBuiltinESMExports();
process.on('message', message => {
  if (message?.t === 'fantasy-save-fault-barrier') {
    process.send?.({ t: 'fantasy-save-fault-ready', token: message.token, enabled: fs.existsSync(marker) });
  }
});
`);

  const born = (name: string) => applyFantasyAction(newFantasyProfile(), { type: 'create', name, source: 'human', gender: 'female' }, () => .5).profile;
  fs.writeFileSync(file, JSON.stringify({ alice: born('Alice old life'), bob: born('Bob unchanged') }));
  fs.writeFileSync(path.join(directory, 'fantasy-clock.json'), JSON.stringify({ version: 1, hour: 8, wallTime: Date.now() + 3_600_000 }));
  const sessions = path.join(directory, 'sessions.json');
  fs.writeFileSync(sessions, JSON.stringify({ name: 'Reset test', sessions: [{ id: 'test-world', name: 'Isolated world', world: 'fantasy' }] }));
  const listener = net.createServer(); await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = (listener.address() as net.AddressInfo).port; await new Promise<void>(resolve => listener.close(() => resolve()));
  markFantasyPlatformDataCurrent(directory);
  const child = spawn(process.execPath, ['--import', pathToFileURL(preload).href, '--import', 'tsx', 'server/index.ts', '--dev'], {
    env: { ...process.env, ...(await testServerEnv(t)), TONARIUM_TEST_HELLO_ID: '1', NODE_ENV: 'test', SERVER_PORT: String(port), DATA_DIR: directory, SESSIONS_FILE: sessions, FANTASY_TEST_TOOLS: flag,
      LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '', KOKOAAI_APIKEY: '' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  assert.ok(child.stdout && child.stderr);
  let logs = ''; child.stdout.on('data', data => { logs += String(data); }); child.stderr.on('data', data => { logs += String(data); });
  const sockets: WebSocket[] = [];
  const acknowledgments: { token: number; enabled: boolean }[] = []; let controlSequence = 0;
  child.on('message', message => {
    if (message && typeof message === 'object' && 't' in message && message.t === 'fantasy-save-fault-ready'
      && 'token' in message && typeof message.token === 'number' && 'enabled' in message && typeof message.enabled === 'boolean') {
      acknowledgments.push({ token: message.token, enabled: message.enabled });
    }
  });
  async function until<T>(read: () => T | undefined, timeout = 8_000): Promise<T> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const result = read(); if (result !== undefined) return result;
      if (child.exitCode !== null) throw new Error(`Reset test server exited: ${logs}`);
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    throw new Error(`Reset test timed out: ${logs}`);
  }
  t.after(async () => {
    for (const socket of sockets) socket.terminate();
    child.kill();
    if (child.exitCode === null && !child.signalCode) await new Promise<void>(resolve => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3_000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
    if (!path.resolve(directory).startsWith(path.resolve(prefix))) throw new Error('Unexpected test directory');
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await until(() => logs.includes('server on') ? true : undefined, 20_000);
  const connect = async (id: 'alice' | 'bob') => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(socket);
    const messages: Message[] = []; socket.on('message', raw => messages.push(JSON.parse(String(raw)) as Message));
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const send = (message: unknown) => socket.send(JSON.stringify(message));
    send({ t: 'hello', compat: COMPAT_VERSION, id, name: id });
    await until(() => messages.find(message => message.t === 'snapshot'));
    const request = async (message: unknown) => {
      const start = messages.length; send(message);
      return until(() => messages.slice(start).find(reply => reply.t === 'fantasyProfile'));
    };
    const join = async () => { const start = messages.length; send({ t: 'join', sid: 'test-world' }); return until(() => messages.slice(start).find(reply => reply.t === 'fantasyProfile')); };
    const barrier = async () => { const start = messages.length; send({ t: 'hello', compat: COMPAT_VERSION, id, name: id }); await until(() => messages.slice(start).find(reply => reply.t === 'snapshot')); };
    return { send, messages, request, join, barrier };
  };
  const read = () => readFantasySavedProfiles(file);
  const failPersistence = async (enabled: boolean) => {
    if (enabled) fs.writeFileSync(failureMarker, 'fail', { flag: 'wx' });
    else fs.rmSync(failureMarker, { force: true });
    const token = ++controlSequence;
    child.send({ t: 'fantasy-save-fault-barrier', token });
    const reply = await until(() => acknowledgments.find(message => message.token === token));
    assert.equal(reply.enabled, enabled);
  };
  return { connect, read, until, file, failPersistence, failureReceipt };
}

test('life reset capability is disabled without the server flag, even on loopback', { timeout: 25_000 }, async t => {
  const { connect, read } = await isolated(t, ''), alice = await connect('alice');
  assert.equal(alice.messages.find(message => message.t === 'fantasyTestMode')?.enabled, false);
  await alice.join();
  const before = read();
  const denied = await alice.request({ t: 'fantasyTestReset', revision: before.alice.revision, confirm: 'RESET_LIFE' });
  assert.ok(denied.error); assert.deepEqual(read(), before);
});

test('life reset requires entry and confirmation, rejects stale or replayed requests, and only resets its owner', { timeout: 25_000 }, async t => {
  const { connect, read, until } = await isolated(t, '1'), alice = await connect('alice');
  assert.equal(alice.messages.find(message => message.t === 'fantasyTestMode')?.enabled, true);
  const initial = read();
  alice.send({ t: 'fantasyTestReset', revision: initial.alice.revision, confirm: 'RESET_LIFE' });
  await alice.barrier();
  assert.equal(alice.messages.some(message => message.t === 'fantasyProfile'), false);
  assert.deepEqual(read(), initial);
  assert.equal(alice.messages.filter(message => message.t === 'fantasyTestMode').length, 1);
  await alice.join();
  const bob = await connect('bob'); await bob.join();
  const sibling = await connect('alice');
  for (const request of [
    { t: 'fantasyTestReset', revision: initial.alice.revision, confirm: 'yes' },
    { t: 'fantasyTestReset', revision: initial.alice.revision, confirm: 'RESET_LIFE', user: 'bob' },
    { t: 'fantasyTestReset', revision: -1, confirm: 'RESET_LIFE' },
  ]) assert.ok((await alice.request(request)).error);
  assert.deepEqual(read(), initial);
  alice.send({ t: 'fantasyContracts' });
  const offer = await until(() => alice.messages.findLast(message => message.t === 'fantasyContractBoard' && message.board)?.board?.offers.find(offer => offer.available && offer.mode === 'exclusive'));
  const accepted = await alice.request({ t: 'fantasyAction', revision: initial.alice.revision, action: { type: 'accept', quest: offer.quest, offer: offer.id } });
  assert.equal(accepted.error, undefined); assert.equal(accepted.profile!.character!.contracts![offer.quest].offerId, offer.id);
  const working = await alice.request({ t: 'fantasyAction', revision: accepted.profile!.revision, action: { type: 'work' } });
  assert.equal(working.profile?.activity?.action.type, 'work');
  const resetRequest = { t: 'fantasyTestReset', revision: working.profile!.revision, confirm: 'RESET_LIFE' };
  const reset = await alice.request(resetRequest);
  assert.equal(reset.error, undefined); assert.equal(reset.profile!.character, null); assert.equal(reset.profile!.activity, undefined);
  assert.equal(reset.profile!.generation, 2); assert.equal(reset.profile!.revision, working.profile!.revision + 1);
  assert.equal(reset.profile!.pastLives!.length, 1); assert.equal(reset.profile!.pastLives![0].name, 'Alice old life');
  await until(() => sibling.messages.find(message => message.profile?.generation === 2));
  await until(() => bob.messages.find(message => message.t === 'fantasyLegacies' && message.records?.some(record => record.name === 'Alice old life')));
  const refreshed = bob.messages.length; bob.send({ t: 'fantasyContracts' });
  const board = await until(() => bob.messages.slice(refreshed).find(message => message.t === 'fantasyContractBoard' && message.board));
  assert.equal(board.board!.offers.find(candidate => candidate.id === offer.id)?.available, true);
  assert.deepEqual(read().bob, initial.bob);
  for (const replay of [resetRequest, { ...resetRequest, revision: reset.profile!.revision }]) {
    assert.ok((await alice.request(replay)).error);
    assert.equal(read().alice.generation, 2); assert.equal(read().alice.pastLives!.length, 1);
  }
});

test('failed reset persistence preserves the active life and another player, then permits a safe retry', { timeout: 25_000 }, async t => {
  const { connect, read, file, failPersistence, failureReceipt } = await isolated(t, '1'), alice = await connect('alice');
  await alice.join();
  // 別プロセスの保存完了も確認してから比較元を取り、ファイルを退避せず置換だけを失敗させる。
  await failPersistence(true);
  const before = read(), beforeBytes = fs.readFileSync(file, 'utf8');
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const rejected = await alice.request({ t: 'fantasyTestReset', revision: before.alice.revision, confirm: 'RESET_LIFE' });
      assert.match(rejected.error!, /保存できませんでした/); assert.deepEqual(rejected.profile, before.alice);
      assert.equal(fs.readFileSync(file, 'utf8'), beforeBytes);
    }
    assert.ok(fs.readFileSync(failureReceipt, 'utf8').trim().split('\n').length >= 3, 'each rejected request must reach the child persistence failure');
  } finally { await failPersistence(false); }
  assert.deepEqual(read(), before);
  const retry = await alice.request({ t: 'fantasyTestReset', revision: before.alice.revision, confirm: 'RESET_LIFE' });
  assert.equal(retry.error, undefined); assert.equal(retry.profile!.generation, 2); assert.deepEqual(read().bob, before.bob);
  assert.equal(retry.profile!.revision, before.alice.revision + 1);
  assert.equal(retry.profile!.pastLives!.length, (before.alice.pastLives?.length ?? 0) + 1);
  const committed = read();
  assert.ok((await alice.request({ t: 'fantasyTestReset', revision: before.alice.revision, confirm: 'RESET_LIFE' })).error);
  assert.deepEqual(read(), committed);
});
