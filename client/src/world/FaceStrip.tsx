import { t as tr, useLanguage } from '../i18n/index.ts';
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Participant } from '../../../shared/protocol.ts';
import { useStore, get, set, save, heldHammer } from '../store.ts';
import { formatDistance } from '../spatial.ts';
import { recentlyHit } from '../items/effects.ts';
import { Icon } from './Icon.tsx';
import { Badge3D, Face, useLastSaid, usePlayers, type PlayerEntry } from './common.tsx';
import { AvatarView } from './Portraits.tsx';
import { PortraitEmote } from './Emotes.tsx';
import { pickProfile, pickUser } from './NearList.tsx';
import { openWindow, toggleFromList, useIsOpen } from './windows.ts';

const NEAR_MAX = 4;
const MID_MAX = 3;
const POKE_MS = 1100;

/** つんつんされた直後だけ true。終わったら描き直す */
function usePoked(id: string) {
  const at = useStore((s) => s.pokes[id]);
  const [, tick] = useState(0);
  const on = at !== undefined && performance.now() - at < POKE_MS;
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => tick((n) => n + 1), POKE_MS - (performance.now() - at!) + 30);
    return () => clearTimeout(t);
  }, [on, at]);
  return on ? at : null;
}

function PokeFx({ at, small = false }: { at: number; small?: boolean }) {
  return (
    <span key={at} className={`pokefx ${small ? 'small' : ''}`} aria-hidden="true">
      <span className="pokehand"><Icon name="poke" size={small ? 22 : 34} stroke={2.2} /></span>
      {!small && <span className="poketext">{tr("ui581")}</span>}
    </span>
  );
}

/** 顔を押すと、その人をウィンドウのように中央に大きく出す（ハンマーを持っていれば叩く） */
function clickFace(id: string) {
  const s = get();
  if (s.mode === '2d' && heldHammer(s) && id !== s.selfId) pickUser(id);
  else openWindow(`face:${id}`);
}

const BigFace = memo(function BigFace({ u, d, self = false, width }: { u: Participant; d: number; self?: boolean; width?: number }) {
  useLanguage();
  const poked = usePoked(u.id);
  const speaking = useStore((s) => !!s.speaking[u.id]);
  const sharer = useStore((s) => s.sharer);
  const hammer = useStore((s) => s.mode === '2d' && !!heldHammer(s));
  useStore((s) => s.hits[u.id]);
  const open = useIsOpen('share');
  const said = useLastSaid(u.id);
  const live = u.sharing && sharer === u.id;
  const canHit = hammer && !self;
  return (
    <div
      className={`bigface ${poked ? 'poked' : ''} ${self ? 'self' : ''} ${speaking ? 'speaking' : ''} ${open && live ? 'watching' : ''} ${recentlyHit(u.id) ? 'hit' : ''} ${canHit ? 'hittable' : ''}`}
      data-uid={u.id} style={width ? { width, flexBasis: width } : undefined}
    >
      <AvatarView u={u} speaking={speaking} />
      <PortraitEmote id={u.id} />
      {poked && <PokeFx at={poked} />}
      <button className="faceclick" onClick={() => clickFace(u.id)} aria-label={canHit ? tr("ui582", u.name) : tr("ui583", u.name)} />
      <button className="faceprofile" onClick={() => pickProfile(u.id)} aria-label={tr("ui584", u.name)} title={tr("ui585")}><Icon name="more" size={14} /></button>
      <div className="facebadges">
        {u.mode === '3d' && <Badge3D />}
        {live && (
          <button className="livebtn small" onClick={() => toggleFromList('share')} title={open ? tr("ui586") : tr("ui587")}>
            <span className="lb"><Icon name="screen" size={11} stroke={2.4} />{tr("ui588")}</span>
            {open && <span className="lbon"><Icon name="eye" size={12} stroke={2.4} /></span>}
          </button>
        )}
      </div>
      {said && <div className="bubble">{said}</div>}
      <div className="facelabel">
        <Face id={u.id} name={u.name} size={18} ring="0 0 0 1.5px #fff" />
        {speaking && <span className="spk"><Icon name="speaking" size={12} stroke={2.6} /></span>}
        {!u.micOn && <span className="spk off"><Icon name="micOff" size={12} /></span>}
        <b>{u.name}</b>
        <span className="d">{self ? tr("ui84") : formatDistance(d)}</span>
      </div>
    </div>
  );
});

const MidFace = memo(function MidFace({ p }: { p: PlayerEntry }) {
  useLanguage();
  const poked = usePoked(p.user.id);
  return (
    <button
      className={`midface ${poked ? 'poked' : ''}`} data-uid={p.user.id} onClick={() => clickFace(p.user.id)}
      title={`${p.user.name} · ${formatDistance(p.d)}`} aria-label={tr("ui583", p.user.name)}
    >
      <AvatarView u={p.user} speaking={false} small />
      <PortraitEmote id={p.user.id} small />
      <span className="mf"><Face id={p.user.id} name={p.user.name} size={16} ring="0 0 0 1.5px #fff" /></span>
      {p.user.mode === '3d' && <span className="mf3d">3D</span>}
      {poked && <PokeFx at={poked} small />}
    </button>
  );
});

/** タイルがいちばん大きくなる列数を選ぶ */
function gridTile(n: number, w: number, h: number, gap = 12) {
  let best = 0;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const tw = Math.min((w - (cols - 1) * gap) / cols, ((h - (rows - 1) * gap) / rows) * (4 / 3));
    best = Math.max(best, tw);
  }
  return Math.max(96, Math.min(420, Math.floor(best)));
}

/** ウィンドウを開いていないときは、声が届く人を画面中央に並べる（ビデオ通話のギャラリー風） */
function FaceGrid({ list }: { list: { user: Participant; d: number; self?: boolean }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const tile = gridTile(list.length, size.w, size.h);
  return (
    <div ref={ref} className="facegrid" aria-label={tr("ui589")}>
      <div className="facegridin">
        {list.map((x) => <BigFace key={x.user.id} u={x.user} d={x.d} self={x.self} width={tile} />)}
      </div>
    </div>
  );
}

export function FaceStrip() {
  const players = usePlayers();
  const folded = useStore((s) => s.folded.faces);
  // マップを背景にしているときは、マップが隠れないよう大きい顔は出さない
  const noWindows = useStore((s) => s.windows.length === 0 && s.mode === '2d' && s.mapMode === 'none');
  const me = useStore((s) => s.participants.find((p) => p.id === s.selfId));
  const near = players.filter((p) => p.band === 'near');
  const mid = players.filter((p) => p.band === 'mid');
  const fold = (faces: boolean) => set((s) => { const f = { ...s.folded, faces }; save('tonarium.folded', f); return { folded: f }; });
  if (!me) return null;
  if (folded) {
    return (
      <div className="facestrip">
        <button className="facepill" onClick={() => fold(false)} aria-label={tr("ui590")}>
          <span className="stack">{near.slice(0, 4).map((p) => <Face key={p.user.id} id={p.user.id} name={p.user.name} size={24} ring="0 0 0 2px #FFFDF9" />)}</span>
          <b>{tr("ui556")}{near.length}</b><span className="sub">{tr("ui591")}{mid.length}</span>
          <Icon name="down" size={14} stroke={2.4} />
        </button>
      </div>
    );
  }
  if (noWindows) return <FaceGrid list={[{ user: me, d: 0, self: true }, ...near, ...mid]} />;
  const rest = mid.slice(MID_MAX);
  return (
    <div className="facestrip">
      <div className="faces" aria-label={tr("ui592")}>
        <BigFace u={me} d={0} self />
        {near.slice(0, NEAR_MAX).map((p) => <BigFace key={p.user.id} u={p.user} d={p.d} />)}
        {mid.length > 0 && (
          <div className="midfaces">
            {mid.slice(0, MID_MAX).map((p) => <MidFace key={p.user.id} p={p} />)}
            {rest.length > 0 && (
              <span className="midmore" title={rest.map((r) => r.user.name).join('、')} aria-label={tr("ui593", rest.length)}>+{rest.length}</span>
            )}
          </div>
        )}
      </div>
      <button className="facefold" onClick={() => fold(true)} aria-label={tr("ui594")}><Icon name="up" size={14} stroke={2.4} /></button>
    </div>
  );
}
