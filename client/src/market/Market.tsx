import { ItemDetail } from './ItemDetail.tsx';
import { OriginBadge } from './OriginBadge.tsx';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { MARKET_CATEGORIES, MARKET_PRODUCTS, type MarketCategory, type MarketProduct } from '../../../shared/market.ts';
import { Icon } from '../world/Icon.tsx';
import { playSynth, unlockEmoteAudio } from '../world/sounds.ts';
import { purchaseProduct, useOwnedContent } from './store.ts';
import { get, set, useStore } from '../store.ts';
import { sendChat } from '../actions.ts';
import { openMarketProduct, shareProductUrl } from './navigation.ts';
import { LikeButton } from './LikeButton.tsx';
import { goHome } from '../home/pages.tsx';
import './market.css';

/** Small illustrations describe the bundled mock content without external image dependencies. */
export function ProductArt({ product: p }: { product: MarketProduct }) {
  return <div className={`market-art art-${p.category}`} style={{ background: p.color, color: p.ink }} aria-hidden="true">
    <svg viewBox="0 0 360 210" fill="none">
      {p.category === 'worlds' ? <>
        <path d="M25 150 180 80l155 70-155 56Z" fill="#697BA9" /><path d="M25 150V45l155 65v96Z" fill="#30436C" /><path d="M180 110 335 45v105l-155 56Z" fill="#465A87" />
        <path d="M180 110V30" stroke="#B3BFE0" /><circle cx="270" cy="74" r="19" fill="#F8DF9D" /><circle cx="278" cy="67" r="17" fill="#465A87" />
        {[ [65,74], [111,105], [228,111], [296,127], [155,141] ].map(([x,y],i) => <path key={i} d={`M${x} ${y-6}v12m-6-6h12`} stroke="#F8DF9D" strokeWidth="2" />)}
        <ellipse cx="186" cy="162" rx="39" ry="14" fill="#A8BADE" /><ellipse cx="186" cy="160" rx="24" ry="7" fill="#DCE6F8" />
      </> : p.category === 'sounds' ? <>
        <circle cx="180" cy="105" r="65" stroke="currentColor" opacity=".15" strokeWidth="20" />
        {Array.from({ length: 21 }, (_, i) => { const h = 14 + Math.abs(Math.sin(i * 1.7)) * (i > 4 && i < 17 ? 60 : 24); return <path key={i} d={`M${60+i*12} ${105-h/2}v${h}`} stroke="currentColor" strokeWidth="5" strokeLinecap="round" />; })}
      </> : p.category === 'items' ? <>
        <rect x="119" y="34" width="140" height="145" rx="6" fill="currentColor" opacity=".14" transform="rotate(9 189 106)" />
        <rect x="105" y="30" width="140" height="145" rx="6" fill="#FFFDF9" transform="rotate(-7 175 102)" />
        <path d="M130 114h85m-85 16h65m-65 16h75" stroke="currentColor" strokeWidth="4" opacity=".4" /><text x="170" y="92" textAnchor="middle" fontSize="46" fill="currentColor">{p.mark}</text>
      </> : <>
        <circle cx="180" cy="105" r="67" fill="#FFFDF9" opacity=".65" /><text x="180" y="129" fontSize="72" textAnchor="middle" fill="currentColor">{p.mark}</text>
        <path d="m92 61 8 10m169-8-9 10M78 131l14-2m187 2-13-2" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </>}
    </svg>
  </div>;
}

const Preview3D = lazy(() => import('./Preview3D.tsx'));

function PurchaseDialog({ product, onClose, onPurchased }: { product: MarketProduct; onClose: () => void; onPurchased: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = dialog.current!; el.showModal(); return () => el.close(); }, []);
  return <dialog ref={dialog} className="market-confirm" aria-labelledby="purchase-title" onCancel={(e) => { e.preventDefault(); onClose(); }} onKeyDown={(e) => e.stopPropagation()} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <h2 id="purchase-title">このコンテンツを購入しますか？</h2>
    <p><b>{product.name}</b><br /><span className="sub">制作：{product.creator}</span></p>
    <div className="market-total"><span>購入価格</span><b>◉ {product.price.toLocaleString()} コイン</b></div>
    <p>購入後は「{MARKET_CATEGORIES[product.category]}」に追加され、すぐに使えます。</p>
    <p className="market-demo">モック購入です。支払いは発生せず、コイン残高も変わりません。</p>
    <div className="market-actions"><button autoFocus onClick={onClose}>キャンセル</button><button className="primary" onClick={() => { if (purchaseProduct(product.id) !== 'invalid') onPurchased(); }}>購入を確定する</button></div>
  </dialog>;
}

export function MarketPage({ q }: { q: string }) {
  const owned = useOwnedContent();
  const session = useStore((s) => s.session);
  const connected = useStore((s) => s.sync === 'connected');
  const [category, setCategory] = useState<MarketCategory | 'all'>('all');
  const [ownership, setOwnership] = useState<'all' | 'owned' | 'unowned'>('all');
  const selectedId = useStore((s) => s.marketProductId);
  const selected = MARKET_PRODUCTS.find((p) => p.id === selectedId) ?? null;
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [copiedAt, setCopiedAt] = useState(0);
  useEffect(() => {
    if (copyStatus !== 'copied') return;
    const timer = setTimeout(() => setCopyStatus('idle'), 2000);
    return () => clearTimeout(timer);
  }, [copyStatus, copiedAt]);
  useEffect(() => { setConfirm(false); setSuccess(false); setPreviewing(false); setCopyStatus('idle'); }, [selectedId]);
  const copyLink = async () => {
    if (!selected) return;
    try { await navigator.clipboard.writeText(shareProductUrl(selected.id)); setCopyStatus('copied'); setCopiedAt(Date.now()); }
    catch { setCopyStatus('manual'); }
  };
  const shareToSession = () => {
    if (!selected || !get().session || get().sync !== 'connected') return;
    sendChat(shareProductUrl(selected.id), 'all');
    set({ hubOpen: false });
  };
  const [confirm, setConfirm] = useState(false);
  const [success, setSuccess] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const lastCard = useRef<HTMLButtonElement | null>(null);
  const [previewing, setPreviewing] = useState(false);
  useEffect(() => { if (selected) heading.current?.focus(); else lastCard.current?.focus(); }, [selected]);
  useEffect(() => { if (!previewing) return; const timer = setTimeout(() => setPreviewing(false), 1600); return () => clearTimeout(timer); }, [previewing]);
  const products = MARKET_PRODUCTS.filter((p) => (category === 'all' || p.category === category) && (ownership === 'all' || owned.includes(p.id) === (ownership === 'owned')) && `${p.name} ${p.creator} ${p.description}`.toLowerCase().includes(q.trim().toLowerCase()));
  return <section className="market-page">
    <div className="market-topline"><span className="market-wallet"><span aria-hidden="true">◉</span> 2,000 <small>コイン</small><span className="content-origin">体験用</span></span></div>
    {selected ? <>
      <ItemDetail name={selected.name} genre={MARKET_CATEGORIES[selected.category]} creator={selected.creator} description={selected.description}
        headingRef={heading} onBack={() => { openMarketProduct(null); setSuccess(false); setPreviewing(false); }}
        visual={<>{selected.category !== 'sounds' ? <Suspense fallback={<div className="market-3d-stage market-3d-loading" role="status">3D プレビューを準備中…</div>}><Preview3D key={selected.id} product={selected} /></Suspense> : <ProductArt product={selected} />}{selected.category === 'sounds' && <div className="market-preview"><button disabled={previewing} onClick={() => { unlockEmoteAudio(); playSynth(selected.content, 1); setPreviewing(true); }}><Icon name="volume" />{previewing ? '試聴中…' : 'サウンドを試聴する'}</button><small>試聴は自分だけに聞こえます</small></div>}</>}
        social={<><div className="market-social"><LikeButton key={selected.id} product={selected.id} /><div className="market-share-actions"><span className="market-share"><button onClick={() => void copyLink()}><Icon name="link" />共有リンクをコピー</button>{copyStatus === 'copied' && <span className="market-copy-toast" role="status">コピーしました</span>}</span>{session && <button disabled={!connected} title={connected ? '参加中のセッション全体に共有します' : 'セッションへの接続後に共有できます'} onClick={shareToSession}><Icon name="send" />現在のセッションに共有</button>}</div></div>
          {copyStatus === 'manual' && <label className="market-copy-fallback">リンクを選択してコピーしてください<input readOnly aria-label="共有リンク" value={shareProductUrl(selected.id)} onFocus={(e) => e.currentTarget.select()} /></label>}</>}
        tags={<><span>2D / 3D 対応</span><span>モック商品</span></>}
        usage={<>{selected.category === 'worlds' ? 'ワールド一覧から、このワールドでセッションを作成できます。参加中なら、確認後に全員のワールドを切り替えられます。' : selected.category === 'items' ? 'アイテム一覧やセッション内の所持アイテムから「目の前に出す」を選びます。質問・挨拶入りの付箋として配置され、自由に編集できます。' : selected.category === 'sounds' ? 'セッション下部のサウンドボードに追加されます。ボタンを押すと近くにいる人にサウンドが聞こえます。' : 'セッション下部のエモートメニューに追加されます。ボタンを押すと、アイコンやアバターが動きます。'}</>}>
        <div className="market-price">◉ {selected.price.toLocaleString()} <small>コイン</small></div>
          {owned.includes(selected.id) ? <div className="market-success" role="status"><b><Icon name="check" />{success ? '購入しました！' : '購入済みです'}</b><p>「{MARKET_CATEGORIES[selected.category]}」に追加されています。</p><button className="primary" onClick={() => goHome(selected.category)}>{MARKET_CATEGORIES[selected.category]}を開く</button></div> : <><button className="primary market-buy" onClick={() => setConfirm(true)}>購入する</button><small>購入すると「{MARKET_CATEGORIES[selected.category]}」から使えます。</small></>}
      </ItemDetail>
      {confirm && <PurchaseDialog product={selected} onClose={() => setConfirm(false)} onPurchased={() => { setConfirm(false); setSuccess(true); }} />}
    </> : <>
      <div className="market-filters"><div className="market-tabs" aria-label="商品ジャンル">{(['all', ...Object.keys(MARKET_CATEGORIES)] as const).map((cat) => <button key={cat} aria-pressed={category === cat} className={category === cat ? 'on' : ''} onClick={() => setCategory(cat as MarketCategory | 'all')}>{cat === 'all' ? 'すべて' : MARKET_CATEGORIES[cat as MarketCategory]}</button>)}</div><label className="market-owned">購入状態<select value={ownership} onChange={(e) => setOwnership(e.target.value as typeof ownership)}><option value="all">すべて表示</option><option value="owned">購入済みのみ</option><option value="unowned">購入したものを非表示</option></select></label></div>
      <div className="market-result" aria-live="polite"><b>{category === 'all' ? 'すべてのコンテンツ' : MARKET_CATEGORIES[category]}</b><span>{products.length} 件</span></div>
      {products.length ? <div className="market-grid">{products.map((p) => <article className="market-card" key={p.id}><button className="market-card-open" onClick={(e) => { lastCard.current = e.currentTarget; openMarketProduct(p.id); }} aria-label={`${p.name}の詳細`}><ProductArt product={p} /><span className="market-card-copy"><span className="market-category">{MARKET_CATEGORIES[p.category]}</span><b>{p.name}</b><span className="market-creator">{p.creator}</span><strong>◉ {p.price.toLocaleString()} <small>コイン</small></strong></span></button><OriginBadge productId={owned.includes(p.id) ? p.id : undefined} /><div className="market-card-social"><LikeButton product={p.id} /></div></article>)}</div> : <div className="market-empty"><Icon name="search" size={30} /><h3>{ownership === 'owned' ? '該当する購入済みコンテンツはありません' : 'コンテンツが見つかりません'}</h3><p>検索語やジャンルを変えて探してみてください。</p><button onClick={() => { setCategory('all'); setOwnership('all'); }}>絞り込みを解除</button></div>}
    </>}
  </section>;
}
