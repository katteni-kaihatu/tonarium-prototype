import { t as tr, useLanguage } from './i18n/index.ts';
import { LanguageSelect } from './i18n/LanguageSelect.tsx';
import { UpdateRecoveryNotice } from './UpdateRecoveryNotice.tsx';
import { useMarketNavigation } from './market/navigation.ts';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useStore } from './store.ts';
import { enter, loginGuest, resume, startMisskeyLogin, type AuthInfo } from './auth.ts';
import { HammerCursor, Lightbox } from './world/common.tsx';
import { Home } from './home/Home.tsx';
import { Toast, WorldScreen } from './world/WorldScreen.tsx';
import { SharedSession } from './home/SharedSession.tsx';
import { PeekMascot, type MascotHandle } from './world/Mascot.tsx';
import { FEEDBACK_URL } from './feedback.ts';
import { CompatOverlay, MaintenanceOverlay, UpdateBanner } from './world/ServerNotices.tsx';
import { XRControls } from './xr/XRControls.tsx';

const NpcPrototype = lazy(() => import('./world/NpcChat.tsx').then((m) => ({ default: m.NpcPrototype })));
const FantasyPlaytest = lazy(() => import('./world/FantasyPlaytest.tsx').then((m) => ({ default: m.FantasyPlaytest })));

function JoinScreen({ misskeyHost }: { misskeyHost: string }) {
  const [name, setName] = useState(() => {
    try { return localStorage.getItem('tonarium.name') ?? ''; } catch { return ''; }
  });
  const [waiting, setWaiting] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const tona = useRef<MascotHandle>(null);
  const rimu = useRef<MascotHandle>(null);
  const lastHop = useRef(0);
  // 名前を打つと、交互にぴょんと反応する
  const typed = (v: string) => {
    setName(v);
    const now = performance.now();
    if (now - lastHop.current < 700) return;
    lastHop.current = now;
    (v.length % 2 ? tona : rimu).current?.hop();
  };
  const run = async (f: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try { await f(); } catch { setError(true); setWaiting(null); }
    setBusy(false);
  };
  const guest = () => run(async () => {
    const n = name.trim() || tr("ui6");
    try { localStorage.setItem('tonarium.name', n); } catch { /* ignore */ }
    await loginGuest(n);
  });
  const misskey = () => run(async () => {
    const account = await startMisskeyLogin(setWaiting);
    if (account) enter(account);
  });
  return (
    <div className="joinbg">
      <div className="joinstage">
        <PeekMascot who="tona" ref={tona} />
        <PeekMascot who="rimu" ref={rimu} />
        <div className="join">
          <h1 className="joinlogo"><img src="/brand/logo.png" alt="Tonarium" /></h1>
          <p>{tr("ui7")}</p>
          <button className="primary" onClick={() => void misskey()} disabled={busy}>{tr('authMisskey')}</button>
          {waiting ? <><small>{tr('authWaiting')}</small><b className="logincode">{waiting}</b></> : <small>{tr('authMisskeyHint', misskeyHost)}</small>}
          {error && <small className="err">{tr('authFailed')}</small>}
          <div className="joinor"><span>{tr('authOr')}</span></div>
          <label htmlFor="joinname">{tr("ui11")}</label>
          <input
            id="joinname" value={name} maxLength={24}
            onChange={(e) => typed(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void guest()}
          />
          <button onClick={() => void guest()} disabled={busy}>{tr('authGuest')}</button>
          <small>{tr('authGuestHint')}</small>
          <LanguageSelect />
          <small>{tr("ui13")}</small>
          <a className="join-download" href="https://github.com/katteni-kaihatu/tonarium-prototype/releases" target="_blank" rel="noreferrer">{tr('desktopDownload')}</a>
        </div>
      </div>
      <aside className="joinnotice" aria-label={tr("ui14")}>
        <div className="jnbody">
          <h2><span className="jnsign" aria-hidden="true">!</span>{tr("ui14")}</h2>
          <p className="jnlead">
            <span>{tr("ui15")}<b>{tr("ui16")}</b>{tr("ui17")}</span>
            <span>{tr("ui18")}<b>{tr("ui19")}</b>。</span>
            <span>{tr("ui20")}<b>{tr("ui21")}</b>{tr("ui22")}</span>
          </p>
          <ul>
            <li>{tr("ui23")}</li>
            <li>{tr("ui24")}</li>
            <li>{tr("ui25")}<a href={FEEDBACK_URL} target="_blank" rel="noreferrer">{tr("ui26")}</a>{tr("ui27")}</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

export function App() {
  useLanguage();
  useMarketNavigation();
  const joined = useStore((s) => s.joined);
  const session = useStore((s) => s.session);
  const incompatible = useStore((s) => s.incompatible);
  // ログイン済みかを確かめ終わるまでは入口を出さない（一瞬ちらつかないように）
  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null);
  useEffect(() => {
    void resume().then(setAuthInfo, () => setAuthInfo({ account: null, misskeyHost: 'misskey.resonite.love', devLogin: false }));
  }, []);
  const params = new URLSearchParams(location.search);
  return (
    <>
      <UpdateRecoveryNotice />
      {/* NPC の試作もログインしてから（本人はログインのセッションで決まる） */}
      {!joined ? (authInfo && <JoinScreen misskeyHost={authInfo.misskeyHost} />) : incompatible ? <CompatOverlay />
        : params.get('npc') === '1' ? <Suspense fallback={null}><NpcPrototype onStart={() => {}} /></Suspense>
        : params.get('rpg') === '1' ? <Suspense fallback={null}><FantasyPlaytest /></Suspense>
        : session ? <WorldScreen /> : <Home />}
      <SharedSession />
      {!session && <Toast />}
      <Lightbox />
      <HammerCursor />
      <UpdateBanner />
      <MaintenanceOverlay />
      <XRControls />
    </>
  );
}
