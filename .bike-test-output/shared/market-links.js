import { MARKET_PRODUCTS } from './market.js';
export function marketProductFromUrl(value, origin) {
    try {
        const url = new URL(value, origin);
        if (url.origin !== new URL(origin).origin || url.pathname !== '/')
            return null;
        const match = /^#\/market\/([^/]+)$/.exec(url.hash);
        const id = match && decodeURIComponent(match[1]);
        return MARKET_PRODUCTS.some((p) => p.id === id) ? id : null;
    }
    catch {
        return null;
    }
}
export function marketProductUrl(id, origin) {
    const url = new URL('/', origin);
    url.hash = `/market/${encodeURIComponent(id)}`;
    return url.href;
}
