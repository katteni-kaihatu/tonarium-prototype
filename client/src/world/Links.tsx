import { t as tr } from '../i18n/index.ts';
import { openMarketLink } from '../market/navigation.ts';
import { marketProductFromUrl } from '../../../shared/market-links.ts';
import { MARKET_PRODUCTS } from '../i18n/static.ts';
import { useEffect, useState } from 'react';
import { useStore, set } from '../store.ts';

const URL_RE = /https?:\/\/[^\s<>"'（）「」、。]+/g;

interface Ogp { url: string; title: string; description: string; image: string | null; site: string }
const ogpCache = new Map<string, Promise<Ogp | null>>();

const askOpen = (url: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  if (!openMarketLink(url)) set({ openUrl: url });
};

export const firstUrl = (text: string) => text.match(URL_RE)?.[0] ?? null;

/** URL をリンクにした本文 */
export function Linkified({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<a key={m.index} href={m[0]} target="_blank" rel="noopener noreferrer" onClick={askOpen(m[0])}>{m[0]}</a>);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

export function OgpCard({ url }: { url: string }) {
  const [ogp, setOgp] = useState<Ogp | null>(null);
  useEffect(() => {
    if (marketProductFromUrl(url, location.origin)) return;
    let alive = true;
    let p = ogpCache.get(url);
    if (!p) {
      p = fetch(`/ogp?url=${encodeURIComponent(url)}`).then((r) => (r.ok ? r.json() as Promise<Ogp | null> : null)).catch(() => null);
      ogpCache.set(url, p);
    }
    void p.then((o) => { if (alive) setOgp(o); });
    return () => { alive = false; };
  }, [url]);
  const product = MARKET_PRODUCTS.find((p) => p.id === marketProductFromUrl(url, location.origin));
  if (product) return <a className="ogp" href={url} onClick={askOpen(url)}><span className="ogptext"><span className="ogpsite">{tr("ui155")}</span><b>{product.name}</b><span className="ogpdesc">{product.description}</span></span></a>;
  if (!ogp) return null;
  return (
    <a className="ogp" href={url} target="_blank" rel="noopener noreferrer" onClick={askOpen(url)}>
      {ogp.image && <img src={ogp.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
      <span className="ogptext">
        <span className="ogpsite">{ogp.site}</span>
        <b>{ogp.title}</b>
        {ogp.description && <span className="ogpdesc">{ogp.description}</span>}
      </span>
    </a>
  );
}

/** 外部サイトは確認してから新しいタブで開く */
export function ConfirmOpen() {
  const url = useStore((s) => s.openUrl);
  if (!url) return null;
  const cancel = () => set({ openUrl: null });
  let host = url;
  try { host = new URL(url).host; } catch { /* そのまま出す */ }
  return (
    <div className="modalbg light" onClick={cancel}>
      <div role="alertdialog" aria-modal="true" aria-label={tr("ui595")} className="confirm" onClick={(e) => e.stopPropagation()}>
        <h2>{tr("ui596")}</h2>
        <span className="sub wrap"><b>{host}</b> {tr("ui597")}</span>
        <code className="openurl">{url}</code>
        <div className="row end">
          <button onClick={cancel}>{tr("ui338")}</button>
          <button className="dark" autoFocus onClick={() => { window.open(url, '_blank', 'noopener,noreferrer'); cancel(); }}>{tr("ui598")}</button>
        </div>
      </div>
    </div>
  );
}
