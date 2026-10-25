import { t as tr, useLanguage } from './i18n/index.ts';
import { LanguageSelect } from './i18n/LanguageSelect.tsx';
import { useMarketNavigation } from './market/navigation.ts';
import { useEffect, useRef, useState } from 'react';
import { useStore, set } from './store.ts';
import { connectWs } from './net/ws.ts';
import { iconUrl } from './icon.ts';
import { ProfileDialog } from './Profile.tsx';
import { HammerCursor, Lightbox } from './world/common.tsx';
import { Home } from './home/Home.tsx';
import { WorldScreen } from './world/WorldScreen.tsx';
import { PeekMascot, type MascotHandle } from './world/Mascot.tsx';
import { FEEDBACK_URL } from './feedback.ts';
import { CompatOverlay, MaintenanceOverlay, UpdateBanner } from './world/ServerNotices.tsx';
import { XRControls } from './xr/XRControls.tsx';

function loadId() {
  try {
    let id = localStorage.getItem('tonarium.id');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('tonarium.id', id); }
    // ?as=xxx で同一ブラウザから別人として入れる（動作確認用）
    const as = new URLSearchParams(location.search).get('as');
    return as ? `${id}-${as}` : id;
  } catch {
    return crypto.randomUUID();
  }
}

function JoinScreen() {
  const [name, setName] = useState(() => {
    try { return localStorage.getItem('tonarium.name') ?? ''; } catch { return ''; }
  });
  const [icon, setIcon] = useState<string | null>(null);
  useEffect(() => {
    const n = name.trim();
    if (!n) { setIcon(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      const url = iconUrl(n);
      void fetch(url).then((r) => { if (alive) setIcon(r.ok ? url : null); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [name]);
  const [profile, setProfile] = useState(false);
  const closeProfile = () => {
    setProfile(false);
    const n = name.trim();
    void fetch(iconUrl(n)).then((r) => setIcon(r.ok ? iconUrl(n) : null));
  };
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
  const join = () => {
    const n = name.trim() || tr("ui6");
    try { localStorage.setItem('tonarium.name', n); } catch { /* ignore */ }
    const id = loadId();
    set({ selfId: id, selfName: n, joined: true });
    // AD の進行は Tonarium の ID に紐付けて開始する（認証として信用はしない）
    useStore.getState().adBindTonarium(id, n);
    connectWs();
  };
  return (
    <div className="joinbg">
      {profile && <ProfileDialog name={name} onClose={closeProfile} />}
      <div className="joinstage">
        <PeekMascot who="tona" ref={tona} />
        <PeekMascot who="rimu" ref={rimu} />
        <div className="join">
          <h1 className="joinlogo"><img src="/brand/logo.png" alt="Tonarium" /></h1>
          <p>{tr("ui7")}</p>
          <div className="joinicon">
            <button className="avbtn" title={tr("ui8")} onClick={() => setProfile(true)} disabled={!name.trim()}>
              {icon ? <img className="av" src={icon} alt="" /> : <div className="av noicon">{name.trim().slice(0, 1) || '?'}</div>}
            </button>
            <small>{name.trim() ? tr("ui9") : tr("ui10")}</small>
          </div>
          <label htmlFor="joinname">{tr("ui11")}</label>
          <input
            id="joinname" autoFocus value={name} maxLength={24}
            onChange={(e) => typed(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && join()}
          />
          <LanguageSelect />
          <button className="primary" onClick={join}>{tr("ui12")}</button>
          <small>{tr("ui13")}</small>
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
  if (!joined) return <JoinScreen />;
  if (incompatible) return <CompatOverlay />;
  return (
    <>
      {session ? <WorldScreen /> : <Home />}
      <Lightbox />
      <HammerCursor />
      <UpdateBanner />
      <MaintenanceOverlay />
      <XRControls />
    </>
  );
}
