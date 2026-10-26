import { t as tr } from '../i18n/index.ts';
import { useEffect, useState } from 'react';
import { useStore } from '../store.ts';
import { isElectron } from '../updateBridge.ts';
import { UpdateCountdown, readUpdatePreferences } from '../updateFlow.ts';
import { applyUpdate } from '../updateRecovery.ts';

async function reloadWithRecovery() {
  await applyUpdate(() => location.reload());
}

/** つなぎ直した先で画面の版が変わっていたら、更新を促す。「あとで」はその版のあいだだけ隠す */
export function UpdateBanner() {
  const version = useStore((s) => s.updateVersion);
  const [flow] = useState(() => new UpdateCountdown());
  const [, render] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const apply = async () => {
    if (busy) return;
    setBusy(true); flow.cancel();
    try { await reloadWithRecovery(); }
    catch (error) { setError(String(error)); setBusy(false); }
  };
  useEffect(() => {
    flow.detect(version, readUpdatePreferences(localStorage, isElectron()), Date.now());
    render(n => n + 1);
  }, [version, flow]);
  useEffect(() => {
    if (!version) return;
    const timer = setInterval(() => {
      if (flow.remaining(Date.now()) === 0 && !busy) void apply();
      render(n => n + 1);
    }, 200);
    return () => clearInterval(timer);
  }, [flow, busy, version]);
  if (!version) return null;
  const remaining = flow.remaining(Date.now());
  return (
    <div className="updatebar" role="status">
      <span><b>{tr("ui682")}</b>{remaining !== null && <span className="sub">{tr('updateCountdown', remaining)}</span>}{error && <span role="alert">{error}</span>}</span>
      <button className="updatego" disabled={busy} onClick={() => void apply()}>{tr('updateNow')}</button>
      <button className="ib updatelater" disabled={busy || remaining === null} onClick={() => { flow.cancel(); render(n => n + 1); }}>{tr('updateCancel')}</button>
    </div>
  );
}

/** 互換性バージョンがサーバーと違うと通信の約束事が食い違うので、更新するまで全面で止める */
export function CompatOverlay() {
  const [error, setError] = useState('');
  return (
    <div className="maintenance" role="alert">
      <div className="maintcard">
        <img src="/brand/mark.png" alt="" />
        <h2>{tr("ui686")}</h2>
        <p>{tr("ui687")}</p>
        <button className="updatego" onClick={() => void reloadWithRecovery().catch(error => setError(String(error)))}>{tr("ui688")}</button>
        {error && <p role="alert">{error}</p>}
      </div>
    </div>
  );
}

/** 切れてすぐの再接続では出さない */
const GRACE_MS = 5000;
const CHECK_MS = 3000;

/** インターネットにはつながっているのにサーバーに届かない間（デプロイ中など）は、全面にメンテナンス中と出す */
export function MaintenanceOverlay() {
  const connected = useStore((s) => s.wsConnected);
  const [down, setDown] = useState(false);
  useEffect(() => {
    if (connected) { setDown(false); return; }
    let alive = true;
    let timer = 0;
    const check = async () => {
      // 前段のプロキシがエラーページを返す間も ok にはならない
      const ok = !navigator.onLine || await fetch('/healthz', { cache: 'no-store' }).then((r) => r.ok).catch(() => false);
      if (!alive) return;
      setDown(!ok);
      timer = window.setTimeout(() => void check(), CHECK_MS);
    };
    timer = window.setTimeout(() => void check(), GRACE_MS);
    return () => { alive = false; clearTimeout(timer); };
  }, [connected]);
  if (!down) return null;
  return (
    <div className="maintenance" role="alert">
      <div className="maintcard">
        <img src="/brand/mark.png" alt="" />
        <h2>{tr("ui689")}</h2>
        <p>{tr("ui690")}</p>
        <span className="maintwait"><i className="spin" />{tr("ui691")}</span>
      </div>
    </div>
  );
}
