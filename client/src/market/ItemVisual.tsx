import { t as tr } from '../i18n/index.ts';
import { lazy, Suspense } from 'react';
import { ITEM_INFO } from '../i18n/static.ts';
import { type ItemKind } from '../../../shared/items.ts';
import type { MarketProduct } from '../../../shared/market.ts';

const Preview3D = lazy(() => import('./Preview3D.tsx'));

export function ItemArt({ kind, name, className }: { kind: ItemKind; name: string; className?: string }) {
  if (!ITEM_INFO[kind].illustration) return <span className={className ?? 'item-illustration'} style={{ background: ITEM_INFO[kind].tint, color: ITEM_INFO[kind].ink }} role="img" aria-label={name}>{ITEM_INFO[kind].mark}</span>;
  return <img className={className ?? 'item-illustration'} src={ITEM_INFO[kind].illustration} alt={tr("ui381", name)} width={360} height={240} />;
}

export function ItemVisual({ kind, product }: { kind: ItemKind; product?: MarketProduct }) {
  const info = ITEM_INFO[kind];
  return <>
    {info.in3d && <Suspense fallback={<div className="market-3d-stage market-3d-loading" role="status">{tr("ui382")}</div>}>
      {product ? <Preview3D product={product} /> : <Preview3D kind={kind} />}
    </Suspense>}
    <ItemArt kind={kind} name={product?.name ?? info.name} />
  </>;
}
