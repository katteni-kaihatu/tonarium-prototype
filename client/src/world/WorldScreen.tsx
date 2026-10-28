import { sourceText as uiSource } from '../i18n/core.ts';
import { useSpaceToStand } from '../systems/useSpaceToStand.ts';
import { useCameraTimerDemo } from '../systems/useCameraTimerDemo.ts';
import { useUpdateDraft } from '../updateDraft.ts';
import { t as tr, systemText } from '../i18n/index.ts';
import { contentAvailable, productFor } from '../../../shared/market.ts';
import { MOVEMENT_MODES } from '../view3d/movement.ts';
import { KeyHelp } from '../view3d/KeyHelp.tsx';
import { XRSettings } from '../xr/XRControls.tsx';
import { useOwnedContent } from '../market/store.ts';
import { OriginBadge } from '../market/OriginBadge.tsx';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { SOUNDS } from '../i18n/static.ts';
import { WORLDS } from '../i18n/static.ts';
import { WORLD_COUNTDOWN_MS } from '../../../shared/worlds.ts';
import { useStore, get, set, save, nameOf, sessionOf, isBroadcast, worldKindOf, serverNow } from '../store.ts';
import { send } from '../net/ws.ts';
import { dropFollowers, follow, leaveSession, playSound, requestLive, setViewLive } from '../actions.ts';
import { dropHammer, place2d } from '../items/actions.ts';
import { consumeHitFx } from '../items/effects.ts';
import { toggleMic, toggleShare } from '../net/livekit.ts';
// 3D 空間は three 一式が重いので、3D モードに入るときだけ読み込む
const View3D = lazy(() => import('../view3d/View3D.tsx').then((m) => ({ default: m.View3D })));
import { ProfileDialog } from '../Profile.tsx';
import { Icon } from './Icon.tsx';
import { Popover, itemLabel } from './common.tsx';
import { NearList } from './NearList.tsx';
import { FaceStrip } from './FaceStrip.tsx';
import { NoticeLog } from './NoticeLog.tsx';
import { WindowLayer } from './WindowLayer.tsx';
import { ProfileCard } from './ProfileCard.tsx';
import { HoppingMascots } from './Mascot.tsx';
import { SessionMenu } from '../home/SessionMenu.tsx';
import { WorldSelectDialog } from '../home/pages.tsx';
import { PortraitCanvas } from './Portraits.tsx';
import { MapLayer } from './MapLayer.tsx';
import { ConfirmOpen } from './Links.tsx';
import { shareFiles, shareYouTube, youTubeId } from '../media.ts';
import { closeWindow, openWindow, setWinMode } from './windows.ts';
import { touchOnly, usePhone } from '../phone.ts';
import { MasterVolume } from './VolumeMenus.tsx';
import { SurvivorPanel } from './SurvivorPanel.tsx';
import { EmoteDockButton } from './Emotes.tsx';
import { unlockEmoteAudio } from './sounds.ts';
import { AdAudio } from '../ad/AdAudio.tsx';
import { NewArrivals, PopupPauseSettings } from './NewArrivals.tsx';

const FantasyPanel = lazy(() => import('./FantasyPanel.tsx').then((m) => ({ default: m.FantasyPanel })));

/** 名前はだれでも変えられ、全員に反映されてログに出る */
function SessionRename({ current, onDone }: { current: string; onDone: () => void }) {
  const [name, setName] = useState(current);
  const v = name.trim();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!v || v === current) return;
    send({ t: 'sessionRename', name: v });
    onDone();
  };
  return (
    <form className="renamerow" onSubmit={submit}>
      <input aria-label={tr("ui102")} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      <button className="renamebtn" type="submit" disabled={!v || v === current}>{tr("ui849")}</button>
    </form>
  );
}

function WorldBadge() {
  const world = useStore((s) => sessionOf(s.session));
  const selfName = useStore((s) => s.selfName);
  const wsConnected = useStore((s) => s.wsConnected);
  const broadcast = useStore((s) => isBroadcast(s));
  const kind = useStore((s) => worldKindOf(s));
  const mode = useStore((s) => s.mode);
  const movementMode = useStore((s) => s.movementMode);
  const doubleJump = useStore((s) => s.doubleJump);
  const lean = useStore((s) => s.lean);
  const survivorWindowOpen = useStore((s) => s.windows.some((w) => w.key === 'survivors'));
  const antimatterWindowOpen = useStore((s) => s.windows.some((w) => w.key === 'antimatter'));
  const pending = useStore((s) => !!s.worldPending && s.worldPending.sid === s.session);
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const [profile, setProfile] = useUpdateDraft('profile.session', false);
  const [selectWorld, setSelectWorld] = useUpdateDraft('world.select', false);
  return (
    <div className="worldbadge">
      <img className="wmark" src="/brand/mark.png" alt="" />
      <span className="wname">{world?.name}</span>
      {kind === 'survivors' && mode === '2d' && <button className="chipbtn survivor-window-button" onClick={() => openWindow('survivors')}>{survivorWindowOpen ? tr("ui850") : tr("ui851")}</button>}
      {broadcast && <span className="bcpill" title={tr("ui852")}><Icon name="megaphone" size={12} />{tr("ui853")}</span>}
      {!wsConnected && <span className="reconn">{tr("ui854")}</span>}
      {kind === 'antimatter' && mode === '2d' && <button className="chipbtn" onClick={() => openWindow('antimatter')}>{antimatterWindowOpen ? tr('mergeAdLab') : tr('mergeOpenAd')}</button>}
      <span className="vline" />
      <button
        className="ib" aria-label={tr("ui855")} title={tr("ui855")} data-popanchor
        onClick={(e) => setMenu(menu ? null : e.currentTarget.getBoundingClientRect())}
      ><Icon name="settings" size={18} /></button>
      {menu && (
        <Popover anchor={menu} side="down" onClose={() => setMenu(null)} className="settings">
          <PopupPauseSettings />
          <XRSettings />
          <span className="menusep" />
          <span className="menutitle">{tr("ui856")}</span>
          <SessionRename current={world?.name ?? ''} onDone={() => setMenu(null)} />
          <span className="menusep" />
          <label className="switchrow settings-row">
            <span><b>{tr("ui857")}</b><span className="sub wrap">{tr("ui858")}</span></span>
            <input type="checkbox" role="switch" checked={broadcast} onChange={(e) => send({ t: 'broadcast', on: e.target.checked })} />
          </label>
          <span className="menusep" />
          {mode === '3d' && <>
            <span className="menutitle">{tr('mergeMovementSettings')}</span>
            <div className="worldpick" role="radiogroup" aria-label={tr('mergeMovementLabel')}>
              {(Object.keys(MOVEMENT_MODES) as (keyof typeof MOVEMENT_MODES)[]).map((value) => (
                <button key={value} role="radio" aria-checked={movementMode === value} className={`ib wpick ${movementMode === value ? 'on' : ''}`} onClick={() => set({ movementMode: value })}>
                  {tr(MOVEMENT_MODES[value])}
                </button>
              ))}
            </div>
            <span className="sub wrap">{tr('mergeFlightHint')}</span>
            <label className="switchrow">
              <span>{tr('doubleJumpSetting')}</span>
              <input type="checkbox" role="switch" checked={doubleJump} onChange={(e) => { set({ doubleJump: e.target.checked }); save('tonarium.doubleJump', e.target.checked); }} />
            </label>
            <label className="switchrow">
              <span>{tr('leanSetting')}</span>
              <input type="checkbox" role="switch" checked={lean} onChange={(e) => { set({ lean: e.target.checked }); save('tonarium.lean', e.target.checked); }} />
            </label>
            <span className="menusep" />
          </>}
          <span className="menutitle">{tr('ui859')}</span>
          <button className="ib menuitem" disabled={pending} onClick={() => { setMenu(null); setSelectWorld(true); }}><Icon name="globe" />{tr('mergeChangeWorld')}</button>
          <span className="menusep" />
          <button className="ib menuitem" onClick={() => { setProfile(true); setMenu(null); }}><Icon name="user" />{tr("ui860")}</button>
          <button className="ib menuitem" onClick={() => { setMenu(null); leaveSession(); }}><Icon name="leave" />{tr("ui861")}</button>
        </Popover>
      )}
      {profile && createPortal(<ProfileDialog name={selfName} onClose={() => setProfile(false)} />, document.body)}
      {selectWorld && createPortal(<WorldSelectDialog onClose={() => setSelectWorld(false)} />, document.body)}
    </div>
  );
}

function Soundboard({ anchor, onClose }: { anchor: DOMRect; onClose: () => void }) {
  const owned = useOwnedContent();
  return (
    <Popover anchor={anchor} side="up" onClose={onClose} className="soundboard">
      <span className="menutitle">{tr("ui862")}</span>
      <div className="sgrid">
        {SOUNDS.filter((x) => contentAvailable(owned, 'sounds', x.id)).map((x) => <div key={x.id} className="market-entry"><button className="ib sbtn" onClick={() => { unlockEmoteAudio(); playSound(x.id); }}>{x.name}</button><OriginBadge productId={productFor('sounds', x.id)?.id} onOpen={onClose} /></div>)}
      </div>
    </Popover>
  );
}

function Dock() {
  const { voice, micEnabled, sharer, selfId, winMode } = useStore(useShallow((s) => ({
    voice: s.voice, micEnabled: s.micEnabled, sharer: s.sharer, selfId: s.selfId, winMode: s.winMode,
  })));
  const [sb, setSb] = useState<DOMRect | null>(null);
  const [vol, setVol] = useState<DOMRect | null>(null);
  const ok = voice === 'connected';
  const sharingSelf = sharer === selfId;
  return (
    <div role="toolbar" aria-label={tr("ui863")} className="dock">
      <button className={`dk ${micEnabled ? '' : 'muted'}`} onClick={() => void toggleMic()} aria-label={micEnabled ? tr("ui864") : tr("ui865")} title={micEnabled ? tr("ui601") : tr("ui36")}>
        <Icon name={micEnabled ? 'mic' : 'micOff'} size={22} />
      </button>
      {/* スマホのブラウザは画面共有できない */}
      {!touchOnly && (
        <button
          className={`dk ${sharingSelf ? 'active' : ''}`} disabled={!ok || (!!sharer && !sharingSelf)} onClick={() => void toggleShare()}
          aria-label={sharingSelf ? tr("ui866") : tr("ui318")} title={sharingSelf ? tr("ui866") : !ok ? tr("ui867") : sharer ? tr("ui868", nameOf(sharer)) : tr("ui318")}
        ><Icon name="screen" size={22} /></button>
      )}
      <button className="dk" aria-label={tr("ui224")} title={tr("ui224")} data-popanchor onClick={(e) => setSb(sb ? null : e.currentTarget.getBoundingClientRect())}>
        <Icon name="music" size={22} />
      </button>
      <EmoteDockButton />
      <button className="dk" aria-label={tr("ui824")} title={tr("ui824")} data-popanchor onClick={(e) => setVol(vol ? null : e.currentTarget.getBoundingClientRect())}>
        <Icon name="volume" size={22} />
      </button>
      <span className="dsep" />
      <div className="dseg" role="radiogroup" aria-label={tr("ui869")}>
        <button role="radio" aria-checked={winMode === 'simple'} className={winMode === 'simple' ? 'on' : ''} onClick={() => setWinMode('simple')} title={tr("ui870")}>
          <Icon name="window" size={15} />{tr("ui871")}</button>
        <button role="radio" aria-checked={winMode === 'free'} className={winMode === 'free' ? 'on' : ''} onClick={() => setWinMode('free')} title={tr("ui872")}>
          <Icon name="layers" size={15} />{tr("ui873")}</button>
      </div>
      <span className="dsep" />
      <button className="dk leave" onClick={leaveSession} aria-label={tr("ui874")} title={tr("ui875")}><Icon name="leave" size={22} /></button>
      {sb && <Soundboard anchor={sb} onClose={() => setSb(null)} />}
      {vol && <MasterVolume anchor={vol} onClose={() => setVol(null)} />}
    </div>
  );
}

/** ドックの上に出す、いまの状態のお知らせ */
function StatusChips() {
  const s = useStore(useShallow((st) => ({
    participants: st.participants,
    selfId: st.selfId,
    items: st.items,
    sync: st.sync,
    syncError: st.syncError,
    syncTransport: st.syncTransport,
    syncRtt: st.syncRtt,
    syncRoutes: st.syncRoutes,
    users: st.users,
    voice: st.voice,
    voiceError: st.voiceError,
    mode: st.mode,
    camFeeds: st.camFeeds,
    liveRequested: st.liveRequested,
  })));
  const me = s.participants.find((p) => p.id === s.selfId);
  const hammer = Object.values(s.items).find((i) => i.kind === 'hammer' && i.holder === s.selfId);
  const followers = s.participants.filter((p) => p.follow === s.selfId);
  const placedSelf = me?.mode === '2d' && !!me.pos && !me.follow;
  const chips: React.ReactNode[] = [];
  if (s.sync === 'connecting') chips.push(<span key="sync">{tr("ui876")}</span>);
  if (s.sync === 'unavailable') chips.push(<span key="sync" title={s.syncError ? systemText(s.syncError) : ''}>{tr("ui877")}{ s.syncError ? `（${systemText(s.syncError)}）` : ''}</span>);
  if (s.sync === 'connected') chips.push(<span key="sync" title={tr("ui878", s.syncTransport ?? '')}>{tr("ui879")}{s.syncRtt === null ? tr("ui880") : `${s.syncRtt} ms`}{s.syncTransport === 'websocket' ? tr("ui881") : ''}</span>);
  if (s.sync === 'connected' && s.syncRoutes.length) {
    const direct = s.syncRoutes.filter((r) => r.route === 'direct').length;
    const detail = s.syncRoutes.map((r) => tr("ui882", s.users.find((u) => u.id === r.user)?.name ?? r.user, r.route === 'direct' ? 'P2P' : tr("ui883"), r.reason, r.rttMs === null ? '' : ` · ${Math.round(r.rttMs)} ms`, r.sentDirect, r.receivedDirect, r.sentRelay, r.receivedRelay)).join('\n');
    chips.push(<span key="routes" title={detail}>{tr("ui884")}{direct}{tr("ui885")}{s.syncRoutes.length - direct}{tr("ui125")}</span>);
  }
  if (s.voice === 'connecting') chips.push(<span key="v">{tr("ui886")}</span>);
  if (s.voice === 'unavailable') chips.push(<span key="v" title={s.voiceError ? systemText(s.voiceError) : ''}>{tr("ui887")}{ s.voiceError ? `（${systemText(s.voiceError)}）` : ''}</span>);
  if (s.mode === '2d' && hammer) chips.push(<span key="h">{tr("ui888")}<button className="chipbtn" onClick={dropHammer}>{tr("ui615")}</button></span>);
  if (placedSelf) chips.push(<span key="p"><Icon name="pin" size={14} />{tr("ui889")}<button className="chipbtn" onClick={() => place2d(s.selfId, null)}>{tr("ui890")}</button></span>);
  if (followers.length) {
    chips.push(
      <span key="f">
        {followers.map((f) => f.name).join('、')} {tr("ui891")}{me?.viewLive && tr("ui892")}
        {me?.viewLive
          ? <button className="chipbtn" onClick={() => setViewLive(false)}>{tr("ui893")}</button>
          : s.mode === '3d' && <button className="chipbtn" onClick={() => setViewLive(true)}>{tr("ui894")}</button>}
        <button className="chipbtn" onClick={dropFollowers}>{tr("ui895")}</button>
      </span>,
    );
  }
  const target = me?.follow ? s.participants.find((p) => p.id === me.follow) : undefined;
  if (target) {
    const key = `view:${target.id}`;
    const feed = target.viewLive && !!s.camFeeds[key];
    chips.push(
      <span key="t">
        <Icon name="follow" size={14} />{target.name} {tr("ui896")}{feed
          ? <button className="chipbtn" onClick={() => openWindow(key)}>{tr("ui616")}</button>
          : target.viewLive ? <span className="sub light">{tr("ui897")}</span>
          : <button className="chipbtn" disabled={s.liveRequested === target.id} onClick={() => requestLive(target.id)}>{s.liveRequested === target.id ? tr("ui898") : tr("ui899")}</button>}
        <button className="chipbtn" onClick={() => follow(null)}>{tr("ui109")}</button>
      </span>,
    );
  }
  if (!chips.length) return null;
  return <div className="statuschips">{chips.map((c, i) => <div key={i} className="schip">{c}</div>)}</div>;
}

/** 3D 空間の読み込み中は、切り替え時と同じ画面で待たせる */
function View3DFallback() {
  const world = useStore((s) => sessionOf(s.session));
  return (
    <div className="switchload to3d" role="status" aria-live="polite">
      <div className="slbox">
        <HoppingMascots to="3d" />
        <b>{world?.name ?? ''} {tr("ui900")}</b>
      </div>
    </div>
  );
}

function SwitchLoading() {
  const switching = useStore((s) => s.switching);
  const world = useStore((s) => sessionOf(s.session));
  if (!switching) return null;
  const to3d = switching.to === '3d';
  return (
    <div className={`switchload ${to3d ? 'to3d' : 'to2d'}`} role="status" aria-live="polite">
      <div className="slbox">
        <HoppingMascots to={switching.to} />
        <b>{to3d ? tr("ui901", world?.name ?? '') : tr("ui902")}</b>
        <div className="slbar"><span style={{ animationDuration: `${switching.dur}ms` }} /></div>
      </div>
    </div>
  );
}

function ConfirmWorld() {
  const world = useStore((s) => s.confirmWorld);
  const [clear, setClear] = useState(false);
  if (!world) return null;
  const cancel = () => { set({ confirmWorld: null }); setClear(false); };
  const ok = () => { send({ t: 'world', world, clearItems: clear }); cancel(); };
  return (
    <div className="modalbg light" onClick={cancel}>
      <div role="alertdialog" aria-modal="true" aria-label={tr("ui903")} className="confirm" onClick={(e) => e.stopPropagation()}>
        <h2>{tr("ui904")}{WORLDS[world].name}{tr("ui905")}</h2>
        <span className="sub wrap">{tr("ui906")}{WORLD_COUNTDOWN_MS / 1000} {tr("ui907")}</span>
        <label className="checkrow">
          <input type="checkbox" checked={clear} onChange={(e) => setClear(e.target.checked)} />
          <span>{tr("ui908")}</span>
        </label>
        <div className="row end">
          <button onClick={cancel}>{tr("ui338")}</button>
          <button className="dark" autoFocus onClick={ok}>{tr("ui909")}</button>
        </div>
      </div>
    </div>
  );
}

/** 切り替わる前に全員の上部へ出すカウントダウン */
function WorldCountdown() {
  const p = useStore((s) => (s.worldPending?.sid === s.session ? s.worldPending : null));
  const [, tick] = useState(0);
  useEffect(() => {
    if (!p) return;
    const t = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(t);
  }, [p]);
  if (!p) return null;
  const left = Math.max(1, Math.ceil((p.at - serverNow()) / 1000));
  return (
    <div className="worldcount" role="status" aria-live="assertive">
      <b className="wcnum" key={left}>{left}</b>
      <span>
        {tr("ui910")}{WORLDS[p.world].name}{tr("ui911")}<span className="sub">（{nameOf(p.by)} {tr("ui912")}{p.clearItems ? tr("ui913") : ''}）</span>
      </span>
    </div>
  );
}

function WorldLoading() {
  const loading = useStore((s) => s.worldLoading);
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => set({ worldLoading: null }), loading.dur);
    return () => clearTimeout(t);
  }, [loading]);
  if (!loading || loading.dur <= 0) return null;
  return (
    <div className="switchload to3d" role="status" aria-live="polite">
      <div className="slbox">
        <HoppingMascots to="3d" />
        <b>「{WORLDS[loading.world].name}{tr("ui914")}</b>
        <div className="slbar"><span style={{ animationDuration: `${loading.dur}ms` }} /></div>
      </div>
    </div>
  );
}

function ConfirmClose() {
  const key = useStore((s) => s.confirmClose);
  const sharer = useStore((s) => s.sharer);
  const items = useStore((s) => s.items);
  if (!key) return null;
  const id = key.slice(key.indexOf(':') + 1);
  const it = items[id];
  const title = key === 'share' ? tr("ui835", nameOf(sharer))
    : key.startsWith('cam:') ? tr("ui915")
    : key.startsWith('view:') ? tr("ui836", nameOf(id))
    : it ? itemLabel(it) : tr("ui916");
  const cancel = () => set({ confirmClose: null });
  return (
    <div className="modalbg light" onClick={cancel}>
      <div role="alertdialog" aria-modal="true" aria-label={tr("ui917")} className="confirm" onClick={(e) => e.stopPropagation()}>
        <h2>{title} {tr("ui918")}</h2>
        <span className="sub wrap">{tr("ui919")}</span>
        <div className="row end">
          <button onClick={cancel}>{tr("ui338")}</button>
          <button className="dark" autoFocus onClick={() => closeWindow(key)}>{tr("ui73")}</button>
        </div>
      </div>
    </div>
  );
}

function HitFxLayer({ root }: { root: React.RefObject<HTMLDivElement | null> }) {
  const fx = useStore((s) => s.hitFx);
  const mode = useStore((s) => s.mode);
  if (mode !== '2d') return null;
  return (
    <>
      {fx.map((f) => {
        const el = root.current;
        const a = el?.querySelector(`[data-uid="${f.from}"]`)?.getBoundingClientRect();
        const b = el?.querySelector(`[data-uid="${f.to}"]`)?.getBoundingClientRect();
        if (!el || !b) { queueMicrotask(() => consumeHitFx(f.key)); return null; }
        const to = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
        const from = a ? { x: a.left + a.width / 2, y: a.top + a.height / 2 } : { x: to.x, y: to.y - 120 };
        return (
          <div key={f.key} className="hitfx" style={{ left: to.x, top: to.y }}>
            <div
              className="flyhammer"
              style={{ '--dx': `${from.x - to.x}px`, '--dy': `${from.y - to.y}px` } as React.CSSProperties}
              onAnimationEnd={() => consumeHitFx(f.key)}
            >🔨</div>
            <div className="pico">{tr("ui542")}</div>
          </div>
        );
      })}
    </>
  );
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
const mediaFiles = (list: FileList | undefined | null) => [...(list ?? [])].filter((f) => /^(image|video)\//.test(f.type));

/**
 * Ctrl+V・ドラッグ＆ドロップで画像・動画・YouTube を共有する。
 * 3D では目の前にアイテムとして出してチャットにも投稿、2D ではチャットに投稿するだけ
 */
function useMediaInput() {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    let depth = 0;
    const asItem = () => get().mode === '3d';
    // ホームを重ねている間はそちらのページ（タイムラインなど）に任せる
    const covered = () => get().hubOpen;
    const onPaste = (e: ClipboardEvent) => {
      if (covered()) return;
      const files = mediaFiles(e.clipboardData?.files);
      if (files.length) { e.preventDefault(); void shareFiles(files, asItem()); return; }
      if (isTyping(e.target)) return;
      const id = youTubeId(e.clipboardData?.getData('text') ?? '');
      if (id) { e.preventDefault(); void shareYouTube(id, asItem()); }
    };
    const wanted = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].some((t) => t === 'Files' || t === 'text/uri-list' || t === 'text/plain');
    const onEnter = (e: DragEvent) => { if (wanted(e) && !covered()) { depth++; setDragging(true); } };
    const onLeave = () => { depth = Math.max(0, depth - 1); if (!depth) setDragging(false); };
    const onOver = (e: DragEvent) => { if (wanted(e)) e.preventDefault(); };
    const onDrop = (e: DragEvent) => {
      depth = 0;
      setDragging(false);
      if (!e.dataTransfer) return;
      // 受け取らないページでも、落としたファイルを窓で開いてセッションから抜けないようにする
      if (covered()) { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); return; }
      const files = mediaFiles(e.dataTransfer.files);
      const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
      const id = youTubeId(text);
      if (!files.length && !id) return;
      e.preventDefault();
      if (files.length) void shareFiles(files, asItem());
      else if (id) void shareYouTube(id, asItem());
    };
    window.addEventListener('paste', onPaste);
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);
  return dragging;
}

function DropHint() {
  const mode = useStore((s) => s.mode);
  return (
    <div className="drophint" aria-hidden="true">
      <div>
        <Icon name="image" size={36} stroke={1.6} />
        <b>{mode === '3d' ? tr("ui920") : tr("ui921")}</b>
        <span>{tr("ui922")}</span>
      </div>
    </div>
  );
}

export function Toast() {
  const toast = useStore((s) => s.toast);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => tick((n) => n + 1), 4000 - (Date.now() - toast.at) + 20);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast || Date.now() - toast.at > 4000) return null;
  return <div className="toast" role="status">{systemText(toast.text)}</div>;
}

/** 頼んだ視点のライブが届いたら開く */
function useOpenRequestedLive() {
  const requested = useStore((s) => s.liveRequested);
  const ready = useStore((s) => !!requested && !!s.camFeeds[`view:${requested}`]);
  useEffect(() => {
    if (!ready || !requested) return;
    openWindow(`view:${requested}`);
    set({ liveRequested: null });
  }, [ready, requested]);
}

const PHONE_TABS = [
  { id: 'screen', name: uiSource('ui923'), icon: 'window' },
  { id: 'list', name: uiSource('ui626'), icon: 'people' },
  { id: 'log', name: uiSource('ui659'), icon: 'chat' },
] as const;

/** スマホ幅では前面のパネルを全面に 1 つずつ出し、下のタブで切り替える */
function PhoneTabs() {
  const tab = useStore((s) => s.phoneTab);
  const unread = useStore((s) => s.notices.filter((n) => n.unread).length);
  return (
    <nav className="phonetabs" aria-label={tr("ui924")}>
      {PHONE_TABS.map((t) => (
        <button key={t.id} className={`ib ${tab === t.id ? 'on' : ''}`} aria-pressed={tab === t.id} onClick={() => set({ phoneTab: t.id })}>
          <Icon name={t.icon} size={20} />{t.name}
          {t.id === 'log' && unread > 0 && <span className="badge">{unread}</span>}
        </button>
      ))}
    </nav>
  );
}

export function WorldScreen() {
  useSpaceToStand();
  useCameraTimerDemo();
  useEffect(() => {
    window.addEventListener('pointerdown', unlockEmoteAudio);
    window.addEventListener('keydown', unlockEmoteAudio);
    return () => {
      window.removeEventListener('pointerdown', unlockEmoteAudio);
      window.removeEventListener('keydown', unlockEmoteAudio);
    };
  }, []);
  useOpenRequestedLive();
  const phone = usePhone();
  useEffect(() => { set({ phoneLayout: phone }); }, [phone]);
  const phoneTab = useStore((s) => s.phoneTab);
  // スマホでは左右のパネルはたたまず、ウィンドウはカンタン表示だけ（保存はしない）
  useEffect(() => {
    if (phone) set((s) => ({ folded: { ...s.folded, left: false, right: false }, winMode: 'simple' }));
  }, [phone]);
  const dragging = useMediaInput();
  const mode = useStore((s) => s.mode);
  const worldKind = useStore((s) => worldKindOf(s));
  const [fantasySocial, setFantasySocial] = useState(false);
  const locked = useStore((s) => s.locked);
  const folded = useStore((s) => s.folded);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (worldKind === 'survivors' && mode === '2d') openWindow('survivors');
    else if (worldKind !== 'survivors') {
      closeWindow('survivors', true);
      closeWindow('survivor-library', true);
    }
    // ワールド用パネルは研究所内だけ。アイテムから開いたパネルと進行データは維持する。
    if (worldKind === 'antimatter' && mode === '2d') openWindow('antimatter');
    else if (worldKind !== 'antimatter') closeWindow('antimatter');
  }, [worldKind, mode]);
  useEffect(() => {
    if (mode !== '3d') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Tab' || isTyping(e.target)) return;
      e.preventDefault();
      if (e.repeat) return;
      set((s) => {
        const fold = !(s.folded.left && s.folded.right);
        const folded = { ...s.folded, left: fold, right: fold };
        save('tonarium.folded', folded);
        return { folded };
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode]);
  return (
    <div ref={root} className={`world ${mode} ${worldKind === 'fantasy' ? 'fantasy-world' : ''} ${locked ? 'locked' : ''} ${folded.left ? 'fl' : ''} ${folded.right ? 'fr' : ''} ${phone ? `phone pt-${phoneTab}` : ''}`}>
      {worldKind === 'fantasy' ? (
        <Suspense fallback={null}><FantasyPanel socialOpen={fantasySocial} onSocialToggle={() => setFantasySocial((v) => !v)} /></Suspense>
      ) : mode === '3d' ? (
        <Suspense fallback={<View3DFallback />}>
          <View3D />
        </Suspense>
      ) : <MapLayer />}
      <WindowLayer />
      <PortraitCanvas />
      <div className="front">
        {worldKind === 'survivors' && mode === '3d' && <SurvivorPanel overlay />}
        <WorldBadge />
        {(worldKind !== 'fantasy' || fantasySocial || phone) && <NearList />}
        {worldKind !== 'fantasy' && <FaceStrip />}
        {(worldKind !== 'fantasy' || fantasySocial || phone) && <NoticeLog />}
        {worldKind !== 'fantasy' && mode === '3d' ? <div className="view3d-hud"><KeyHelp /><StatusChips /></div> : <StatusChips />}
        <Dock />
        {phone && <PhoneTabs />}
      </div>
      <AdAudio />
      <Toast />
      <NewArrivals />
      {dragging && <DropHint />}
      <SwitchLoading />
      <WorldLoading />
      <WorldCountdown />
      <ConfirmClose />
      <ConfirmWorld />
      <ConfirmOpen />
      <ProfileCard />
      <SessionMenu />
      <HitFxLayer root={root} />
    </div>
  );
}
