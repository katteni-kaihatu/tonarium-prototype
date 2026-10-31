import { get, set } from './store.ts';
import { connectWs } from './net/ws.ts';
import { isElectron } from './updateBridge.ts';
import { clearFantasyAccountPrivateState } from './world/fantasy-account-state.ts';

export type AccountKind = 'misskey' | 'guest' | 'dev';
export interface Account { id: string; kind: AccountKind; username: string | null; name: string }
export interface AuthInfo { account: Account | null; misskeyHost: string; devLogin: boolean }

/** 開発用の ?as=xxx。同じブラウザの Cookie は全タブで共有されるので、タブごとのセッションをヘッダーで送る */
const devAs = import.meta.env?.DEV ? new URLSearchParams(location.search).get('as') : null;
const DEV_KEY = `tonarium.devSession.${devAs}`;
let devSession: string | null = null;
if (devAs) {
  try { devSession = sessionStorage.getItem(DEV_KEY); } catch { /* ignore */ }
  const original = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (!devSession || url.origin !== location.origin) return original(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set('X-Tonarium-Session', devSession);
    return original(input, { ...init, headers });
  };
}

/** WebSocket には任意のヘッダーを付けられないので、開発用のセッションは URL で渡す */
export const wsSessionQuery = () => (devSession ? `?session=${encodeURIComponent(devSession)}` : '');

function rememberDevSession(token: string | undefined) {
  if (!devAs || !token) return;
  devSession = token;
  try { sessionStorage.setItem(DEV_KEY, token); } catch { /* ignore */ }
}

async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json() as Promise<T>;
}

export async function fetchAuth(): Promise<AuthInfo> {
  const r = await fetch('/auth/me', { cache: 'no-store' });
  return r.json() as Promise<AuthInfo>;
}

/** 起動時の確認と更新後の復元が同時に呼ぶことがあるので、2 回目は何もしない */
export function enter(account: Account) {
  if (get().joined) return;
  set({ ...clearFantasyAccountPrivateState([get().selfId, account.id]), selfId: account.id, selfName: account.name, selfGuest: account.kind === 'guest', selfUsername: account.kind === 'misskey' ? account.username : null, joined: true });
  // AD の進行は Tonarium のアカウントに紐付けて始める
  get().adBindTonarium(account.id, account.name);
  connectWs();
}

/** 起動時。ログイン済みならそのまま入る。開発用の ?as= なら、その名前でログインする */
export async function resume(): Promise<AuthInfo> {
  const info = await fetchAuth();
  // ?as= のタブは、まだ自分のセッションが無ければ Cookie の人ではなくその名前で入る
  if (info.account && !(devAs && !devSession)) enter(info.account);
  else if (devAs && info.devLogin) {
    const r = await post<{ account: Account; session: string }>('/auth/dev', { name: devAs });
    rememberDevSession(r.session);
    enter(r.account);
    return { ...info, account: r.account };
  }
  return info;
}

export async function loginGuest(name: string) {
  const r = await post<{ account: Account; session?: string }>('/auth/guest', { name });
  rememberDevSession(r.session);
  enter(r.account);
}

/** 更新の橋（tonariumUpdates）が無い古いデスクトップ版も、User-Agent でアプリと分かる */
export const isDesktopApp = (ua = navigator.userAgent) => isElectron() || /Electron\//.test(ua);

/**
 * Misskey でログインを始める。ブラウザはそのまま Misskey へ移り、戻ってきたら Cookie で入る。
 * Electron はほかのサイトへ移らず外のブラウザで開くので、終わるまでこちらから問い合わせる。
 * ブラウザでは移るだけなので null を返す
 */
export async function startMisskeyLogin(onWaiting: (code: string) => void): Promise<Account | null> {
  const { url, code } = await post<{ url: string; code: string }>('/auth/misskey/start');
  // アプリでブラウザと同じく移ろうとすると、外のブラウザに開かれるだけで、コードも出ず待ちもしない
  if (!isDesktopApp()) { location.assign(url); return null; }
  window.open(url);
  // 許可したブラウザでこのコードを入れてもらい、始めた本人だと確かめる（他人の許可で入れないように）
  onWaiting(code);
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    const r = await post<{ status: 'pending' | 'done' | 'expired'; account?: Account }>('/auth/misskey/poll');
    if (r.status === 'done' && r.account) return r.account;
    if (r.status === 'expired') throw new Error('login expired');
  }
}

export async function renameSelf(name: string) {
  const r = await post<{ account: Account }>('/auth/name', { name });
  set({ selfName: r.account.name });
  return r.account;
}

export async function logout() {
  set({ ...clearFantasyAccountPrivateState([get().selfId]), wsReady: false });
  await post('/auth/logout');
  if (devAs) { try { sessionStorage.removeItem(DEV_KEY); } catch { /* ignore */ } }
  location.reload();
}
