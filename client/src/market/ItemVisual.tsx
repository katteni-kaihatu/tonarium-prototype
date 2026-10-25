import { lazy, Suspense } from 'react';
import { ITEM_INFO, type ItemKind } from '../../../shared/items.ts';
import type { MarketProduct } from '../../../shared/market.ts';

const Preview3D = lazy(() => import('./Preview3D.tsx'));

export function ItemArt({ kind, name, className }: { kind: ItemKind; name: string; className?: string }) {
  return <img className={className ?? 'item-illustration'} src={ITEM_INFO[kind].illustration} alt={`${name}の挿絵`} width={360} height={240} />;
}

export function ItemVisual({ kind, product }: { kind: ItemKind; product?: MarketProduct }) {
  const info = ITEM_INFO[kind];
  return <>
    {info.in3d && <Suspense fallback={<div className="market-3d-stage market-3d-loading" role="status">3D プレビューを準備中…</div>}>
      {product ? <Preview3D product={product} /> : <Preview3D kind={kind} />}
    </Suspense>}
    <ItemArt kind={kind} name={product?.name ?? info.name} />
  </>;
}
