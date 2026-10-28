import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type http from 'node:http';
import { and, eq, isNull, lt } from 'drizzle-orm';
import { db } from './db/index.ts';
import { accounts, authSessions, loginPending } from './db/schema.ts';

export type AccountKind = 'misskey' | 'guest' | 'dev';
export interface Account { id: string; kind: AccountKind; username: string | null; name: string }

const SESSION_COOKIE = 'tonarium_session';
const PENDING_COOKIE = 'tonarium_login';
/** Misskey から最初に戻ってきたブラウザの印。確認コードはこのブラウザからしか受けない */
const CONFIRM_COOKIE = 'tonarium_confirm';
const DAY = 86_400_000;
const SESSION_TTL: Record<AccountKind, number> = { misskey: 90 * DAY, dev: 90 * DAY, guest: 365 * DAY };
const PENDING_TTL = 10 * 60_000;
/** 確認コードを間違えられる回数。超えたらそのログインは取り消す（総当たりさせない） */
const CODE_ATTEMPTS = 5;
/** 読み違えやすい 0/O・1/I を除いた文字で 8 文字 */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  let c = '';
  for (const x of randomBytes(8)) c += CODE_CHARS[x % CODE_CHARS.length];
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}
const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
/** 期限の延長で毎回 DB に書かないよう、残りがこれを切ったときだけ延ばす */
const EXTEND_BELOW = 30 * DAY;
/** Cookie 自体はブラウザの上限（400 日）まで持たせ、期限は DB の側で決める。使うたびに延ばす期限を Cookie にも合わせ直さずに済む */
const COOKIE_MAX_AGE = 400 * DAY;
/** ゲストを作れるのは 1 つの接続元から 10 分に 20 人まで（DB を際限なく増やさせない） */
const GUEST_RATE = { max: 20, windowMs: 10 * 60_000 };

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');

export function normalizeName(name: string) {
  return name.trim().slice(0, 24) || 'ゲスト';
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = Object.create(null);
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

/** 前段（Coolify）が付ける X-Forwarded-* を優先して、ブラウザから見た自分のオリジンを返す */
export function requestOrigin(req: http.IncomingMessage) {
  const proto = String(req.headers['x-forwarded-proto'] ?? 'http').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost').split(',')[0].trim();
  return /^[\w.:[\]-]+$/.test(host) ? `${proto === 'https' ? 'https' : 'http'}://${host}` : '';
}

function sameOrigin(req: http.IncomingMessage) {
  // fetch は同じオリジンでも Origin を付ける。付いていなければブラウザ以外なので、Cookie のセッションには使わせない
  const origin = req.headers.origin;
  return !!origin && origin === requestOrigin(req);
}

function cookie(req: http.IncomingMessage, name: string, value: string, maxAgeMs: number) {
  const secure = requestOrigin(req).startsWith('https:') ? '; Secure' : '';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure}`;
}

async function readText(req: http.IncomingMessage, max = 4096): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > max) return null;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJson(req: http.IncomingMessage, max = 4096): Promise<Record<string, unknown> | null> {
  try {
    const v = JSON.parse((await readText(req, max)) || '{}');
    return v && typeof v === 'object' ? v : null;
  } catch { return null; }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function json(res: http.ServerResponse, status: number, body: unknown, cookies: string[] = []) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (cookies.length) res.setHeader('Set-Cookie', cookies);
  res.end(JSON.stringify(body));
}

interface MisskeyUser { id: string; username: string; name: string | null }

export interface AuthOptions {
  /** ログインに使う Misskey のオリジン（例: https://misskey.resonite.love）。テストでは手元の偽物を指す */
  misskeyOrigin: string;
  /** 開発とテストだけ。名前だけでログイン扱いのアカウントを作れる */
  devLogin: boolean;
  /** 表示名が変わったら、つないでいる画面へ知らせる */
  onRenamed: (account: Account) => void;
  /** ゲストの作成数を数える接続元。前段のプロキシを信頼する設定（FANTASY_TRUSTED_PROXY_IPS）に合わせる */
  clientAddress?: (req: http.IncomingMessage) => string;
}

/** OAuth の client_id（アプリのトップページ。Misskey が読みに来て、redirect_uri の link を確かめる）と戻り先 */
const oauthClient = (origin: string) => ({ clientId: `${origin}/`, redirectUri: `${origin}/auth/misskey/callback` });
const pkceChallenge = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

/** 認可コードをトークンに替えて、許可した人を確かめる。トークンは本人確認にだけ使い、すぐ捨てる */
async function exchangeCode(misskey: string, origin: string, code: string, verifier: string): Promise<MisskeyUser | null> {
  const { clientId, redirectUri } = oauthClient(origin);
  const token = await fetch(`${misskey}/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10_000),
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: redirectUri, code_verifier: verifier }),
  });
  if (!token.ok) return null;
  const accessToken = (await token.json() as { access_token?: unknown }).access_token;
  if (typeof accessToken !== 'string') return null;
  const res = await fetch(`${misskey}/api/i`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: '{}', signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  const u = await res.json() as { id?: unknown; username?: unknown; name?: unknown };
  if (typeof u.id !== 'string' || typeof u.username !== 'string') return null;
  return { id: u.id, username: u.username, name: typeof u.name === 'string' ? u.name : null };
}

const toAccount = (r: typeof accounts.$inferSelect): Account => ({ id: r.id, kind: r.kind, username: r.username, name: r.displayName });

/**
 * ログインとゲスト。Cookie（HttpOnly）のセッションで本人を決める。
 * Misskey へのログインは OAuth 2.0（認可コード＋PKCE）。許可の結果（認可コード）は許可したブラウザへのリダイレクトにしか載らないので、
 * 始めた人が横から取ることはできない（MiAuth はセッション ID だけで結果が取れた）。トークンは本人確認のあと捨てる
 */
export class Auth {
  readonly misskeyHost: string;
  private readonly guestsBy = new Map<string, number[]>();
  constructor(private readonly o: AuthOptions) {
    this.misskeyHost = new URL(o.misskeyOrigin).host;
  }

  /**
   * リクエストの本人。セッションが無い・切れていれば null。
   * 開発時は X-Tonarium-Session（WebSocket は ?session=）を Cookie より先に読む。同じブラウザの別のタブで別人として入るため
   */
  async accountOf(req: http.IncomingMessage, query?: URLSearchParams): Promise<Account | null> {
    const dev = this.o.devLogin ? (req.headers['x-tonarium-session'] as string | undefined) ?? query?.get('session') ?? undefined : undefined;
    const token = dev ?? parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) return null;
    const rows = await db().select().from(authSessions).innerJoin(accounts, eq(authSessions.accountId, accounts.id))
      .where(eq(authSessions.tokenHash, hash(token))).limit(1);
    const row = rows[0];
    if (!row) return null;
    const now = Date.now();
    if (row.auth_sessions.expiresAt.getTime() <= now) return null;
    if (row.auth_sessions.expiresAt.getTime() - now < EXTEND_BELOW) {
      await db().update(authSessions).set({ expiresAt: new Date(now + SESSION_TTL[row.accounts.kind]) }).where(eq(authSessions.tokenHash, hash(token)));
    }
    return toAccount(row.accounts);
  }

  async touch(accountId: string) {
    await db().update(accounts).set({ lastSeenAt: new Date() }).where(eq(accounts.id, accountId));
  }

  async rename(account: Account, name: string): Promise<Account> {
    const next = normalizeName(name);
    await db().update(accounts).set({ displayName: next }).where(eq(accounts.id, account.id));
    const renamed = { ...account, name: next };
    this.o.onRenamed(renamed);
    return renamed;
  }

  /** 期限切れのセッションとログイン途中を消す */
  async sweep() {
    const now = new Date();
    for (const [ip, times] of this.guestsBy) if (times.every((t) => now.getTime() - t >= GUEST_RATE.windowMs)) this.guestsBy.delete(ip);
    await db().delete(authSessions).where(lt(authSessions.expiresAt, now));
    await db().delete(loginPending).where(lt(loginPending.expiresAt, now));
  }

  private async startSession(req: http.IncomingMessage, account: Account) {
    const token = newToken();
    const ttl = SESSION_TTL[account.kind];
    await db().insert(authSessions).values({ tokenHash: hash(token), accountId: account.id, expiresAt: new Date(Date.now() + ttl) });
    return { token, cookie: cookie(req, SESSION_COOKIE, token, COOKIE_MAX_AGE) };
  }

  /** 許可した人をアカウントに結び付ける。表示名は初回だけ Misskey の名前にし、その後は Tonarium で変えたものを残す */
  private async bindAccount(session: string, user: MisskeyUser): Promise<Account> {
    const [row] = await db().insert(accounts)
      .values({ kind: 'misskey', misskeyId: user.id, username: user.username, displayName: normalizeName(user.name || user.username) })
      .onConflictDoUpdate({ target: accounts.misskeyId, set: { username: user.username } })
      .returning();
    const account = toAccount(row);
    await db().update(loginPending).set({ accountId: account.id }).where(eq(loginPending.session, session));
    return account;
  }

  private async finishInBrowser(req: http.IncomingMessage, res: http.ServerResponse, session: string, account: Account) {
    const s = await this.startSession(req, account);
    await db().delete(loginPending).where(eq(loginPending.session, session));
    res.statusCode = 302;
    res.setHeader('Set-Cookie', [s.cookie, cookie(req, PENDING_COOKIE, '', 0)]);
    res.setHeader('Location', '/');
    res.end();
  }

  /** /auth/* を扱ったら true */
  async handle(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
    if (!url.pathname.startsWith('/auth/')) return false;
    const route = `${req.method} ${url.pathname}`;
    // コールバックは Misskey からのリダイレクトなので Origin が付かない。ほかは同じオリジンの fetch だけ受ける
    if (req.method === 'POST' && !sameOrigin(req)) { json(res, 403, { error: 'origin' }); return true; }
    try {
      switch (route) {
        case 'GET /auth/me': {
          const account = await this.accountOf(req, url.searchParams);
          json(res, 200, { account, misskeyHost: this.misskeyHost, devLogin: this.o.devLogin });
          return true;
        }
        case 'POST /auth/guest': {
          const body = await readJson(req);
          const name = normalizeName(typeof body?.name === 'string' ? body.name : '');
          // 同じ端末のゲストは同じアカウントのまま（アイコンとアバターを残すため）
          const current = await this.accountOf(req, url.searchParams);
          if (current?.kind === 'guest') {
            json(res, 200, { account: current.name === name ? current : await this.rename(current, name) });
            return true;
          }
          if (!this.allowGuest(req)) { json(res, 429, {}); return true; }
          const [row] = await db().insert(accounts).values({ kind: 'guest', displayName: name }).returning();
          const account = toAccount(row);
          const s = await this.startSession(req, account);
          json(res, 200, { account, session: this.o.devLogin ? s.token : undefined }, [s.cookie]);
          return true;
        }
        case 'POST /auth/dev': {
          if (!this.o.devLogin) { json(res, 404, {}); return true; }
          const body = await readJson(req);
          const name = normalizeName(typeof body?.name === 'string' ? body.name : '');
          const found = await db().select().from(accounts).where(and(eq(accounts.kind, 'dev'), eq(accounts.username, name))).limit(1);
          const row = found[0] ?? (await db().insert(accounts).values({ kind: 'dev', username: name, displayName: name }).returning())[0];
          const account = toAccount(row);
          // Cookie は付けない。付けると同じブラウザのほかのタブまでこの人になる
          const s = await this.startSession(req, account);
          json(res, 200, { account, session: s.token });
          return true;
        }
        case 'POST /auth/misskey/start': {
          const session = randomUUID();
          const poll = newToken();
          const verifier = newToken();
          // 確認コードは始めた画面にだけ返す。別のブラウザで許可したときに、始めた本人だと確かめるため
          const code = newCode();
          await db().insert(loginPending).values({ session, pollHash: hash(poll), codeHash: hash(normalizeCode(code)), verifier, expiresAt: new Date(Date.now() + PENDING_TTL) });
          const { clientId, redirectUri } = oauthClient(requestOrigin(req));
          const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, scope: 'read:account', state: session, code_challenge: pkceChallenge(verifier), code_challenge_method: 'S256' });
          json(res, 200, { url: `${this.o.misskeyOrigin}/oauth/authorize?${q}`, code }, [cookie(req, PENDING_COOKIE, poll, PENDING_TTL)]);
          return true;
        }
        case 'GET /auth/misskey/callback': {
          const session = url.searchParams.get('state') ?? '';
          const pending = await this.pendingBySession(session);
          if (!pending) { this.page(res, 400, 'ログインの手続きが見つからないか、期限が切れました。もう一度お試しください。', 'The sign-in request was not found or has expired. Please try again.', '로그인 요청을 찾을 수 없거나 만료되었습니다. 다시 시도해 주세요.'); return true; }
          const cookies = parseCookies(req.headers.cookie);
          if (pending.callbackHash) {
            // 開き直し（同じブラウザ）だけ受ける。認可コードは一度しか使えない
            const mine = cookies[CONFIRM_COOKIE] && hash(cookies[CONFIRM_COOKIE]) === pending.callbackHash;
            if (mine && pending.accountId) { this.page(res, 200, 'ログインしました。Tonarium のアプリに戻ってください。', 'Signed in. Please return to the Tonarium app.', '로그인했습니다. Tonarium 앱으로 돌아가 주세요.'); return true; }
            if (mine && pending.misskeyUser) { this.confirmPage(res, 200, session, pending.misskeyUser); return true; }
            this.page(res, 400, 'このログインはほかのブラウザで進んでいます。Tonarium からやり直してください。', 'This sign-in is in progress in another browser. Please start again from Tonarium.', '이 로그인은 다른 브라우저에서 진행 중입니다. Tonarium에서 다시 시작해 주세요.');
            return true;
          }
          const code = url.searchParams.get('code');
          const iss = url.searchParams.get('iss');
          // 拒否された・別のサーバーからの応答（iss が違う）は、そのログインを取り消す
          if (!code || (iss !== null && iss !== this.o.misskeyOrigin)) {
            await db().delete(loginPending).where(eq(loginPending.session, session));
            this.page(res, 400, 'Misskey で許可されませんでした。Tonarium からやり直してください。', 'Misskey did not grant access. Please start again from Tonarium.', 'Misskey에서 허용되지 않았습니다. Tonarium에서 다시 시작해 주세요.');
            return true;
          }
          const mark = newToken();
          const [claimed] = await db().update(loginPending).set({ callbackHash: hash(mark) })
            .where(and(eq(loginPending.session, session), isNull(loginPending.callbackHash))).returning({ session: loginPending.session });
          if (!claimed) { this.page(res, 400, 'このログインはほかのブラウザで進んでいます。Tonarium からやり直してください。', 'This sign-in is in progress in another browser. Please start again from Tonarium.', '이 로그인은 다른 브라우저에서 진행 중입니다. Tonarium에서 다시 시작해 주세요.'); return true; }
          const user = await exchangeCode(this.o.misskeyOrigin, requestOrigin(req), code, pending.verifier);
          if (!user) {
            await db().delete(loginPending).where(eq(loginPending.session, session));
            this.page(res, 400, 'Misskey で許可されませんでした。Tonarium からやり直してください。', 'Misskey did not grant access. Please start again from Tonarium.', 'Misskey에서 허용되지 않았습니다. Tonarium에서 다시 시작해 주세요.');
            return true;
          }
          // ログインを始めたブラウザ（待ち合わせの Cookie がある）で許可したなら、そのまま入れる
          const poll = cookies[PENDING_COOKIE];
          if (poll && hash(poll) === pending.pollHash) {
            await this.finishInBrowser(req, res, session, await this.bindAccount(session, user));
            return true;
          }
          // 別のブラウザ（Electron から始めた、または他人から送られた URL を開いた）。始めた画面のコードが、このブラウザで入るまで結び付けない
          await db().update(loginPending).set({ misskeyUser: user }).where(eq(loginPending.session, session));
          this.confirmPage(res, 200, session, user, false, [cookie(req, CONFIRM_COOKIE, mark, PENDING_TTL)]);
          return true;
        }
        case 'POST /auth/misskey/confirm': {
          const form = new URLSearchParams((await readText(req)) ?? '');
          const session = form.get('session') ?? '';
          const pending = await this.pendingBySession(session);
          const user = pending?.misskeyUser;
          const mark = parseCookies(req.headers.cookie)[CONFIRM_COOKIE];
          // Misskey から戻ってきたブラウザだけが確認できる。始めた側がコードを知っていても、ここは通れない
          if (!pending || !user || pending.accountId || !pending.callbackHash || !mark || hash(mark) !== pending.callbackHash) { this.page(res, 400, 'ログインの手続きが見つからないか、期限が切れました。もう一度お試しください。', 'The sign-in request was not found or has expired. Please try again.', '로그인 요청을 찾을 수 없거나 만료되었습니다. 다시 시도해 주세요.'); return true; }
          if (hash(normalizeCode(form.get('code') ?? '')) !== pending.codeHash) {
            const attempts = pending.codeAttempts + 1;
            if (attempts >= CODE_ATTEMPTS) {
              await db().delete(loginPending).where(eq(loginPending.session, session));
              this.page(res, 400, 'コードを何度も間違えたため、このログインは取り消しました。Tonarium からやり直してください。', 'Too many wrong codes. This sign-in was cancelled; please start again from Tonarium.', '코드를 여러 번 잘못 입력해 이 로그인을 취소했습니다. Tonarium에서 다시 시작해 주세요.');
              return true;
            }
            await db().update(loginPending).set({ codeAttempts: attempts }).where(eq(loginPending.session, session));
            this.confirmPage(res, 400, session, user, true);
            return true;
          }
          await this.bindAccount(session, user);
          this.page(res, 200, 'ログインしました。Tonarium のアプリに戻ってください。', 'Signed in. Please return to the Tonarium app.', '로그인했습니다. Tonarium 앱으로 돌아가 주세요.', '', [cookie(req, CONFIRM_COOKIE, '', 0)]);
          return true;
        }
        case 'POST /auth/misskey/poll': {
          const poll = parseCookies(req.headers.cookie)[PENDING_COOKIE];
          const pending = poll ? (await db().select().from(loginPending).where(eq(loginPending.pollHash, hash(poll))).limit(1))[0] : undefined;
          if (!pending || pending.expiresAt.getTime() <= Date.now()) { json(res, 200, { status: 'expired' }, [cookie(req, PENDING_COOKIE, '', 0)]); return true; }
          // 結び付くのは、許可したブラウザで確認コードが入力されてから。ここから Misskey に問い合わせて結び付けはしない
          const account = pending.accountId ? await this.accountById(pending.accountId) : null;
          if (!account) { json(res, 200, { status: 'pending' }); return true; }
          const s = await this.startSession(req, account);
          await db().delete(loginPending).where(eq(loginPending.session, pending.session));
          json(res, 200, { status: 'done', account }, [s.cookie, cookie(req, PENDING_COOKIE, '', 0)]);
          return true;
        }
        case 'POST /auth/name': {
          const account = await this.accountOf(req, url.searchParams);
          if (!account) { json(res, 401, {}); return true; }
          const body = await readJson(req);
          if (typeof body?.name !== 'string') { json(res, 400, {}); return true; }
          json(res, 200, { account: await this.rename(account, body.name) });
          return true;
        }
        case 'POST /auth/logout': {
          const token = parseCookies(req.headers.cookie)[SESSION_COOKIE] ?? (this.o.devLogin ? req.headers['x-tonarium-session'] as string | undefined : undefined);
          if (token) await db().delete(authSessions).where(eq(authSessions.tokenHash, hash(token)));
          json(res, 200, {}, [cookie(req, SESSION_COOKIE, '', 0)]);
          return true;
        }
      }
      json(res, 404, {});
      return true;
    } catch (e) {
      console.error('auth', route, e);
      json(res, 500, {});
      return true;
    }
  }

  private allowGuest(req: http.IncomingMessage) {
    const ip = this.o.clientAddress?.(req) ?? req.socket.remoteAddress ?? '';
    const now = Date.now();
    const recent = (this.guestsBy.get(ip) ?? []).filter((t) => now - t < GUEST_RATE.windowMs);
    if (recent.length >= GUEST_RATE.max) return false;
    recent.push(now);
    this.guestsBy.set(ip, recent);
    return true;
  }

  private async pendingBySession(session: string) {
    if (!/^[0-9a-f-]{36}$/.test(session)) return null;
    const row = (await db().select().from(loginPending).where(eq(loginPending.session, session)).limit(1))[0];
    return row && row.expiresAt.getTime() > Date.now() ? row : null;
  }

  private async accountById(id: string) {
    const row = (await db().select().from(accounts).where(eq(accounts.id, id)).limit(1))[0];
    return row ? toAccount(row) : null;
  }

  /** Misskey から戻ってきたときの小さな案内ページ。画面の言語が分からないので 3 言語とも出す */
  private page(res: http.ServerResponse, status: number, ja: string, en: string, ko: string, form = '', cookies: string[] = []) {
    res.statusCode = status;
    if (cookies.length) res.setHeader('Set-Cookie', cookies);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    // 確認ページをほかのサイトに埋め込ませない（押させる操作をだまし取らせない）
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    res.end(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Tonarium</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#EAE5DB;color:#26262E;font-family:sans-serif;text-align:center;padding:16px;box-sizing:border-box}div{max-width:480px}p{line-height:1.7}a{color:#2F5FC4}.warn{color:#B4342C;font-size:13px}input{font-size:22px;letter-spacing:4px;text-align:center;width:10em;padding:8px;border:1px solid #bbb;border-radius:8px}button{padding:10px 28px;border:0;border-radius:10px;background:#2F5FC4;color:#fff;font-size:15px}</style></head>
<body><div><img src="/brand/mark.png" alt="" width="56" height="56"><p>${esc(ja)}<br>${esc(en)}<br>${esc(ko)}</p>${form}<p><a href="/">Tonarium</a></p></div></body></html>`);
  }

  /** 別のブラウザで許可したとき。だれのアカウントで入るかを見せ、始めた画面に出ているコードを入れてもらう */
  private confirmPage(res: http.ServerResponse, status: number, session: string, user: MisskeyUser, wrong = false, cookies: string[] = []) {
    const who = `${user.name ? `${user.name} ` : ''}@${user.username}`;
    const form = `<form method="post" action="/auth/misskey/confirm"><input type="hidden" name="session" value="${esc(session)}">
<p><input name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" placeholder="XXXX-XXXX" required autofocus aria-label="code"></p>
${wrong ? '<p class="warn">コードが違います / The code is wrong / 코드가 다릅니다</p>' : ''}
<p class="warn">自分で Tonarium からログインを始めたときに表示されたコードだけを入力してください。他人から伝えられたコードは入力しないでください。<br>Only enter a code that your own Tonarium screen showed when you started signing in. Never enter a code someone else gave you.<br>직접 Tonarium에서 로그인을 시작했을 때 표시된 코드만 입력하세요. 다른 사람이 알려 준 코드는 입력하지 마세요.</p>
<p><button>OK</button></p></form>`;
    this.page(res, status, `${who} として Tonarium にログインします。Tonarium の画面に表示されているコードを入力してください。`, `You are signing in to Tonarium as ${who}. Enter the code shown on your Tonarium screen.`, `${who}(으)로 Tonarium에 로그인합니다. Tonarium 화면에 표시된 코드를 입력하세요.`, form, cookies);
  }
}
