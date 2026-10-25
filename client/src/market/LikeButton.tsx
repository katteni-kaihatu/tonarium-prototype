import { t as tr } from '../i18n/index.ts';
import { useEffect, useState } from 'react';
import { useStore } from '../store.ts';
import { send } from '../net/ws.ts';

export function LikeButton({ product }: { product: string }) {
  const likes = useStore((s) => s.marketLikes);
  const connected = useStore((s) => s.wsConnected);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const liked = !!likes?.liked.includes(product);
  useEffect(() => { if (liked) { setPending(false); setError(false); } }, [liked]);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => { setPending(false); setError(true); }, 5000);
    return () => clearTimeout(timer);
  }, [pending]);
  return <div className="market-like-wrap"><button className={`market-like ${liked ? 'liked' : ''}`} aria-pressed={liked} disabled={!connected || !likes || liked || pending} aria-busy={pending} title={liked ? tr("ui389") : !connected ? tr("ui390") : tr("ui391")} onClick={() => { setPending(true); setError(false); send({ t: 'marketLike', product }); }}><span aria-hidden="true">⭐</span>{tr("ui392")}<b>{likes ? (likes.counts[product] ?? 0).toLocaleString() : '…'}</b></button>{error && !liked && <small role="status">{tr("ui393")}</small>}</div>;
}
