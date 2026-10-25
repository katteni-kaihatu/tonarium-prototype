import { t as tr } from '../i18n/index.ts';
import { contentAvailable, productFor } from '../../../shared/market.ts';
import { useOwnedContent } from '../market/store.ts';
import { OriginBadge } from '../market/OriginBadge.tsx';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { EMOTES } from '../i18n/static.ts';
import { type EmoteId } from '../../../shared/emotes.ts';
import { useEmote } from '../emotes.ts';
import { get, useStore } from '../store.ts';
import { send } from '../net/ws.ts';
import { Popover } from './common.tsx';
import { Icon } from './Icon.tsx';
import { unlockEmoteAudio } from './sounds.ts';

const emoteStyle = (id: EmoteId): CSSProperties => ({ '--emote-ink': EMOTES[id].color, '--emote-tint': EMOTES[id].tint } as CSSProperties);

/** UI feedback stays visible even when the avatar is outside the viewport. */
export function EmoteBadge({ id }: { id: string }) {
  const emote = useEmote(id);
  if (!emote) return null;
  const info = EMOTES[emote.id];
  return <span key={emote.at} className="emote-badge" style={emoteStyle(emote.id)} title={info.name} role="status"><span aria-hidden="true">{info.mark}</span><span className="emote-badge-name">{info.name}</span></span>;
}

export function PortraitEmote({ id, small = false, announcementOnly = false }: { id: string; small?: boolean; announcementOnly?: boolean }) {
  const emote = useEmote(id);
  if (!emote) return null;
  const info = EMOTES[emote.id];
  if (announcementOnly) return <span className="sr" role="status">{info.name}</span>;
  return (
    <span key={emote.at} className={`portrait-emote emote-${emote.id} ${small ? 'compact' : ''}`} style={emoteStyle(emote.id)} role="status" aria-label={info.name}>
      <span className="emote-caption" aria-hidden="true">{small ? info.mark : info.caption}</span>
      {[0, 1, 2, 3].map((n) => <i key={n} className={`emote-particle particle-${n}`} aria-hidden="true">{info.particles}</i>)}
    </span>
  );
}

function EmotePicker({ anchor, onClose }: { anchor: DOMRect; onClose: () => void }) {
  const owned = useOwnedContent();
  const first = useRef<HTMLButtonElement>(null);
  const active = useStore((s) => s.emotes[s.selfId]);
  const connected = useStore((s) => s.sync === 'connected');
  const [pending, setPending] = useState(false);
  useEffect(() => { first.current?.focus(); }, []);
  useEffect(() => {
    if (active) setPending(false);
  }, [active]);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setPending(false), 3000);
    return () => clearTimeout(timer);
  }, [pending]);
  const choose = (id: EmoteId) => {
    if (get().sync !== 'connected' || active || pending) return;
    unlockEmoteAudio();
    setPending(true);
    send({ t: 'emote', id });
  };
  return (
    <Popover anchor={anchor} side="up" onClose={onClose} className="emote-picker">
      <div role="dialog" aria-label={tr("ui574")} onKeyDown={(e) => { if (e.key !== 'Escape') e.stopPropagation(); }}>
        <div className="emote-heading"><span><b>{tr("ui575")}</b><span className="sub">{tr("ui225")}</span></span><button className="ib" onClick={onClose} aria-label={tr("ui576")}><Icon name="close" size={16} /></button></div>
        <div className="emote-grid">
          {(Object.keys(EMOTES) as EmoteId[]).filter((id) => contentAvailable(owned, 'emotes', id)).map((id, i) => <div key={id} className="market-entry"><button
            ref={i === 0 ? first : undefined} className={`emote-option ${active?.id === id ? 'playing' : ''}`}
            style={emoteStyle(id)} disabled={!connected || !!active || pending} onClick={() => choose(id)}
          ><span className="emote-option-mark" aria-hidden="true">{EMOTES[id].mark}</span><b>{EMOTES[id].name}</b><span className="sub">{EMOTES[id].caption}</span></button><OriginBadge productId={productFor('emotes', id)?.id} onOpen={onClose} /></div>)}
        </div>
        <p className="emote-hint" role="status">{!connected ? tr("ui577") : active ? tr("ui578", EMOTES[active.id].name) : pending ? tr("ui579") : tr("ui580")}</p>
      </div>
    </Popover>
  );
}

export function EmoteDockButton() {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const active = useStore((s) => s.emotes[s.selfId]);
  const close = () => { setAnchor(null); button.current?.focus(); };
  return <>
    <button ref={button} className={`dk ${anchor || active ? 'active' : ''}`} aria-label={tr("ui225")} title={tr("ui225")} aria-haspopup="dialog" aria-expanded={!!anchor} data-popanchor
      onClick={(e) => { unlockEmoteAudio(); setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect()); }}><Icon name="emote" size={23} /></button>
    {anchor && <EmotePicker anchor={anchor} onClose={close} />}
  </>;
}
