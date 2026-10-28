import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { testServerEnv } from './test-db.ts';
import { WebSocket } from 'ws';
import { COMPAT_VERSION, type ServerMsg, type User } from '../shared/protocol.ts';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until<T>(read: () => T | undefined): Promise<T> {
  const end = Date.now() + 10_000;
  while (Date.now() < end) {
    const value = read();
    if (value !== undefined) return value;
    await delay(25);
  }
  throw new Error('Timed out');
}
async function freePort() {
  const listener = net.createServer();
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const port = (listener.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  return port;
}
const cookieOf = (res: Response, name: string) => res.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith(`${name}=`));

test('guests, dev and Misskey logins decide who you are and what you may do', { timeout: 60_000 }, async (t) => {
  // 偽の Misskey（OAuth 2.0）。approve() が許可画面での「許可」に当たり、認可コードを返す（本物では許可したブラウザへのリダイレクトにだけ載る）
  const codes = new Map<string, { challenge: string; clientId: string; redirectUri: string }>();
  const approve = (authorizeUrl: string) => {
    const q = new URL(authorizeUrl).searchParams;
    assert.deepEqual([q.get('response_type'), q.get('scope'), q.get('code_challenge_method')], ['code', 'read:account', 'S256']);
    const code = randomUUID();
    codes.set(code, { challenge: q.get('code_challenge')!, clientId: q.get('client_id')!, redirectUri: q.get('redirect_uri')! });
    return { code, state: q.get('state')! };
  };
  const misskey = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/oauth/token') {
      const f = new URLSearchParams(body);
      const grant = codes.get(f.get('code') ?? '');
      codes.delete(f.get('code') ?? '');
      const ok = grant && f.get('grant_type') === 'authorization_code' && f.get('client_id') === grant.clientId && f.get('redirect_uri') === grant.redirectUri
        && createHash('sha256').update(f.get('code_verifier') ?? '').digest('base64url') === grant.challenge;
      res.statusCode = ok ? 200 : 400;
      res.end(JSON.stringify(ok ? { access_token: 'token-alice', token_type: 'bearer', scope: 'read:account' } : { error: 'invalid_grant' }));
      return;
    }
    if (req.url === '/api/i' && req.headers.authorization === 'Bearer token-alice') { res.end(JSON.stringify({ id: 'mk-1', username: 'alice', name: 'Alice M' })); return; }
    res.statusCode = 401;
    res.end('{}');
  });
  const misskeyPort = await freePort();
  await new Promise<void>((resolve) => misskey.listen(misskeyPort, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => misskey.close(() => resolve())));

  const dbEnv = await testServerEnv(t);
  const data = await mkdtemp(path.join(os.tmpdir(), 'tonarium-auth-'));
  t.after(() => rm(data, { recursive: true, force: true }));
  await writeFile(path.join(data, 'sessions.json'), JSON.stringify({ name: 'Test', sessions: [{ id: 'room', name: 'Room' }] }));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: { ...process.env, ...dbEnv, MISSKEY_URL: `http://127.0.0.1:${misskeyPort}`, SERVER_PORT: String(port), DATA_DIR: data, SESSIONS_FILE: path.join(data, 'sessions.json'), LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let ready = false;
  child.stdout.on('data', (chunk: Buffer) => { if (chunk.toString().includes('server on http://')) ready = true; });
  child.stderr.resume();
  t.after(async () => {
    if (child.exitCode !== null) return;
    await new Promise<void>((resolve) => { child.once('exit', () => resolve()); child.kill(); });
  });
  await until(() => ready ? true : undefined);

  const post = (p: string, body: unknown, cookie?: string, origin: string | null = base) => fetch(`${base}${p}`, {
    method: 'POST', redirect: 'manual', body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}) },
  });
  async function connect(cookie: string) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Cookie: cookie } });
    t.after(() => ws.terminate());
    const messages: ServerMsg[] = [];
    ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
    await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    ws.send(JSON.stringify({ t: 'hello', compat: COMPAT_VERSION }));
    await until(() => messages.find((m) => m.t === 'snapshot'));
    return { ws, messages, send: (m: unknown) => ws.send(JSON.stringify(m)), users: () => [...messages].reverse().find((m) => m.t === 'users' || m.t === 'snapshot') };
  }
  const usersOf = (msg: ServerMsg | undefined): User[] => (msg?.t === 'users' ? msg.list : msg?.t === 'snapshot' ? msg.s.users : []);

  // セッションが無い接続は hello で断る。ログイン導入前の古い画面（版が古い）には再読み込みを促す
  async function anonymous(compat: number) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const messages: ServerMsg[] = [];
    ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
    await new Promise<void>((resolve) => ws.once('open', resolve));
    const closed = new Promise<number>((resolve) => ws.once('close', (code) => resolve(code)));
    ws.send(JSON.stringify({ t: 'hello', compat }));
    return { code: await closed, messages };
  }
  const old = await anonymous(COMPAT_VERSION - 1);
  assert.equal(old.messages[0]?.t, 'incompatible');
  const current = await anonymous(COMPAT_VERSION);
  assert.equal(current.code, 4401);
  assert.equal(current.messages.length, 0);
  // 他サイトからの POST（Origin 違い・無し）は受けない
  assert.equal((await post('/auth/guest', { name: 'x' }, undefined, 'https://evil.example')).status, 403);
  assert.equal((await post('/auth/guest', { name: 'x' }, undefined, null)).status, 403);

  // ゲスト。同じ名前の開発用アカウントとは別人になる
  const guestRes = await post('/auth/guest', { name: 'Sam' });
  const guestCookie = cookieOf(guestRes, 'tonarium_session')!;
  const guestAccount = (await guestRes.json() as { account: { id: string; kind: string } }).account;
  assert.equal(guestAccount.kind, 'guest');
  // 開発用ログインは Cookie を付けない（同じブラウザのほかのタブを巻き込まない）。セッションは本文で受け取る
  const devRes = await post('/auth/dev', { name: 'Sam' });
  assert.equal(cookieOf(devRes, 'tonarium_session'), undefined);
  const devBody = await devRes.json() as { account: { id: string }; session: string };
  const devAccount = devBody.account;
  const devCookie = `tonarium_session=${devBody.session}`;
  assert.notEqual(devAccount.id, guestAccount.id);
  // 同じ端末でもう一度ゲストで入ると、同じアカウントのまま名前だけ変わる
  const again = await (await post('/auth/guest', { name: 'Sammy' }, guestCookie)).json() as { account: { id: string; name: string } };
  assert.deepEqual([again.account.id, again.account.name], [guestAccount.id, 'Sammy']);

  const guest = await connect(guestCookie);
  const dev = await connect(devCookie);
  const seen = await until(() => { const list = usersOf(dev.users()); return list.length === 2 ? list : undefined; });
  assert.deepEqual(seen.map((u) => [u.id, u.guest]).sort(), [[devAccount.id, false], [guestAccount.id, true]].sort());

  // ゲストは人に残る操作ができない
  guest.send({ t: 'postCreate', text: 'hi', withPlace: false });
  await until(() => guest.messages.find((m) => m.t === 'loginRequired'));
  assert.equal((await fetch(`${base}/profile`, { method: 'POST', body: JSON.stringify({ bio: 'x' }), headers: { Cookie: guestCookie } })).status, 403);
  // アイコンは残せる（自分の分だけ。URL の名前は使わない）
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  assert.equal((await fetch(`${base}/icon?id=${devAccount.id}`, { method: 'POST', body: jpeg, headers: { Cookie: guestCookie } })).status, 200);
  assert.equal((await fetch(`${base}/icon?id=${guestAccount.id}`)).status, 200);
  assert.equal((await fetch(`${base}/icon?id=${devAccount.id}`)).status, 404);
  assert.equal((await fetch(`${base}/icon`, { method: 'POST', body: jpeg })).status, 401);

  // 表示名を変えると、つないでいる全員に新しい名前が届く
  assert.equal((await post('/auth/name', { name: 'Samuel' }, devCookie)).status, 200);
  await until(() => usersOf(guest.users()).find((u) => u.id === devAccount.id && u.name === 'Samuel'));

  const confirm = (session: string, code: string, cookie?: string) => fetch(`${base}/auth/misskey/confirm`, {
    method: 'POST', redirect: 'manual', body: new URLSearchParams({ session, code }).toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: base, ...(cookie ? { Cookie: cookie } : {}) },
  });
  const pollStatus = async (cookie: string) => (await (await post('/auth/misskey/poll', {}, cookie)).json() as { status: string }).status;
  const startLogin = async () => {
    const res = await post('/auth/misskey/start', {});
    const started = await res.json() as { url: string; code: string };
    return { pending: cookieOf(res, 'tonarium_login')!, url: started.url, code: started.code, session: new URL(started.url).searchParams.get('state')! };
  };
  const callback = (query: Record<string, string>, cookie?: string) => fetch(`${base}/auth/misskey/callback?${new URLSearchParams(query)}`, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });

  // Misskey（同じブラウザ）: 許可して戻ってきたブラウザが始めた端末なら、そのまま入る
  const own = await startLogin();
  const authorize = new URL(own.url);
  assert.equal(`${authorize.origin}${authorize.pathname}`, `http://127.0.0.1:${misskeyPort}/oauth/authorize`);
  assert.equal(authorize.searchParams.get('client_id'), `${base}/`);
  assert.equal(authorize.searchParams.get('redirect_uri'), `${base}/auth/misskey/callback`);
  const back = await callback(approve(own.url), own.pending);
  assert.equal(back.status, 302);
  const mkCookie = cookieOf(back, 'tonarium_session')!;
  const me = await (await fetch(`${base}/auth/me`, { headers: { Cookie: mkCookie } })).json() as { account: { kind: string; username: string; name: string } };
  assert.deepEqual([me.account.kind, me.account.username, me.account.name], ['misskey', 'alice', 'Alice M']);

  // 拒否されたら、そのログインは取り消す
  const denied = await startLogin();
  assert.equal((await callback({ state: denied.session, error: 'access_denied' }, denied.pending)).status, 400);
  assert.equal(await pollStatus(denied.pending), 'expired');

  // 他人に許可 URL を送っても、始めた側は入れない。認可コードは許可したブラウザにしか届かず、確認コードはそのブラウザでしか受けない
  const attack = await startLogin();
  const victim = await callback(approve(attack.url));
  assert.equal(victim.status, 200, 'the approving browser only gets the code confirmation page');
  assert.match(await victim.text(), /@alice/);
  assert.equal(cookieOf(victim, 'tonarium_session'), undefined);
  const victimMark = cookieOf(victim, 'tonarium_confirm')!;
  assert.ok(victimMark);
  assert.equal((await confirm(attack.session, attack.code)).status, 400, 'the starter cannot confirm with its own code');
  assert.equal((await confirm(attack.session, attack.code, attack.pending)).status, 400);
  assert.equal(await pollStatus(attack.pending), 'pending', 'the starter still has no session');
  assert.equal((await callback({ state: attack.session, code: 'guessed' }, attack.pending)).status, 400, 'a later callback from the starter is refused');
  assert.equal(await pollStatus(attack.pending), 'pending');
  assert.equal((await callback({ state: attack.session }, victimMark)).status, 200, 'the approving browser can reopen its page');
  // 許可したブラウザでも、コードを何度も間違えると取り消す
  for (let i = 0; i < 4; i++) assert.equal((await confirm(attack.session, 'AAAA-AAAA', victimMark)).status, 400);
  assert.equal(await pollStatus(attack.pending), 'pending');
  assert.equal((await confirm(attack.session, 'AAAA-AAAA', victimMark)).status, 400);
  assert.equal(await pollStatus(attack.pending), 'expired', 'too many wrong codes cancel the sign-in');
  // 始めた側が認可コードを持たずに先回りしても入れず、そのログインは消える
  const race = await startLogin();
  assert.equal((await callback({ state: race.session, code: 'not-issued' }, race.pending)).status, 400);
  assert.equal(await pollStatus(race.pending), 'expired');
  // 確認はほかのサイトからは送れない
  assert.equal((await fetch(`${base}/auth/misskey/confirm`, { method: 'POST', body: 'session=x&code=y', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://evil.example' } })).status, 403);

  // Misskey（Electron）: 許可したブラウザで始めた画面のコードを入れると、待っている端末が poll で受け取る。同じ Misskey の人は同じアカウント
  const app = await startLogin();
  assert.match(app.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(await pollStatus(app.pending), 'pending');
  const browser = await callback(approve(app.url));
  assert.equal(browser.status, 200);
  assert.equal(await pollStatus(app.pending), 'pending');
  assert.equal((await confirm(app.session, app.code.toLowerCase().replace('-', ' '), cookieOf(browser, 'tonarium_confirm'))).status, 200, 'case and separators do not matter');
  const done = await post('/auth/misskey/poll', {}, app.pending);
  const polled = await done.json() as { status: string; account: { username: string } };
  assert.equal(polled.status, 'done');
  assert.ok(cookieOf(done, 'tonarium_session'));
  const me2 = await (await fetch(`${base}/auth/me`, { headers: { Cookie: cookieOf(done, 'tonarium_session')! } })).json() as { account: { username: string } };
  assert.equal(me2.account.username, 'alice');

  // Cookie はブラウザの上限まで持たせ、期限は DB で決める（使うたびに延びる期限に Cookie を合わせ直さないため）
  assert.match(back.headers.getSetCookie().find((c) => c.startsWith('tonarium_session='))!, /Max-Age=34560000; .*HttpOnly|HttpOnly; .*Max-Age=34560000/);
  // 1 つの接続元から作れるゲストには上限がある（ここまでに 1 人作っている）
  const statuses: number[] = [];
  for (let i = 0; i < 20; i++) statuses.push((await post('/auth/guest', { name: `g${i}` })).status);
  assert.deepEqual([statuses.slice(0, 19).every((x) => x === 200), statuses[19]], [true, 429]);
  // 信頼するプロキシを通っていない X-Forwarded-For は見ない（書き換えて上限を避けられない）
  assert.equal((await fetch(`${base}/auth/guest`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Forwarded-For': '203.0.113.9' }, body: JSON.stringify({ name: 'spoof' }) })).status, 429);

  // ログアウトすると、そのセッションではもう入れない
  await post('/auth/logout', {}, mkCookie);
  assert.equal((await (await fetch(`${base}/auth/me`, { headers: { Cookie: mkCookie } })).json() as { account: unknown }).account, null);
});
