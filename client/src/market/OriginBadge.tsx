import { t as tr } from '../i18n/index.ts';
import { Icon } from '../world/Icon.tsx';
import { MARKET_PRODUCTS } from '../i18n/static.ts';
import { openMarketProduct } from './navigation.ts';

export function OriginBadge({ productId, onOpen }: { productId?: string; onOpen?: () => void }) {
  const product = MARKET_PRODUCTS.find((p) => p.id === productId);
  if (!product) return null;
  return <button type="button" className="market-origin" title={tr("ui435")} aria-label={tr("ui436", product.name)} onClick={(e) => { e.stopPropagation(); onOpen?.(); openMarketProduct(product.id); }}><Icon name="market" size={13} /></button>;
}
