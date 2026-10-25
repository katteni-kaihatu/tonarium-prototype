import { t as tr } from '../i18n/index.ts';
import { useEffect, useState } from 'react';
import { useStore } from '../store.ts';

/** つなぎ直した先で画面の版が変わっていたら、更新を促す。「あとで」はその版のあいだだけ隠す */
export function UpdateBanner() {
  const version = useStore((s) => s.updateVersion);
  const inSession = useStore((s) => !!s.session);
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!version || version === dismissed) return null;
  return (
    <div className="updatebar" role="status">
      <span><b>{tr("ui682")}</b>{inSession && <span className="sub">{tr("ui683")}</span>}</span>
      <button className="updatego" onClick={() => location.reload()}>{tr("ui684")}</button>
      <button className="ib updatelater" onClick={() => setDismissed(version)}>{tr("ui685")}</button>
    </div>
  );
}

/** 互換性バージョンがサーバーと違うと通信の約束事が食い違うので、更新するまで全面で止める */
export function CompatOverlay() {
  return (
    <div className="maintenance" role="alert">
      <div className="maintcard">
        <img src="/brand/mark.png" alt="" />
        <h2>{tr("ui686")}</h2>
        <p>{tr("ui687")}</p>
        <button className="updatego" onClick={() => location.reload()}>{tr("ui688")}</button>
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
