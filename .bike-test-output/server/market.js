import { MARKET_PRODUCTS } from '../shared/market.js';
/** One vote per existing prototype identity and product; voter identities never leave the server. */
export class MarketLikes {
    voters = new Map();
    constructor(saved = {}) {
        const data = saved && typeof saved === 'object' ? saved : {};
        for (const p of MARKET_PRODUCTS) {
            const ids = Object.hasOwn(data, p.id) ? data[p.id] : [];
            this.voters.set(p.id, new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string' && !!id) : []));
        }
    }
    like(product, user) {
        const voters = typeof product === 'string' ? this.voters.get(product) : undefined;
        if (!voters || !user || voters.has(user))
            return false;
        voters.add(user);
        return true;
    }
    snapshot(user) {
        return {
            counts: Object.fromEntries([...this.voters].map(([id, voters]) => [id, voters.size])),
            liked: [...this.voters].filter(([, voters]) => voters.has(user)).map(([id]) => id),
        };
    }
    serialize() { return Object.fromEntries([...this.voters].map(([id, voters]) => [id, [...voters]])); }
}
