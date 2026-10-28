/** テスト用に開発用ログイン（AUTH_DEV_LOGIN=1）で入り、WebSocket と fetch に付ける Cookie を返す */
export async function devLogin(base: string, name: string) {
  const r = await fetch(`${base}/auth/dev`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ name }) });
  if (!r.ok) throw new Error(`dev login failed: ${r.status}`);
  const { account, session } = await r.json() as { account: { id: string }; session: string };
  return { id: account.id, headers: { Cookie: `tonarium_session=${session}` } };
}
