import { t as tr } from '../i18n/index.ts';
import { useOwnedItems } from '../market/items.ts';
import { OriginBadge } from '../market/OriginBadge.tsx';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Participant } from '../../../shared/protocol.ts';
import { ITEM_INFO } from '../i18n/static.ts';
import { ONLY_3D, type Item, type ItemKind } from '../../../shared/items.ts';
import { isCameraTimerItem } from '../../../shared/camera-timer-demo.ts';
import { useStore, get, set, save, nameOf, heldHammer } from '../store.ts';
import { follow, goNear, poke } from '../actions.ts';
import { dropHammer, hitAndMove, itemAction, removeItem, spawnItem } from '../items/actions.ts';
import { requestTimedCamera } from '../items/useTimedCamera.ts';
import { formatDistance, useTrend } from '../spatial.ts';
import { Icon } from './Icon.tsx';
import { GuestMark } from './GuestMark.tsx';
import { ImageItemMark } from './ImageItemMark.tsx';
import { imageItemCreator } from './imageItemCreator.ts';
import {
  BANDS, Badge3D, Face, ItemMark, Popover, glowStyle, itemLabel, useItemsNear, usePlayers, windowKeyOf,
  type Band, type PlayerEntry,
} from './common.tsx';
import { openWindow, toggleFromList, useIsOpen } from './windows.ts';
import { PeerVolume } from './VolumeMenus.tsx';
import { EmoteBadge } from './Emotes.tsx';
import { SystemItemPanel } from '../systems/SystemItem.tsx';
import { copySessionUrl } from '../sessionLinks.ts';

type Menu = { kind: 'user'; id: string; rect: DOMRect } | { kind: 'item'; id: string; rect: DOMRect };

/** 行クリック：ハンマーを持っていれば叩く、それ以外はプロフィール */
export function pickUser(id: string) {
  const s = get();
  if (s.mode === '2d' && heldHammer(s) && id !== s.selfId) hitAndMove(id);
  else set({ profileOf: id });
}

function LiveButton({ u, small = false }: { u: Participant; small?: boolean }) {
  const open = useIsOpen('share');
  const sharer = useStore((s) => s.sharer);
  if (!u.sharing || sharer !== u.id) return null;
  return (
    <button
      className={`livebtn ${small ? 'small' : ''}`} onClick={(e) => { e.stopPropagation(); toggleFromList('share'); }}
      title={open ? tr("ui586") : tr("ui587")}
    >
      <span className="lb"><Icon name="screen" size={11} stroke={2.4} />{tr("ui588")}</span>
      {open && <span className="lbon"><Icon name="eye" size={12} stroke={2.4} /></span>}
    </button>
  );
}

function Equip({ id }: { id: string }) {
  const held = useStore((s) => Object.values(s.items).find((i) => (i.kind === 'hammer' || i.kind === 'camera') && i.holder === id));
  if (!held) return null;
  const info = ITEM_INFO[held.kind];
  return (
    <span className="equip" title={tr("ui599", info.name)} style={{ background: info.tint, color: info.ink }}>
      <span className="em">{info.mark}</span>{tr("ui600")}</span>
  );
}

function statusOf(u: Participant, friends: string[]) {
  const parts: string[] = [];
  if (friends.includes(u.id)) parts.push(tr("ui153"));
  if (!u.micOn) parts.push(tr("ui601"));
  if (u.follow) parts.push(tr("ui602", nameOf(u.follow)));
  return parts.join(' · ');
}

const SPEAK_RING = '0 0 0 2px #fff, 0 0 0 4px var(--speak)';

function PlayerRow({ e, onMenu, menuOpen, onVolume }: { e: PlayerEntry; onMenu: (r: DOMRect) => void; menuOpen: boolean; onVolume: (r: DOMRect) => void }) {
  const speaking = useStore((s) => !!s.speaking[e.user.id]);
  const friends = useStore((s) => s.friends);
  const hammer = useStore((s) => s.mode === '2d' && !!heldHammer(s));
  const trend = useTrend(e.user.id);
  const u = e.user;
  const status = statusOf(u, friends);
  const muted = useStore((s) => s.peerMuted.includes(u.id));
  const context = (ev: React.MouseEvent) => { ev.preventDefault(); onVolume(new DOMRect(ev.clientX, ev.clientY, 0, 0)); };
  const ring = speaking ? SPEAK_RING : undefined;
  const menuBtn = (
    <button
      className={`ib more ${menuOpen ? 'on' : ''}`} aria-label={tr("ui603", u.name)} aria-haspopup="menu" aria-expanded={menuOpen}
      data-popanchor onClick={(ev) => onMenu(ev.currentTarget.getBoundingClientRect())}
    ><Icon name="more" /></button>
  );
  if (e.band === 'far') {
    return (
      <button className="farchip ib" data-uid={u.id} title={formatDistance(e.d)} onClick={() => pickUser(u.id)} onContextMenu={context} style={glowStyle(trend)}>
        <Face id={u.id} name={u.name} size={20} />{u.name}<GuestMark guest={u.guest} />{u.mode === '3d' && <Badge3D />}
        <EmoteBadge id={u.id} />
      </button>
    );
  }
  const big = e.band === 'near';
  return (
    <div className={`prow ${big ? 'big' : ''} ${e.child ? 'child' : ''} ${menuOpen ? 'menuon' : ''} ${hammer ? 'hittable' : ''}`} data-uid={u.id} style={glowStyle(trend)} onContextMenu={context}>
      {e.child && <span className="branch" aria-hidden="true" />}
      <button className="pmain" onClick={() => pickUser(u.id)} aria-label={hammer ? tr("ui582", u.name) : tr("ui584", u.name)}>
        <Face id={u.id} name={u.name} size={big ? 32 : 22} ring={ring} />
        <span className="ptext">
          <span className="pname">{u.name}<GuestMark guest={u.guest} />{u.mode === '3d' && <Badge3D />}{!big && status && <span className="pstat">{status}</span>}</span>
          {big && status && <span className="pstat">{status}</span>}
        </span>
        <Equip id={u.id} />
        <EmoteBadge id={u.id} />
        {muted && <span className="pmuted" title={tr("ui604")}><Icon name="volumeOff" size={14} /></span>}
      </button>
      <LiveButton u={u} small={!big} />
      <span className="dist">{formatDistance(e.d)}</span>
      {menuBtn}
    </div>
  );
}

function ItemRow({ item, d, band, heldBy, onMenu, menuOpen }: {
  item: Item; d: number; band: Band; heldBy: string | null; onMenu: (r: DOMRect) => void; menuOpen: boolean;
}) {
  const camFeeds = useStore((s) => s.camFeeds);
  const selfId = useStore((s) => s.selfId);
  useStore((s) => s.participants);
  const creatorName = useStore((s) => imageItemCreator(item, s.users));
  const key = windowKeyOf(item, camFeeds);
  const attn = useStore((s) => (s.attention[item.id] ?? 0) > performance.now());
  const open = useIsOpen(key ?? '');
  const label = itemLabel(item, creatorName);
  const mark = (size: number) => item.kind === 'image'
    ? <ImageItemMark key={`${item.id}:${item.url}`} item={item} size={size} label={label} />
    : <ItemMark item={item} size={size} />;
  if (band === 'far') {
    return (
      <button className="farchip ib" title={formatDistance(d)} onClick={() => key && openWindow(key)}>
        {mark(20)}{label}
      </button>
    );
  }
  const big = band === 'near';
  const status = heldBy ? (heldBy === selfId ? tr("ui605") : tr("ui606", nameOf(heldBy))) : '';
  return (
    <div className={`prow item ${big ? 'big' : ''} ${open ? 'winon' : ''} ${menuOpen ? 'menuon' : ''} ${attn ? 'attn' : ''}`}>
      <button className="pmain" data-popanchor onClick={(ev) => (key ? openWindow(key) : onMenu(ev.currentTarget.getBoundingClientRect()))}>
        {mark(big ? 32 : 22)}
        <span className="ptext">
          <span className="pname">{label}{!big && status && <span className="pstat">{status}</span>}</span>
          {big && status && <span className="pstat">{status}</span>}
        </span>
      </button>
      {item.kind === 'camera' && item.live && (
        <span className="livechip" title={tr("ui607", nameOf(item.operator))}><i />LIVE</span>
      )}
      {key && (open
        ? <button className="showing" onClick={() => toggleFromList(key)} title={tr("ui608")}><Icon name="window" size={11} stroke={2.4} />{tr("ui609")}</button>
        : <button className="openbtn" onClick={() => openWindow(key)}>{tr("ui598")}</button>)}
      <span className="dist">{heldBy === selfId ? tr("ui610") : formatDistance(d)}</span>
      <button
        className={`ib more ${menuOpen ? 'on' : ''}`} aria-label={tr("ui603", label)} aria-haspopup="menu" data-popanchor
        onClick={(ev) => onMenu(ev.currentTarget.getBoundingClientRect())}
      ><Icon name="more" /></button>
    </div>
  );
}

function BandHead({ band }: { band: Band }) {
  const b = BANDS.find((x) => x.band === band)!;
  return <h3 className="bandhead"><span className="dot" style={{ background: b.dot }} />{b.label}<span className="range">{b.range}</span></h3>;
}

function Bands<T extends { band: Band }>({ list, render }: { list: T[]; render: (x: T) => React.ReactNode }) {
  return (
    <>
      {BANDS.map(({ band }) => {
        const rows = list.filter((x) => x.band === band);
        if (!rows.length) return null;
        return (
          <section key={band} className="band">
            <BandHead band={band} />
            {band === 'far' ? <div className="farchips">{rows.map(render)}</div> : rows.map(render)}
          </section>
        );
      })}
    </>
  );
}

function MenuItem({ icon, label, onClick, disabled }: { icon: Parameters<typeof Icon>[0]['name']; label: string; onClick: () => void; disabled?: boolean }) {
  return <button role="menuitem" className="ib menuitem" disabled={disabled} onClick={onClick}><Icon name={icon} />{label}</button>;
}

function ActionMenu({ menu, onClose }: { menu: Menu; onClose: () => void }) {
  const s = useStore(useShallow((st) => ({
    participants: st.participants, selfId: st.selfId, items: st.items, camFeeds: st.camFeeds, mode: st.mode,
  })));
  const me = s.participants.find((p) => p.id === s.selfId);
  const run = (f: () => void) => () => { f(); onClose(); };
  if (menu.kind === 'user') {
    const u = s.participants.find((p) => p.id === menu.id);
    if (!u) return null;
    const canFollow = me?.mode === '2d' && u.mode === '3d';
    const following = me?.follow === u.id;
    return (
      <Popover anchor={menu.rect} onClose={onClose} className="menu">
        <span className="menutitle">{u.name}</span>
        <MenuItem icon="near" label={tr("ui611")} onClick={run(() => goNear(u.id))} />
        {canFollow && <MenuItem icon="follow" label={following ? tr("ui612") : tr("ui613")} onClick={run(() => follow(following ? null : u.id))} />}
        <MenuItem icon="poke" label={tr("ui581")} onClick={run(() => poke(u.id))} />
        <MenuItem icon="user" label={tr("ui585")} onClick={run(() => pickProfile(u.id))} />
      </Popover>
    );
  }
  const it = s.items[menu.id];
  if (!it) return null;
  const key = windowKeyOf(it, s.camFeeds);
  if (it.mapPlacement?.mode === 'system') return <Popover anchor={menu.rect} onClose={onClose} className="menu">
    <span className="menutitle">{itemLabel(it)}</span>
    <MenuItem icon="near" label={tr("ui611")} onClick={run(() => goNear(`item:${it.id}`))} />
    <MenuItem icon="window" label={tr("ui617")} onClick={run(() => openWindow(`item:${it.id}`))} />
    <SystemItemPanel item={it} />
    {isCameraTimerItem(it) && <MenuItem icon="trash" label={tr("ui618")} onClick={run(() => removeItem(it.id))} />}
  </Popover>;
  const holder = 'holder' in it ? it.holder : null;
  const iHold = !!heldHammer(s);
  return (
    <Popover anchor={menu.rect} onClose={onClose} className="menu">
      <span className="menutitle">{itemLabel(it)}</span>
      <MenuItem icon="near" label={tr("ui611")} onClick={run(() => goNear(`item:${it.id}`))} />
      {it.kind === 'camera' && it.variant === 'camera-timer' && s.mode === '3d' && <MenuItem icon="camera"
        label={tr('cameraTimerShoot')} disabled={!!it.timerState?.systems.find(system => system.instanceId === 'camera-shot')?.state.busy}
        onClick={run(() => requestTimedCamera(it.id))} />}
      {it.kind === 'hammer' && !holder && <MenuItem icon="hand" label={tr("ui614")} disabled={iHold} onClick={run(() => itemAction(it.id, { a: 'pick' }))} />}
      {it.kind === 'hammer' && holder === s.selfId && <MenuItem icon="hand" label={tr("ui615")} onClick={run(dropHammer)} />}
      {key && <MenuItem icon="window" label={it.kind === 'camera' ? tr("ui616") : tr("ui617")} onClick={run(() => openWindow(key))} />}
      {!holder && <MenuItem icon="trash" label={tr("ui618")} onClick={run(() => removeItem(it.id))} />}
    </Popover>
  );
}

export const pickProfile = (id: string) => set({ profileOf: id });

function ItemPicker({ anchor, onClose }: { anchor: DOMRect; onClose: () => void }) {
  const mode = useStore((s) => s.mode);
  const entries = useOwnedItems();
  const [sel, setSel] = useState('chess');
  const selected = entries.find((x) => x.id === sel) ?? entries[0];
  const info = selected.info;
  const disabledOf = (k: ItemKind) => !!ONLY_3D[k] && mode !== '3d';
  return (
    <Popover anchor={anchor} onClose={onClose} className="picker">
      <div className="pickgrid">
        <div className="pickhead"><b>{tr("ui619")}</b><span>{entries.length}</span></div>
        <div className="grid3">
          {entries.map((entry) => {
            const i = entry.info;
            const disabled = disabledOf(entry.kind);
            return (
              <div key={entry.id} className="market-entry"><button
                className={`owned ${sel === entry.id ? 'sel' : ''} ${disabled ? 'dis' : ''}`} aria-pressed={sel === entry.id}
                title={disabled ? tr("ui620") : undefined} onClick={() => setSel(entry.id)}
              >
                <span className="itemmark" style={{ width: 34, height: 34, background: i.tint, color: i.ink, fontSize: i.mark.length > 2 ? 10 : 15, borderRadius: 10 }}>{i.mark}</span>
                <span className="oname">{i.name}</span>
                {!i.in2d && <span className="only3d">{tr("ui621")}</span>}
              </button><OriginBadge productId={entry.productId} onOpen={onClose} /></div>
            );
          })}
        </div>
      </div>
      <section className="pickdetail" aria-label={tr("ui622", info.name)}>
        <div className="thumb" style={{ background: info.tint, color: info.ink }}><span>{info.mark}</span></div>
        <h3>{info.name}</h3>
        <code>itemId: {selected.id}</code>
        <span className="sub">{tr("ui371")}{selected.creator}</span>
        <p>{info.desc}</p>
        <div className="tags">
          {info.in2d && <span>{tr("ui311")}</span>}
          {info.in3d && <span>{tr("ui312")}</span>}
          <span className="genre" style={{ background: info.tint, color: info.ink }}>{info.genre}</span>
        </div>
        <span className="spacer" />
        <button
          className="primary big" disabled={disabledOf(selected.kind)}
          onClick={() => { spawnItem(selected.kind, selected.text, undefined, selected.variant); onClose(); }}
        ><Icon name="plus" size={14} stroke={2.4} />{disabledOf(selected.kind) ? tr("ui623") : tr("ui197")}</button>
      </section>
    </Popover>
  );
}

function SessionCopyButton() {
  const session = useStore((s) => s.session);
  if (!session) return null;
  return <button type="button" className="ib session-copy" aria-label={tr('sessionLinkCopy')} title={tr('sessionLinkCopy')}
    onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}
    onClick={(e) => { e.stopPropagation(); void copySessionUrl(session); }}><Icon name="link" size={20} /></button>;
}

export function NearList() {
  const folded = useStore((s) => s.folded.left);
  const selfId = useStore((s) => s.selfId);
  const selfName = useStore((s) => s.selfName);
  const mode = useStore((s) => s.mode);
  const me = useStore((s) => s.participants.find((p) => p.id === s.selfId));
  const selfSpeaking = useStore((s) => !!s.speaking[s.selfId]);
  const players = usePlayers();
  // 自分についてきている人は、ほかの人と同じく自分の行の子として並べる
  const followers = players.filter((e) => e.user.follow === selfId).map((e) => ({ ...e, band: 'mid' as const, child: true }));
  const others = players.filter((e) => e.user.follow !== selfId);
  const items = useItemsNear();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [picker, setPicker] = useState<DOMRect | null>(null);
  const [vol, setVol] = useState<{ id: string; name: string; rect: DOMRect } | null>(null);
  const playerRow = (e: PlayerEntry) => (
    <PlayerRow
      key={e.user.id} e={e} menuOpen={menu?.kind === 'user' && menu.id === e.user.id}
      onMenu={(rect) => setMenu(menu?.id === e.user.id ? null : { kind: 'user', id: e.user.id, rect })}
      onVolume={(rect) => { setMenu(null); setVol({ id: e.user.id, name: e.user.name, rect }); }}
    />
  );
  const fold = (left: boolean) => set((s) => { const f = { ...s.folded, left }; save('tonarium.folded', f); return { folded: f }; });

  if (folded) {
    return (
      <div className="foldedpanel left">
        <button type="button" className="ib folded-summary" onClick={() => fold(false)} aria-label={tr("ui624")}>
          <Icon name="right" size={14} stroke={2.4} />
          <span className="fp"><Icon name="people" size={18} /><b>{players.length + 1}</b></span>
          <span className="fpline" />
          <span className="fp"><Icon name="box" size={18} /><b>{items.length}</b></span>
        </button>
        <SessionCopyButton />
      </div>
    );
  }
  return (
    <aside className="panel nearlist" aria-label={tr("ui625")}>
      <div className="phead">
        <h2>{tr("ui626")}</h2><span className="count">{players.length + 1}</span>
        <button className="ib" onClick={() => fold(true)} aria-label={tr("ui627")}><Icon name="left" size={15} /></button>
      </div>
      <div className="pscroll">
        <div className="selfrow" data-uid={selfId}>
          <Face id={selfId} name={selfName} size={32} ring={selfSpeaking ? SPEAK_RING : undefined} />
          <span className="pname">{selfName}<GuestMark guest={!!me?.guest} /></span>
          <EmoteBadge id={selfId} />
          {me && <LiveButton u={me} />}
          <span className="pill dark">{tr("ui84")}</span>
          <span className="pill">{mode.toUpperCase()}</span>
        </div>
        {followers.map(playerRow)}
        <Bands list={others} render={playerRow} />
        {!players.length && <div className="empty">{tr("ui496")}</div>}
      </div>
      <div className="psplit" aria-hidden="true"><span /></div>
      <div className="phead">
        <h2>{tr("ui154")}</h2><span className="count">{items.length}</span>
        <button className="dark small" data-popanchor aria-haspopup="dialog" aria-expanded={!!picker}
          onClick={(e) => setPicker(picker ? null : e.currentTarget.getBoundingClientRect())}
        ><Icon name="plus" size={14} stroke={2.4} />{tr("ui628")}</button>
      </div>
      <div className="iscroll">
        <Bands
          list={items}
          render={(x) => (
            <ItemRow
              key={x.item.id} {...x} menuOpen={menu?.kind === 'item' && menu.id === x.item.id}
              onMenu={(rect) => setMenu(menu?.id === x.item.id ? null : { kind: 'item', id: x.item.id, rect })}
            />
          )}
        />
        {!items.length && <div className="empty">{tr("ui629")}</div>}
      </div>
      <div className="session-copy-row"><SessionCopyButton /></div>
      {menu && <ActionMenu menu={menu} onClose={() => setMenu(null)} />}
      {picker && <ItemPicker anchor={picker} onClose={() => setPicker(null)} />}
      {vol && <PeerVolume key={vol.id} id={vol.id} name={vol.name} anchor={vol.rect} onClose={() => setVol(null)} />}
    </aside>
  );
}
