import { t as tr } from '../i18n/index.ts';
import { SharedAssets3D } from '../shared-assets/SharedAssets3D.tsx';
import { SystemObjects3D } from '../systems/SystemObjects3D.tsx';
import { useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { NOTE_COLORS } from '../../../shared/items.ts';
import { useStore, get, heldCamera, worldKindOf } from '../store.ts';
import { selectNote } from '../actions.ts';
import { publishView } from '../net/livekit.ts';
import { editNote, moveItem, removeItem } from '../items/actions.ts';
import { recentlyHit } from '../items/effects.ts';
import { DEFAULT_EYE_HEIGHT } from '../../../shared/avatar.ts';
import { EyeHeightContext } from './eyeHeight.ts';
import { PlayerCamera } from './playerCamera.ts';
import { Player } from './Player.tsx';
import { AttentionGlow, Item3D } from './items3d.tsx';
import { CameraStreamer } from './camera3d.tsx';
import { CameraRecorder } from './CameraRecorder.tsx';
import { WORLD_BG, WorldMesh } from './worlds3d.tsx';
import { ShareDisplay } from './shareDisplay.tsx';
import { XRScene } from '../xr/XRScene.tsx';
export { Avatar3D, Entrance } from './Participants3D.tsx';
import { Avatar3D, Entrance } from './Participants3D.tsx';

function NoteEditor() {
  const id = useStore((s) => s.selectedNote);
  const note = useStore((s) => (id ? s.items[id] : undefined));
  if (note?.kind !== 'note' || note.mapPlacement?.mode === 'system') return null;
  const faceMe = () => {
    const a = get().selfAvatar;
    moveItem(note.id, note.x, note.z, Math.atan2(a.x - note.x, a.z - note.z));
  };
  return (
    <div className="noteeditor" data-xr-surface="note-editor" data-xr-min-width="360" data-xr-title="付箋の編集">
      <textarea
        autoFocus value={note.text} placeholder={tr("ui537")}
        style={{ background: note.color }}
        onChange={(e) => editNote(note.id, { text: e.target.value })}
      />
      <div className="row">
        {NOTE_COLORS.map((c) => (
          <button key={c} className="swatch" style={{ background: c }} onClick={() => editNote(note.id, { color: c })} />
        ))}
        <button className="small" onClick={faceMe}>{tr("ui538")}</button>
        <button className="small" onClick={() => removeItem(note.id)}>{tr("ui539")}</button>
        <button className="small" onClick={() => selectNote(null)}>{tr("ui73")}</button>
      </div>
      <small>{tr("ui540")}</small>
    </div>
  );
}

function ViewStreamer() {
  const { gl } = useThree();
  useEffect(() => {
    let stop: (() => Promise<void>) | null = null;
    let cancelled = false;
    publishView(gl.domElement)
      .then((s) => { if (cancelled) void s(); else stop = s; })
      .catch(() => { /* 通話に未接続なら配信しない */ });
    return () => { cancelled = true; void stop?.(); };
  }, [gl]);
  return null;
}

function Viewfinder() {
  const cam = useStore((s) => heldCamera(s));
  const flashAt = useStore((s) => s.flashAt);
  return (
    <>
      {cam && (
        <div className="viewfinder">
          <i className="tl" /><i className="tr" /><i className="bl" /><i className="br" />
          {cam.live && <div className="rec">{tr("ui541")}</div>}
        </div>
      )}
      {flashAt > 0 && <div key={flashAt} className="flash" />}
    </>
  );
}

function Crosshair() {
  const locked = useStore((s) => s.locked);
  const hint = useStore((s) => s.aimHint);
  const hitMe = useStore((s) => s.hits[s.selfId]);
  const [, tick] = useState(0);
  useEffect(() => {
    if (hitMe === undefined) return;
    const t = setTimeout(() => tick((n) => n + 1), 700);
    return () => clearTimeout(t);
  }, [hitMe]);
  return (
    <>
      {locked && <div className={`crosshair ${hint ? 'on' : ''}`} />}
      {locked && hint && <div className="aimhint">{hint}</div>}
      {recentlyHit(get().selfId) && <div className="hitme">{tr("ui542")}</div>}
    </>
  );
}

export function View3D() {
  const rig = useRef(new PlayerCamera()).current;
  const eyeHeight = useRef({ current: DEFAULT_EYE_HEIGHT, target: DEFAULT_EYE_HEIGHT });
  const avatarIds = useStore((s) => s.avatarIds);
  const items = useStore((s) => s.items);
  const locked = useStore((s) => s.locked);
  const selfId = useStore((s) => s.selfId);
  const viewLive = useStore((s) => !!s.participants.find((p) => p.id === s.selfId)?.viewLive);
  const world = useStore((s) => worldKindOf(s));
  const a0 = get().selfAvatar;
  return (
    <div className={`view3d ${locked ? 'locked' : ''}`}>
      {/* 街は端から端まで 170m ほどあるので遠くまで描く */}
      <EyeHeightContext.Provider value={eyeHeight}>
        <Canvas camera={{ fov: 70, near: 0.05, far: 300, position: [a0.x, eyeHeight.current.current, a0.z] }}>
          <SharedAssets3D />
          <SystemObjects3D />
          <color attach="background" args={[WORLD_BG[world]]} />
          <WorldMesh kind={world} />
          <ShareDisplay />
          <Entrance />
          {avatarIds.map((id) => <Avatar3D key={id} id={id} />)}
          <Avatar3D id={selfId} self rig={rig} />
          {Object.values(items).map((it) => <Item3D key={it.id} item={it} />)}
          {Object.values(items).map((it) => <AttentionGlow key={`attn-${it.id}`} item={it} />)}
          {Object.values(items).map((it) => (it.kind === 'camera' && it.live && it.operator === selfId
            ? <CameraStreamer key={`stream-${it.id}`} item={it} /> : null))}
          {viewLive && <ViewStreamer />}
          <Player rig={rig} />
          <XRScene rig={rig} />
        </Canvas>
      </EyeHeightContext.Provider>
      <Viewfinder />
      <CameraRecorder />
      <Crosshair />
      <NoteEditor />
    </div>
  );
}
