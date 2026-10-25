import { t as tr } from '../i18n/index.ts';
import { useEffect, useState } from 'react';
import { contentAvailable, productFor } from '../../../shared/market.ts';
import { SOUNDS } from '../i18n/static.ts';
import { EMOTES } from '../i18n/static.ts';
import { type EmoteId } from '../../../shared/emotes.ts';
import { useOwnedContent } from './store.ts';
import { OriginBadge } from './OriginBadge.tsx';
import { set, useStore } from '../store.ts';
import { playSound } from '../actions.ts';
import { send } from '../net/ws.ts';
import { playSynth, unlockEmoteAudio } from '../world/sounds.ts';
import { Icon } from '../world/Icon.tsx';

/** Collection destinations from the purchase flow; the session dock uses the same ownership filter. */
export function ReactionLibrary({ category, q }: { category: 'sounds' | 'emotes'; q: string }) {
  const owned = useOwnedContent();
  const session = useStore((s) => s.session);
  const connected = useStore((s) => s.sync === 'connected');
  const active = useStore((s) => s.emotes[s.selfId]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(() => setBusy(false), 3000);
    return () => clearTimeout(timer);
  }, [busy]);
  const entries = category === 'sounds' ? SOUNDS : (Object.keys(EMOTES) as EmoteId[]).map((id) => ({ id, name: EMOTES[id].name }));
  const list = entries.filter((x) => contentAvailable(owned, category, x.id) && x.name.includes(q.trim()));
  const perform = (id: string) => {
    unlockEmoteAudio();
    if (category === 'sounds') { playSound(id as (typeof SOUNDS)[number]['id']); return; }
    if (!connected || active || busy) return;
    send({ t: 'emote', id: id as EmoteId });
    setBusy(true);
    set({ hubOpen: false });
  };
  return <section className="hsec"><h2>{category === 'sounds' ? tr("ui224") : tr("ui225")}</h2><p className="sub wrap">{session ? tr("ui383") : tr("ui384")}</p><div className="icards">{list.map((x) => { const p = productFor(category, x.id); return <article key={x.id} className="icard"><div className="iinfo"><b>{x.name} <OriginBadge productId={p?.id} /></b><span className="sub">{tr("ui371")}{p?.creator ?? 'Tonarium'}</span><div className="market-actions">{category === 'sounds' && <button onClick={() => { unlockEmoteAudio(); playSynth(x.id, 1); }}>{tr("ui385")}</button>}<button className="primary" disabled={!session || !connected || (category === 'emotes' && (!!active || busy))} onClick={() => perform(x.id)}>{session ? tr("ui386") : tr("ui387")}</button></div></div></article>; })}</div>{!list.length && <p>{tr("ui388")}</p>}</section>;
}
