import { testServerEnv } from './test-db.ts';
import { markFantasyPlatformDataCurrent } from './fantasy-platform-reset.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { WebSocket } from 'ws';
import { COMPAT_VERSION } from '../shared/protocol.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { applyFantasyPropertyCommand, newFantasyPropertyLedger, type FantasyPropertyState } from '../shared/fantasy-property.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';

const root = path.resolve(import.meta.dirname, '..');
const plot = 'hearth-commercial';
const action = { type: 'cookMix', station: 'kitchen', recipe: 'cook-meal', workshop: plot, storage: plot, ingredients: [{ item: 'fish', count: 1 }, { item: 'herb', count: 1 }] } as const;
type Message = { t: string; profile?: FantasyProfile; state?: FantasyPropertyState; error?: string };

test('real server ticks privately push shared warehouse depletion to owner/coowner and refresh the cooking UI', { timeout: 35_000 }, async t => {
  const prefix = 'tonarium-cooking-ws-';
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const file = path.join(directory, 'fantasy.json'), nowFile = path.join(directory, 'fake-now.txt');
  const baseNow = Date.now();
  fs.writeFileSync(nowFile, String(baseNow));
  const hook = path.join(directory, 'clock-hook.mjs');
  fs.writeFileSync(hook, "import fs from 'node:fs';\nconst realNow = Date.now; Date.now = () => { try { return Number(fs.readFileSync(process.env.QA_CLOCK_FILE, 'utf8')); } catch { return realNow(); } };\n");
  const profiles: Record<string, FantasyProfile> = Object.fromEntries(['alice', 'bob', 'eve'].map(id => {
    const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name: `WS ${id}`, source: 'human', gender: 'female' }, () => .99).profile;
    const c = p.character!; c.job = 'cook'; c.jobXp.cook = 1000; c.gold = 90_000; c.inventory = {}; c.foodLots = [];
    c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
    return [id, p];
  }));
  let state = applyFantasyPropertyCommand(newFantasyPropertyLedger(), profiles, 'alice', { type: 'buy', plot, revision: 0, requestId: 'ws-buy' }, 8);
  assert.equal(state.error, undefined);
  state = applyFantasyPropertyCommand(state.ledger, state.profiles, 'alice', { type: 'shareOffer', plot, revision: state.ledger.plots[plot].revision, requestId: 'ws-share', target: 'WS bob', percent: 20 }, 8);
  assert.equal(state.error, undefined);
  state = applyFantasyPropertyCommand(state.ledger, state.profiles, 'bob', { type: 'shareAccept', plot, revision: state.ledger.plots[plot].revision, requestId: 'ws-accept' }, 8);
  assert.equal(state.error, undefined);
  assert.ok(state.profiles.alice.character!.propertyTitles?.includes(plot));
  assert.ok(state.profiles.bob.character!.propertyTitles?.includes(plot));
  state.ledger.plots[plot].business = { inventory: { herb: 3 }, treasury: 777, lastAt: 8, parcels: [{ id: 'private-ws-fish-parcel', goods: { item: 'fish', count: 3, food: [{ id: 'private-ws-fish-lot', item: 'fish', count: 3, createdAt: 8 }] } }] };
  fs.writeFileSync(file, JSON.stringify({ version: 2, profiles: state.profiles, properties: state.ledger, combats: {} }));
  fs.writeFileSync(path.join(directory, 'fantasy-clock.json'), JSON.stringify({ version: 1, hour: 8, wallTime: baseNow }));
  const sessions = path.join(directory, 'sessions.json');
  fs.writeFileSync(sessions, JSON.stringify({ name: 'WS cooking QA', sessions: [{ id: 'test-world', name: 'Isolated cooking QA', world: 'fantasy' }] }));
  const listener = net.createServer(); await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = (listener.address() as net.AddressInfo).port; await new Promise<void>(resolve => listener.close(() => resolve()));
  markFantasyPlatformDataCurrent(directory);
  const child = spawn(process.execPath, ['--import', pathToFileURL(hook).href, '--import', 'tsx', 'server/index.ts', '--dev'], {
    cwd: root,
    env: { ...process.env, ...(await testServerEnv(t)), TONARIUM_TEST_HELLO_ID: '1', NODE_ENV: 'test', SERVER_PORT: String(port), DATA_DIR: directory, SESSIONS_FILE: sessions, QA_CLOCK_FILE: nowFile, LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '', KOKOAAI_APIKEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = ''; child.stdout.on('data', value => { logs += String(value); }); child.stderr.on('data', value => { logs += String(value); });
  const sockets: WebSocket[] = [];
  t.after(async () => {
    for (const socket of sockets) socket.terminate();
    child.kill();
    if (child.exitCode === null && !child.signalCode) await new Promise<void>(resolve => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3_000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
    const target = path.resolve(directory);
    assert.equal(path.dirname(target), path.resolve(os.tmpdir())); assert.ok(path.basename(target).startsWith(prefix));
    fs.rmSync(target, { recursive: true, force: true });
  });
  async function until<T>(read: () => T | undefined, timeout = 8_000): Promise<T> {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = read(); if (value !== undefined) return value;
      if (child.exitCode !== null) throw new Error(`Server exited: ${logs}`);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`Timed out; server logs: ${logs}`);
  }
  await until(() => logs.includes('server on') ? true : undefined, 20_000);
  const clients: Record<string, { messages: Message[]; raw: string[]; send: (msg: unknown) => void }> = {};
  for (const id of ['alice', 'bob', 'eve']) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(socket);
    const messages: Message[] = [], raw: string[] = [];
    socket.on('message', value => { raw.push(String(value)); messages.push(JSON.parse(String(value))); });
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const send = (msg: unknown) => socket.send(JSON.stringify(msg)); clients[id] = { messages, raw, send };
    send({ t: 'hello', compat: COMPAT_VERSION, id, name: `WS ${id}` });
    await until(() => messages.find(message => message.t === 'snapshot'));
    send({ t: 'join', sid: 'test-world' });
    await until(() => messages.find(message => message.t === 'fantasyPropertyState' && message.state?.location === 'hearth'));
  }
  const saved = () => JSON.parse(fs.readFileSync(file, 'utf8'));
  const business = (msg: Message) => msg.state?.plots.find(value => value.id === plot)?.business;
  const latestProperty = (id: string) => clients[id].messages.findLast(message => message.t === 'fantasyPropertyState')!;
  for (const id of ['alice', 'bob']) {
    assert.equal(business(latestProperty(id))?.inventory.herb, 3);
    assert.equal(business(latestProperty(id))?.parcels[0].count, 3);
  }
  assert.equal(business(latestProperty('eve')), undefined);

  // 受信した共有倉庫情報で実際の調理画面の上限も確認する。
  const require = createRequire(import.meta.url), react = require('react') as typeof import('react');
  const oldSnapshot = react.useSyncExternalStore, oldState = react.useState;
  let overrides: unknown[] = [];
  react.useSyncExternalStore = (subscribe, snapshot) => oldSnapshot(subscribe, snapshot, snapshot);
  react.useState = ((initial: unknown) => oldState(overrides.length ? overrides.shift() : initial)) as typeof react.useState;
  const { FantasyCooking } = require('../client/src/world/FantasyCooking.tsx') as typeof import('../client/src/world/FantasyCooking.tsx');
  const { useStore } = require('../client/src/store.ts') as typeof import('../client/src/store.ts');
  const { setLocale } = require('../client/src/locale.ts') as typeof import('../client/src/locale.ts');
  const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');
  t.after(() => { react.useSyncExternalStore = oldSnapshot; react.useState = oldState; });
  function assertCoownerUi(max: number) {
    setLocale('en'); useStore.setState({ fantasyProperties: latestProperty('bob').state! });
    overrides = [{ mode: 'fixed', slots: ['fish', 'herb', '', '', ''], targets: [0, 1], repeats: '999', source: 'storage', recipe: 'cook-meal' }];
    try {
      const html = renderToStaticMarkup(react.createElement(FantasyCooking, { c: saved().profiles.bob.character, station: 'kitchen', workshop: plot, blocked: false, onAction: () => {} }));
      assert.ok(html.includes(`Available repeats: ${max}`), html);
      assert.ok(html.includes(`max="${max}"`));
      if (max === 0) assert.match(html, /class="fr-btn primary" disabled=""/);
    } finally { overrides = []; }
  }
  assertCoownerUi(3);
  clients.alice.send({ t: 'fantasyAction', revision: saved().profiles.alice.revision, action: { ...action, repeats: 2 } });
  await until(() => saved().profiles.alice.activity?.cooking?.completed === 0 ? true : undefined);
  const markers = Object.fromEntries(Object.entries(clients).map(([id, client]) => [id, client.messages.length]));
  fs.writeFileSync(nowFile, String(baseNow + 360_000)); // ゲーム内3時間だけ進め、実タイマーは変えない。
  await until(() => saved().profiles.alice.activity?.cooking?.completed === 1 ? true : undefined);
  for (const id of ['alice', 'bob']) await until(() => clients[id].messages.slice(markers[id]).find(message => message.t === 'fantasyPropertyState' && business(message)?.inventory.herb === 2));
  assertCoownerUi(2);
  const revisionAfterFirst = latestProperty('bob').state!.revision;
  clients.bob.send({ t: 'fantasyAction', revision: saved().profiles.bob.revision, action });
  await until(() => saved().profiles.bob.activity?.action.type === 'cookMix' ? true : undefined);
  fs.writeFileSync(nowFile, String(baseNow + 720_000));
  await until(() => !saved().profiles.alice.activity && !saved().profiles.bob.activity ? true : undefined);
  for (const id of ['alice', 'bob']) await until(() => {
    const message = latestProperty(id), b = business(message);
    return message.state!.revision > revisionAfterFirst && b && Object.keys(b.inventory).length === 0 && b.parcels.length === 0 ? true : undefined;
  });
  assertCoownerUi(0);
  const final = saved();
  assert.equal(final.profiles.alice.character.practice.craft, 2);
  assert.equal(final.profiles.bob.character.practice.craft, 1);
  assert.equal(final.profiles.alice.character.inventory.fish ?? 0, 0);
  assert.equal(final.profiles.bob.character.inventory.fish ?? 0, 0);
  assert.ok(final.profiles.alice.character.jobXp.cook > 1000);
  assert.ok(final.profiles.bob.character.jobXp.cook > 1000);
  assert.deepEqual(final.properties.plots[plot].business.inventory, {});
  assert.deepEqual(final.properties.plots[plot].business.parcels, []);
  for (const message of clients.eve.messages.filter(message => message.t === 'fantasyPropertyState')) assert.equal(business(message), undefined);
  assert.equal(clients.eve.raw.some(value => value.includes('private-ws-fish-parcel') || value.includes('private-ws-fish-lot')), false);
  assert.equal(clients.alice.messages.some(message => message.t === 'fantasyProfile' && message.error), false);
  assert.equal(clients.bob.messages.some(message => message.t === 'fantasyProfile' && message.error), false);
});
