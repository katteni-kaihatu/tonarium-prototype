import { t as tr } from '../i18n/index.ts';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { ITEM_INFO } from '../i18n/static.ts';
import { NOTE_COLORS, type Item } from '../../../shared/items.ts';
import { useStore, get, nameOf, type Win } from '../store.ts';
import { useDistanceLabel } from '../spatial.ts';
import { PANELS } from '../items/panels.ts';
import { PanelCanvas } from '../items/PanelCanvas.tsx';
import { editNote, removeItem } from '../items/actions.ts';
import { camHolder, camVideos } from '../net/livekit.ts';
import { ShareVideoHost } from '../ShareVideo.tsx';
import { follow, selectNote } from '../actions.ts';
import { Icon } from './Icon.tsx';
import { ItemMark, Viewers, itemLabel } from './common.tsx';
import { closeWindow, moveWindow, raiseWindow, toggleMax } from './windows.ts';
import { AvatarView } from './Portraits.tsx';
import { PortraitEmote } from './Emotes.tsx';
import { MediaControls, VideoHost, mediaVolume, videoEls } from '../mediaSync.tsx';
import { YouTubePlayer, youTubeDuration } from '../youtube.tsx';
import { send } from '../net/ws.ts';
import { DiceBody } from './DiceBody.tsx';
import { TelephoneBody } from '../items/TelephoneBody.tsx';
import { SurvivorLibrary, SurvivorPanel } from './SurvivorPanel.tsx';
import { AntimatterSpaceWindowBody, AntimatterWindowBody } from './antimatter/windowBodies.tsx';

const BAR = 40;
type Kind = 'video' | 'panel' | 'note' | 'media' | 'face' | 'dice' | 'survivor';
/** noMax: 最大化しない（顔はアバターのキャンバスの下に隠れてしまうため） */
interface Resolved { kind: Kind; dark: boolean; title: string; sub: React.ReactNode; item?: Item; body: React.ReactNode; aspect?: number; width: number; noMax?: boolean; noClose?: boolean }

function UserDist({ id }: { id: string }) {
  return <>{useDistanceLabel('user', id)}</>;
}

function ItemDist({ id }: { id: string }) {
  return <>{useDistanceLabel('item', id)}</>;
}

function CamVideoHost({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const feed = useStore((s) => s.camFeeds[id]);
  useEffect(() => {
    const el = camVideos.get(id);
    if (!el || !ref.current) return;
    ref.current.appendChild(el);
    void el.play().catch(() => {});
    return () => { camHolder.appendChild(el); void el.play().catch(() => {}); };
  }, [id, feed]);
  return <div ref={ref} className="videohost" />;
}

function NoteBody({ note }: { note: Item & { kind: 'note' } }) {
  const selfId = useStore((s) => s.selfId);
  useStore((s) => s.participants);
  const lockedByOther = note.editingBy && note.editingBy !== selfId;
  return (
    <div className="notebody" style={{ background: note.color }}>
      <textarea
        value={note.text} placeholder={tr("ui827")} aria-label={tr("ui537")}
        onFocus={() => selectNote(note.id)} onBlur={() => selectNote(null)}
        onChange={(e) => editNote(note.id, { text: e.target.value })}
      />
      <div className="notefoot">
        {NOTE_COLORS.map((c) => (
          <button key={c} className="swatch" style={{ background: c }} aria-label={tr("ui828")} onClick={() => editNote(note.id, { color: c })} />
        ))}
        <span className="spacer" />
        <span className="sub">{lockedByOther ? tr("ui829", nameOf(note.editingBy)) : tr("ui830", nameOf(note.updatedBy))}</span>
      </div>
    </div>
  );
}

/** 開けなくなったもの（アイテムが片付けられた、配信が終わった等）は null */
function useResolved(key: string, compact: boolean): Resolved | null {
  const { sharer, camFeeds, participants, selfId, items, users, survivor, speaking } = useStore(useShallow((s) => ({
    sharer: s.sharer,
    camFeeds: s.camFeeds,
    participants: s.participants,
    selfId: s.selfId,
    items: s.items,
    users: s.users,
    survivor: s.survivors[s.session ?? ''],
    speaking: key.startsWith('face:') ? !!s.speaking[key.slice(5)] : false,
  })));
  const name = (id: string | null) => (id ? users.find((p) => p.id === id)?.name ?? tr("ui74") : '');
  const at = (id: string) => <UserDist id={id} />;
  if (key === 'survivors') return { kind: 'survivor', dark: true, title: tr("ui535"), sub: survivor?.phase === 'running' || survivor?.phase === 'boss' ? tr("ui831") : tr("ui832"), width: 680, aspect: 1.28, noClose: true, body: <SurvivorPanel /> };
  if (key === 'survivor-library') return { kind: 'survivor', dark: true, title: tr("ui833"), sub: tr("ui834"), width: 620, aspect: 1.05, body: <SurvivorLibrary /> };
  if (key === 'antimatter') return { kind: 'survivor', dark: true, title: tr('mergeAdLab'), sub: tr('mergeAdProgress'), width: 720, aspect: 1.2, body: <AntimatterWindowBody /> };
  if (key === 'antimatter-space') return { kind: 'survivor', dark: true, title: tr('mergeAdSpace'), sub: tr('mergeAdSpaceHint'), width: 520, body: <AntimatterSpaceWindowBody /> };
  if (key === 'share') {
    if (!sharer) return null;
    return { kind: 'video', dark: true, title: tr("ui835", name(sharer)), sub: at(sharer), body: <ShareVideoHost className="videohost" />, width: 780, aspect: 16 / 9 };
  }
  if (key.startsWith('view:')) {
    const uid = key.slice(5);
    if (!camFeeds[key]) return null;
    return {
      kind: 'video', dark: true, title: tr("ui836", name(uid)), sub: tr("ui837"), width: 480, aspect: 16 / 9,
      body: (
        <>
          <CamVideoHost id={key} />
          <button className="onvideo" onClick={() => { follow(null); closeWindow(key); }}>{tr("ui612")}</button>
        </>
      ),
    };
  }
  if (key.startsWith('face:')) {
    const u = participants.find((p) => p.id === key.slice(5));
    if (!u) return null;
    const self = u.id === selfId;
    return {
      kind: 'face', dark: false, title: self ? tr("ui838", u.name) : u.name, sub: self ? tr("ui839", u.mode.toUpperCase()) : at(u.id),
      width: 480, aspect: 4 / 3, noMax: true,
      body: <div className={`facewin ${speaking ? 'speaking' : ''}`}><AvatarView u={u} speaking={speaking} comic /><PortraitEmote id={u.id} announcementOnly /></div>,
    };
  }
  const id = key.slice(key.indexOf(':') + 1);
  const item = items[id];
  if (!item) return null;
  const sub = <>{item.createdBy === selfId ? tr("ui84") : name(item.createdBy)} {tr("ui840")}<ItemDist id={item.id} /></>;
  if (key.startsWith('cam:')) {
    if (item.kind !== 'camera' || !item.live || !camFeeds[id]) return null;
    return {
      kind: 'video', dark: true, item, title: tr("ui841", ITEM_INFO.camera.name, name(item.operator)), sub, width: 480, aspect: 16 / 9,
      body: <><CamVideoHost id={id} /><span className="onlive"><i />LIVE</span></>,
    };
  }
  if (item.kind === 'image') {
    return { kind: 'media', dark: true, item, title: tr("ui31"), sub, width: 560, aspect: item.w / item.h, body: <img className="mediaimg" src={item.url} alt="" /> };
  }
  if (item.kind === 'video') {
    return {
      kind: 'media', dark: true, item, title: tr("ui30"), sub, width: 560, aspect: item.w / item.h,
      body: <><VideoHost id={item.id} /><MediaControls item={item} duration={() => videoEls.get(item.id)?.duration ?? NaN} /></>,
    };
  }
  if (item.kind === 'youtube') {
    return {
      kind: 'media', dark: true, item, title: item.title || 'YouTube', sub, width: 640, aspect: 16 / 9,
      body: <><YouTubePlayer item={item} volume={() => mediaVolume(item)} /><MediaControls item={item} duration={() => youTubeDuration(item.id)} /></>,
    };
  }
  if (item.kind === 'dice') return { kind: 'dice', dark: false, item, title: ITEM_INFO.dice.name, sub, width: 400, body: <DiceBody item={item} interactive={!compact} /> };
  if (item.kind === 'telephone') return { kind: 'panel', dark: false, item, title: ITEM_INFO.telephone.name, sub, width: 640,
    body: compact ? <p>お絵描き伝言・{item.game.phase === 'playing' ? `工程 ${item.game.step + 1}` : item.game.phase === 'results' ? '結果鑑賞' : '参加受付'}</p>
      : <TelephoneBody item={item} interactive /> };
  // 入口だけのアイテム。開くのはワールド版と同じ自分の AD パネル
  if (item.kind === 'antimatter') return {
    kind: 'survivor', dark: true, item, title: 'AD 研究所', sub, width: 720, aspect: 1.2,
    body: compact
      ? <div style={{ padding: 16, color: '#e9e5f5' }}>AD 研究所 — クリックで大きく表示</div>
      : <AntimatterWindowBody />,
  };
  if (item.kind === 'bike') return { kind: 'panel', dark: false, item, title: ITEM_INFO.bike.name, sub, width: 360, body: <p>{ITEM_INFO.bike.desc}</p> };
  if (item.kind === 'note') return { kind: 'note', dark: false, item, title: itemLabel(item), sub, width: 320, body: <NoteBody note={item} /> };
  const panel = PANELS[item.kind];
  if (!panel) return null;
  return { kind: 'panel', dark: false, item, title: ITEM_INFO[item.kind].name, sub, width: item.kind === 'g2048' ? 320 : 460, aspect: panel.w / panel.h, body: <PanelCanvas item={item} interactive={!compact} /> };
}

/** compact はカンタンモードで下に並ぶ小さいウィンドウ。押すと大きい方と入れ替わる */
function WindowFrame({ win, region, simple, z, compact = false }: {
  win: Win; region: { w: number; h: number }; simple: boolean; z: number; compact?: boolean;
}) {
  const r = useResolved(win.key, compact);
  const maxWin = useStore((s) => s.maxWin);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const gone = !r;
  useEffect(() => { if (gone) closeWindow(win.key); }, [gone, win.key]);
  if (!r) return null;
  const max = maxWin === win.key && !r.noMax;
  const createdBy = r.item ? { id: r.item.createdBy, name: nameOf(r.item.createdBy) } : undefined;

  // カンタンモードは使える範囲いっぱいに、フリーモードは既定の幅で置く
  let width = r.width;
  let height: number | undefined;
  if (compact) { width = 180; height = 112; }
  else if (max) { width = window.innerWidth; height = window.innerHeight; }
  else if (simple) {
    if (r.aspect) {
      width = Math.min(region.w, (region.h - BAR) * r.aspect);
      height = width / r.aspect + BAR;
    } else width = Math.min(region.w, 420);
  } else if (r.aspect && r.kind !== 'panel') height = width / r.aspect + BAR;

  // AD は長い操作パネルなので、フリー配置でも画面内に収めて本文をスクロールできるようにする。
  const boundedAD = !simple && !max && (win.key === 'antimatter' || r.item?.kind === 'antimatter');
  let left = win.x;
  let top = win.y;
  if (boundedAD) {
    width = Math.min(width, Math.max(1, region.w - 16));
    height = Math.min(height ?? region.h, Math.max(BAR, region.h - 16));
    left = Math.max(8, Math.min(left, region.w - width - 8));
    top = Math.max(8, Math.min(top, region.h - height - 8));
  }

  const style: React.CSSProperties = max && !compact
    ? { position: 'fixed', left: 0, top: 0, width, height, zIndex: 44 }
    : simple ? { width, height } : { position: 'absolute', left, top, width, height, zIndex: z };

  const onDown = (e: React.PointerEvent) => {
    raiseWindow(win.key);
    if (simple || max || (e.target as Element).closest('button')) return;
    drag.current = { sx: e.clientX, sy: e.clientY, ox: left, oy: top };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 合成イベントなど */ }
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    moveWindow(win.key, Math.max(-200, Math.min(window.innerWidth - 120, d.ox + e.clientX - d.sx)), Math.max(0, Math.min(window.innerHeight - BAR, d.oy + e.clientY - d.sy)));
  };
  const onUp = () => { drag.current = null; };

  // 最大化したウィンドウは前面のパネルより上に出す（ウィンドウ層の中だと重なり順で負ける）
  const frame = (
    <section
      className={`win ${r.dark ? 'dark' : ''} k-${r.kind} ${compact ? 'compact' : ''}`} style={style} aria-label={r.title}
      title={compact ? tr("ui842") : undefined} onPointerDown={() => raiseWindow(win.key)}
    >
      <div
        className={`winbar ${simple || max ? '' : 'draggable'}`} title={simple || max ? undefined : tr("ui843")}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      >
        {r.item ? <ItemMark item={r.item} size={compact ? 18 : 26} by={compact ? undefined : createdBy} /> : <span className="livedot" />}
        <span className="wtitle"><b>{r.title}</b><span>{r.sub}</span></span>
        <span className="spacer" />
        {compact
          ? !r.noClose && <button className="ib wbtn" onClick={(e) => { e.stopPropagation(); closeWindow(win.key); }} aria-label={tr("ui182")}><Icon name="close" size={12} /></button>
          : <WinButtons win={win} r={r} max={max} />}
      </div>
      <div className="winbody">{r.body}</div>
    </section>
  );
  return max && !compact ? createPortal(frame, document.body) : frame;
}

function AttentionButton({ keyName }: { keyName: string }) {
  const [cool, setCool] = useState(false);
  return (
    <button
      className="ib wbtn" disabled={cool} title={tr("ui844")} aria-label={tr("ui845")}
      onClick={() => { send({ t: 'attention', key: keyName }); setCool(true); setTimeout(() => setCool(false), 3000); }}
    ><Icon name="sparkle" size={15} /></button>
  );
}

function WinButtons({ win, r, max }: { win: Win; r: Resolved; max: boolean }) {
  return (
    <>
        <Viewers keyName={win.key} dark={r.dark} />
        {r.item && /^(item|cam):/.test(win.key) && <AttentionButton keyName={win.key} />}
        {r.item && r.kind !== 'video' && (
          <button className="ib wbtn" aria-label={tr("ui618")} title={tr("ui846")} onClick={() => removeItem(r.item!.id)}><Icon name="trash" size={14} /></button>
        )}
        {!r.noMax && <button className="ib wbtn" onClick={() => toggleMax(win.key)} aria-label={max ? tr("ui847") : tr("ui848")}><Icon name="maximize" size={14} /></button>}
        {!r.noClose && <button className="ib wbtn" onClick={() => closeWindow(win.key)} aria-label={tr("ui182")}><Icon name="close" size={14} /></button>}
    </>
  );
}

/** 背面のウィンドウ。2D では画面共有が始まったら自動で開く */
export function WindowLayer() {
  const windows = useStore((s) => s.windows);
  const winMode = useStore((s) => s.winMode);
  const mode = useStore((s) => s.mode);
  const visibleWindows = mode === '3d' ? windows.filter((w) => w.key !== 'survivors') : windows;
  const ref = useRef<HTMLDivElement>(null);
  const [region, setRegion] = useState({ w: 800, h: 500 });
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useLayoutEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRegion({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [winMode]);

  const front = visibleWindows[visibleWindows.length - 1];
  const frontItem = front?.key.startsWith('item:') ? get().items[front.key.slice(5)] : undefined;
  useEffect(() => {
    const panel = frontItem ? PANELS[frontItem.kind] : undefined;
    if (!frontItem || !panel?.key) return;
    const id = frontItem.id;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      const item = get().items[id];
      if (item && panel.key?.(e.key, item)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [frontItem?.id, frontItem?.kind]);

  const simple = winMode === 'simple';
  return (
    <>
      <div className={`winregion ${simple ? 'simple' : ''} ${mode}`}>
        {simple && (
          <>
            <div ref={ref} className="winstage">
              {front && <WindowFrame key={front.key} win={front} region={region} simple z={1} />}
            </div>
            {visibleWindows.length > 1 && (
              <div className="winstrip">
                {visibleWindows.slice(0, -1).map((w) => <WindowFrame key={w.key} win={w} region={region} simple z={1} compact />)}
              </div>
            )}
          </>
        )}
      </div>
      {!simple && (
        <div className="winfree">
          {visibleWindows.map((w, i) => <WindowFrame key={w.key} win={w} region={viewport} simple={false} z={i + 1} />)}
        </div>
      )}
    </>
  );
}
