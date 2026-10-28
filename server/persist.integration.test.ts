import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, readdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { testServerEnv } from './test-db.ts';
import { devLogin } from './test-auth.ts';
import { WebSocket } from 'ws';
import { COMPAT_VERSION, dmKey, type ServerMsg } from '../shared/protocol.ts';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until<T>(read: () => T | undefined | false | Promise<T | undefined | false>, timeout = 10_000): Promise<T> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await read();
    if (value !== undefined && value !== false) return value;
    await delay(25);
  }
  throw new Error('Timed out');
}

test('people, home and the rest of the data survive a server restart from the database', { timeout: 90_000 }, async (t) => {
  const dbEnv = await testServerEnv(t);
  const data = await mkdtemp(path.join(os.tmpdir(), 'tonarium-persist-'));
  t.after(() => rm(data, { recursive: true, force: true }));
  await writeFile(path.join(data, 'sessions.json'), JSON.stringify({ name: 'Test', sessions: [{ id: 'fixed', name: 'Fixed' }] }));
  // ディスクに置いていた頃の画像と動画は、起動時に消える
  await mkdir(path.join(data, 'media'), { recursive: true });
  await writeFile(path.join(data, 'media', '00000000-0000-0000-0000-000000000000.mp4'), 'old');
  const listener = net.createServer();
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const port = (listener.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  let child: ChildProcess | undefined;
  const sockets: WebSocket[] = [];
  async function stop() {
    sockets.splice(0).forEach((s) => s.terminate());
    if (!child || child.exitCode !== null || child.signalCode) return;
    const exited = new Promise<void>((resolve) => child!.once('exit', () => resolve()));
    child.kill();
    await exited;
  }
  t.after(stop);
  async function start() {
    child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
      env: { ...process.env, ...dbEnv, SERVER_PORT: String(port), DATA_DIR: data, SESSIONS_FILE: path.join(data, 'sessions.json'), LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '', MEDIA_TOTAL_MAX_BYTES: '20', MEDIA_RATE_FILES: '2' },
      stdio: 'ignore',
    });
    const end = Date.now() + 30_000;
    while (Date.now() < end) {
      if (await fetch(`${base}/healthz`).then((r) => r.ok).catch(() => false)) return;
      await delay(50);
    }
    throw new Error('Test server did not start');
  }
  async function peer(name: string) {
    const login = await devLogin(base, name);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: login.headers });
    sockets.push(ws);
    const messages: ServerMsg[] = [];
    ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
    await new Promise<void>((resolve) => ws.once('open', resolve));
    ws.send(JSON.stringify({ t: 'hello', compat: COMPAT_VERSION }));
    await until(() => messages.some((m) => m.t === 'inbox'));
    const last = <K extends ServerMsg['t']>(k: K) => [...messages].reverse().find((m) => m.t === k) as Extract<ServerMsg, { t: K }> | undefined;
    return { ...login, messages, last, send: (m: unknown) => ws.send(JSON.stringify(m)) };
  }

  await start();
  const a = await peer('Ann'), b = await peer('Ben');
  a.send({ t: 'followUser', to: b.id, on: true });
  b.send({ t: 'followUser', to: a.id, on: true });
  await until(() => a.last('friends')?.ids.includes(b.id));
  const conv = dmKey(a.id, b.id);
  a.send({ t: 'msg', conv, text: 'hello' });
  const msg = await until(() => b.messages.find((m) => m.t === 'msg' && m.conv === conv));
  b.send({ t: 'read', conv, at: msg.t === 'msg' ? msg.m.at : 0 });
  a.send({ t: 'setStatus', status: 'busy', text: 'working' });
  b.send({ t: 'watch', to: a.id, on: true });
  a.send({ t: 'groupCreate', name: 'Club', color: '#2F5FC4' });
  const group = await until(() => b.last('groups')?.list.find((g) => g.name === 'Club'));
  b.send({ t: 'groupJoin', id: group.id });
  a.send({ t: 'eventCreate', title: 'Party', at: Date.now() + 86_400_000, group: group.id, session: null });
  a.send({ t: 'sessionCreate', name: 'Room', topic: 't', world: 'room', visibility: 'friends' });
  await until(() => b.last('events')?.list.some((e) => e.title === 'Party'));
  await until(() => b.last('sessions')?.list.some((s) => s.name === 'Room'));
  a.send({ t: 'leave' });
  assert.equal((await fetch(`${base}/profile`, { method: 'POST', body: JSON.stringify({ bio: 'hi there' }), headers: a.headers })).status, 200);
  a.send({ t: 'postCreate', text: 'first post', withPlace: false });
  const post = (await until(() => b.messages.find((m) => m.t === 'post' && m.p.text === 'first post')) as Extract<ServerMsg, { t: 'post' }>).p;
  b.send({ t: 'postReact', id: post.id, emoji: '👍', on: true });
  await until(() => b.messages.some((m) => m.t === 'post' && m.p.id === post.id && m.p.reactions['👍']?.length));
  b.send({ t: 'marketLike', product: 'bike' });
  await until(() => b.last('marketLikes')?.liked.includes('bike'));
  const post2 = (url: string, body: unknown, headers: Record<string, string>) => fetch(`${base}${url}`, { method: 'POST', body: JSON.stringify(body), headers: { ...headers, 'Content-Type': 'application/json' } });
  assert.equal((await post2('/report', { target: b.id, reason: 'test' }, a.headers)).status, 200);
  const guest = await fetch(`${base}/auth/guest`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ name: 'Gus' }) });
  const guestHeaders = { Cookie: (guest.headers.get('set-cookie') ?? '').split(';')[0] };
  // 画像はストレージ（S3 の設定が無いテストでは DATA_DIR/objects）に置き、URL は転送で読ませる
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const upload = (url: string, body: Buffer, headers: Record<string, string>) => fetch(`${base}${url}`, { method: 'POST', body: new Uint8Array(body), headers });
  assert.equal((await upload('/icon', jpeg, a.headers)).status, 200);
  const icon = ((await (await upload('/icon', jpeg, a.headers)).json()) as { icon: string }).icon;
  assert.equal((await upload('/avatar', png, guestHeaders)).status, 200, 'guests keep their avatar');
  assert.equal((await post2('/avatar/params', { eyeHeight: 1.5 }, guestHeaders)).status, 200);
  const media = ((await (await upload('/media', png, a.headers)).json()) as { url: string }).url;
  const guestId = ((await guest.json()) as { account: { id: string } }).account.id;
  // 遅らせてまとめる書き込み（800 ms）が終わるのを待つ。強制終了でも、書き終えた分は DB に残る
  await delay(2000);
  await stop();

  // 再起動しても DB から戻る
  await start();
  const b2 = await peer('Ben');
  const snap = b2.last('snapshot')!;
  assert.ok(snap.s.friends.includes(a.id));
  const inbox = b2.last('inbox')!;
  assert.equal(inbox.convs[conv]?.[0]?.text, 'hello');
  assert.ok(inbox.reads[conv] > 0, 'read marker is kept');
  assert.ok(inbox.watching.includes(a.id), 'watch request is kept');
  const ann = inbox.people.find((p) => p.id === a.id);
  assert.deepEqual([ann?.status, ann?.statusText], ['busy', 'working']);
  assert.ok(snap.s.groups.some((g) => g.name === 'Club' && g.members.includes(b.id) && g.owner === a.id));
  assert.ok(snap.s.events.some((e) => e.title === 'Party' && e.attendees.includes(a.id)));
  // 作ったセッションは空のまま 5 分たつと消えるが、再起動の直後はまだ残っている
  assert.ok(snap.s.guild.sessions.some((s) => s.name === 'Room' && s.owner === a.id));
  assert.equal(((await (await fetch(`${base}/profile?id=${a.id}`)).json()) as { bio: string }).bio, 'hi there');
  const saved = b2.last('posts')!.list.find((p) => p.id === post.id);
  assert.deepEqual(saved?.reactions['👍'], [b.id]);
  assert.ok(b2.last('marketLikes')!.liked.includes('bike'));
  const redirect = await fetch(`${base}/icon?id=${a.id}&v=${icon}`, { redirect: 'manual' });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), `/objects/icons/${a.id}/${icon}.jpg`);
  assert.deepEqual(Buffer.from(await (await fetch(`${base}/icon?id=${a.id}`)).arrayBuffer()), jpeg);
  assert.deepEqual(await readdir(path.join(data, 'objects', 'icons', a.id)), [`${icon}.jpg`], 'the replaced icon is removed');
  assert.deepEqual(Buffer.from(await (await fetch(`${base}/avatar?id=${guestId}`)).arrayBuffer()), png);
  assert.equal((await fetch(`${base}/avatar/params?id=${guestId}`)).status, 200);
  assert.deepEqual(Buffer.from(await (await fetch(`${base}${media}`)).arrayBuffer()), png);
  // 添付画像は合計の上限（テストでは 20 バイト）を超えると古いものから消える。再起動前の分も DB から数える
  // 1 人が送れる数には上限がある（テストでは 1 時間に 2 枚）。同時に送っても上限を超えて通らない
  const sent = await Promise.all([0, 1, 2].map(() => upload('/media', png, a.headers)));
  assert.deepEqual(sent.map((r) => r.status).sort(), [200, 200, 429]);
  const later = await Promise.all(sent.filter((r) => r.status === 200).map(async (r) => ((await r.json()) as { url: string }).url));
  await until(async () => (await fetch(`${base}${media}`)).status === 404 ? true : undefined);
  for (const url of later) assert.equal((await fetch(`${base}${url}`)).status, 200);
  assert.equal((await upload('/media', png, a.headers)).status, 429);
  // ゲストは送れない
  const guestAgain = await fetch(`${base}/auth/guest`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ name: 'Gia' }) });
  assert.equal((await upload('/media', png, { Cookie: (guestAgain.headers.get('set-cookie') ?? '').split(';')[0] })).status, 403);
  // DB に移したデータは JSON に書かない
  const files = await readdir(data);
  assert.ok(!files.includes('media'), 'old local media is removed');
  for (const f of ['home.json', 'people.json', 'messages.json', 'follows.json', 'timeline.json', 'items.json', 'market-likes.json', 'reports.log']) assert.ok(!files.includes(f), f);
});
