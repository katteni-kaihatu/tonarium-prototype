import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { COMPAT_VERSION } from '../shared/protocol.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';
import type { FantasyRealmState } from '../shared/fantasy-realm.ts';
import type { FantasyPropertyState } from '../shared/fantasy-property.ts';

interface Message { t: string; state?: FantasyRealmState | FantasyPropertyState | null; profile?: FantasyProfile; error?: string; list?: { id: string; session: string | null }[] }
async function isolated(t: TestContext) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-realm-ws-')), file = path.join(directory, 'fantasy.json');
  const players = Object.fromEntries(['alice', 'bob', 'outsider'].map(id => {
    const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name: id === 'outsider' ? 'Outsider' : id === 'alice' ? 'Alice' : 'Bob', source: 'human', gender: 'female' }, () => .5).profile;
    p.character!.gold = 2000; p.character!.inventory.herb = 20; p.character!.inventory.ore = 10; return [id, p];
  }));
  fs.writeFileSync(file, JSON.stringify(players));
  fs.writeFileSync(path.join(directory, 'fantasy-clock.json'), JSON.stringify({ version: 1, hour: 8, wallTime: Date.now() + 3_600_000 }));
  const sessions = path.join(directory, 'sessions.json');
  fs.writeFileSync(sessions, JSON.stringify({ name: 'Realm websocket QA', sessions: [
    { id: 'realm-public', name: 'Public realm test', world: 'fantasy', visibility: 'public' },
    { id: 'realm-private', name: 'Private realm test', world: 'fantasy', visibility: 'invite', owner: 'Outsider', invited: [] },
  ] }));
  const listener = net.createServer(); await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = (listener.address() as net.AddressInfo).port; await new Promise<void>(resolve => listener.close(() => resolve()));
  assert.ok(![3011, 18081, 8190, 5183, 3199, 5199].includes(port));
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts', '--dev'], { cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'test', FANTASY_ACCOUNT_TEST_BYPASS: '1', SERVER_PORT: String(port), DATA_DIR: directory, SESSIONS_FILE: sessions,
      LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '', NPC_LLM_URL: 'http://127.0.0.1:1/v1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', value => { logs += value; }); child.stderr.on('data', value => { logs += value; });
  const sockets: WebSocket[] = [];
  const until = async <T>(read: () => T | undefined, timeout = 8000): Promise<T> => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const result = read(); if (result !== undefined) return result;
      if (child.exitCode !== null) throw new Error(`Realm test server exited: ${logs}`);
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    throw new Error(`Realm socket scenario timed out: ${logs}`);
  };
  t.after(async () => {
    for (const socket of sockets) socket.terminate();
    child.kill();
    if (child.exitCode === null && !child.signalCode) await new Promise<void>(resolve => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
    const target = path.resolve(directory); assert.equal(path.dirname(target), path.resolve(os.tmpdir())); assert.ok(path.basename(target).startsWith('tonarium-realm-ws-'));
    fs.rmSync(target, { recursive: true, force: true });
  });
  await until(() => logs.includes('server on') ? true : undefined, 20000);
  const connect = async (id: string, session: string | null) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(socket);
    const messages: Message[] = []; socket.on('message', raw => messages.push(JSON.parse(String(raw)) as Message));
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const send = (message: unknown) => socket.send(JSON.stringify(message));
    send({ t: 'hello', compat: COMPAT_VERSION, id, name: id === 'outsider' ? 'Outsider' : id === 'alice' ? 'Alice' : 'Bob' });
    await until(() => messages.find(message => message.t === 'fantasyProfile'));
    if (session) { const start = messages.length; send({ t: 'join', sid: session }); await until(() => messages.slice(start).find(message => message.t === 'users' && message.list?.some(user => user.id === id && user.session === session))); }
    const state = () => (messages.filter(message => message.t === 'fantasyRealmState' && message.state).at(-1)?.state as FantasyRealmState | undefined);
    const realm = async (domain: 'economy' | 'civic', command: unknown, expected?: (state: FantasyRealmState) => boolean, denied = false, extras: Record<string, unknown> = {}) => {
      const start = messages.length; send({ t: 'fantasyRealmRequest', domain, command, ...extras });
      return until(() => messages.slice(start).find(message => message.t === 'fantasyRealmState' && (denied ? !!message.error : !!message.state && !message.error && (!expected || expected(message.state as FantasyRealmState)))));
    };
    const property = async (command: unknown, denied = false, expected?: (state: FantasyPropertyState) => boolean) => {
      const start = messages.length; send({ t: 'fantasyPropertyRequest', command });
      return until(() => messages.slice(start).find(message => message.t === 'fantasyPropertyState' && (denied ? !!message.error : !!message.state && !message.error && (!expected || expected(message.state as FantasyPropertyState)))));
    };
    return { socket, messages, send, state, realm, property };
  };
  const read = () => { const saved = JSON.parse(fs.readFileSync(file, 'utf8')); return (saved.profiles ?? saved) as Record<string, FantasyProfile>; };
  return { connect, until, read, file };
}

test('actual realm sockets share finite stock and atomic trades while private peers, consent and property targets stay isolated', { timeout: 60000 }, async t => {
  const f = await isolated(t), alice = await f.connect('alice', 'realm-public'), bob = await f.connect('bob', 'realm-public'), outsider = await f.connect('outsider', 'realm-private');
  await alice.realm('economy', { type: 'sync' }, state => state.economy.peers.some(peer => peer.id === 'bob'));
  await bob.realm('economy', { type: 'sync' }); await outsider.realm('economy', { type: 'sync' });
  assert.deepEqual(alice.state()!.economy.peers.map(peer => peer.id), ['bob']); assert.deepEqual(outsider.state()!.economy.peers, []);
  const outsiderBefore = f.read().outsider;
  assert.ok((await alice.realm('economy', { type: 'open', peer: 'outsider' }, undefined, true)).error);
  assert.ok((await outsider.realm('economy', { type: 'open', peer: 'alice' }, undefined, true)).error);
  assert.ok((await alice.realm('economy', { type: 'sync' }, undefined, true, { user: 'outsider' })).error);
  assert.deepEqual(f.read().outsider, outsiderBefore);

  const shop = alice.state()!.economy.shops.find(entry => entry.building === 'market')!, lamp = shop.lots.find(entry => entry.item === 'lantern' && entry.id === 'stock-lantern')!; assert.ok(lamp?.count);
  const beforeAliceLamps = f.read().alice.character!.inventory.lantern ?? 0;
  await alice.realm('economy', { type: 'shopBuy', building: 'market', item: 'lantern', lot: lamp.id, count: lamp.count, revision: shop.revision, quotedUnitPrice: lamp.unitPrice }, state => state.economy.shops.find(entry => entry.building === 'market')!.lots.find(entry => entry.id === lamp.id)!.count === 0);
  await f.until(() => bob.state()?.economy.shops.find(entry => entry.building === 'market')?.lots.find(entry => entry.id === lamp.id)?.count === 0 ? true : undefined);
  assert.equal(f.read().alice.character!.inventory.lantern, beforeAliceLamps + lamp.count);
  const bobBeforeStock = f.read().bob;
  assert.ok((await bob.realm('economy', { type: 'shopBuy', building: 'market', item: 'lantern', count: 1, revision: shop.revision }, undefined, true)).error); assert.deepEqual(f.read().bob, bobBeforeStock);

  await alice.realm('economy', { type: 'open', peer: 'bob' }, state => state.economy.trades.some(trade => trade.status === 'open'));
  const trade = alice.state()!.economy.trades.find(entry => entry.status === 'open')!;
  assert.equal(outsider.state()!.economy.trades.some(entry => entry.id === trade.id), false);
  await alice.realm('economy', { type: 'offer', trade: trade.id, revision: 0, gold: 100, items: [{ item: 'herb', count: 3 }] }, state => state.economy.trades.find(entry => entry.id === trade.id)?.revision === 1);
  await bob.realm('economy', { type: 'offer', trade: trade.id, revision: 1, gold: 25, items: [{ item: 'ore', count: 2 }] }, state => state.economy.trades.find(entry => entry.id === trade.id)?.revision === 2);
  const balances = { alice: f.read().alice.character!.gold, bob: f.read().bob.character!.gold };
  await alice.realm('economy', { type: 'confirm', trade: trade.id, revision: 2 }, state => state.economy.trades.find(entry => entry.id === trade.id)?.offers[0].confirmed === true);
  assert.equal(f.read().alice.character!.gold, balances.alice);
  await bob.realm('economy', { type: 'confirm', trade: trade.id, revision: 2 }, state => state.economy.trades.find(entry => entry.id === trade.id)?.status === 'completed');
  await f.until(() => alice.messages.some(message => message.t === 'fantasyProfile' && message.profile?.character?.gold === balances.alice - 75) && bob.messages.some(message => message.t === 'fantasyProfile' && message.profile?.character?.gold === balances.bob + 75) ? true : undefined);
  assert.equal(f.read().alice.character!.gold, balances.alice - 75); assert.equal(f.read().bob.character!.gold, balances.bob + 75);
  assert.equal(f.read().alice.character!.inventory.herb, 17); assert.equal(f.read().bob.character!.inventory.herb, 23); assert.equal(f.read().alice.character!.inventory.ore, 12); assert.equal(f.read().bob.character!.inventory.ore, 8);

  const bRevision = bob.state()!.civic.revision;
  assert.ok((await bob.realm('civic', { type: 'consent', enabled: true, revision: bRevision, requestId: 'forge-consent', user: 'outsider' }, undefined, true)).error);
  await alice.realm('civic', { type: 'consent', enabled: true, revision: alice.state()!.civic.revision, requestId: 'alice-consent' }, state => state.civic.riskEnabled);
  assert.ok((await alice.realm('civic', { type: 'rob', target: 'bob', revision: alice.state()!.civic.revision, requestId: 'protected-bob' }, undefined, true)).error);
  assert.ok((await outsider.realm('civic', { type: 'consent', enabled: true, revision: outsider.state()!.civic.revision, requestId: 'private-consent' }, undefined, true)).error);
  assert.equal(outsider.state()!.civic.riskEnabled, false); assert.equal(bob.state()!.civic.riskEnabled, false); assert.equal(f.read().bob.character!.gold, balances.bob + 75);

  const propertyState = (await alice.property({ type: 'sync' })).state as FantasyPropertyState, residence = propertyState.plots.find(entry => entry.id === 'hearth-residence')!;
  await alice.property({ type: 'buy', plot: residence.id, revision: residence.revision, requestId: 'buy-home' }, false, state => state.plots.find(entry => entry.id === residence.id)?.ownedByMe === true);
  const currentProperty = (await alice.property({ type: 'sync' })).state as FantasyPropertyState, own = currentProperty.plots.find(entry => entry.id === residence.id)!;
  assert.ok((await alice.property({ type: 'leaseOffer', plot: own.id, revision: own.revision, requestId: 'foreign-lease', target: 'outsider', rent: 10, days: 2 }, true)).error);
  assert.ok((await alice.property({ type: 'leaseOffer', plot: own.id, revision: own.revision, requestId: 'unknown-lease', target: 'unknown-player', rent: 10, days: 2 }, true)).error);
  assert.ok((await alice.property(null, true)).error);
  const offered = await alice.property({ type: 'leaseOffer', plot: own.id, revision: own.revision, requestId: 'local-name-lease', target: 'Bob', rent: 10, days: 2 }, false, state => !!state.plots.find(entry => entry.id === own.id)?.management?.lease);
  assert.equal(offered.error, undefined); assert.equal((offered.state as FantasyPropertyState).plots.find(entry => entry.id === own.id)!.management!.lease!.name, 'Bob');
  const tenantView = (await bob.property({ type: 'sync' })).state as FantasyPropertyState, tenantPlot = tenantView.plots.find(entry => entry.id === own.id)!;
  assert.equal(tenantPlot.management?.lease?.forMe, true);
  const outsiderProperty = (await outsider.property({ type: 'sync' })).state as FantasyPropertyState;
  assert.equal(outsiderProperty.plots.find(entry => entry.id === own.id)!.management?.lease, undefined);
  const ownerMoney = f.read().alice.character!.gold, tenantMoney = f.read().bob.character!.gold;
  await bob.property({ type: 'leaseAccept', plot: own.id, revision: tenantPlot.revision, requestId: 'accept-local-lease' }, false, state => state.plots.find(entry => entry.id === own.id)?.management?.lease?.active === true);
  assert.equal(f.read().alice.character!.gold, ownerMoney + 20); assert.equal(f.read().bob.character!.gold, tenantMoney - 20);
  assert.deepEqual(f.read().outsider.character!.inventory, outsiderBefore.character!.inventory);
});
