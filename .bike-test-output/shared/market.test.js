import { test } from '../assertion-runner.js';
import assert from 'node:assert/strict';
import { MARKET_CATEGORIES, MARKET_PRODUCTS, cleanPurchases, contentAvailable } from './market.js';
import { isWorldKind } from './worlds.js';
import { SOUNDS } from './sounds.js';
import { isEmoteId } from './emotes.js';
import { marketProductFromUrl, marketProductUrl } from './market-links.js';
import { createItem, ITEM_INFO } from './items.js';
test('bike uses the existing item product and purchase identity', () => {
    const product = MARKET_PRODUCTS.find(p => p.id === 'bike');
    assert.ok(product?.category === 'items' && product.kind === 'bike');
    assert.equal(contentAvailable([], 'items', 'bike'), false);
    assert.equal(contentAvailable(cleanPurchases(['bike']), 'items', 'bike'), true);
    assert.equal(product.price, 150);
    const item = createItem(product.kind, { id: 'b', x: 0, z: 0, ry: 0, createdBy: 'a' }, Math.random);
    assert.equal(item?.kind, 'bike');
    assert.equal(ITEM_INFO.bike.in2d, false);
    assert.match(ITEM_INFO.bike.desc, /E.*W\/↑.*S\/↓.*A\/D/);
});
test('share links resolve a known product without carrying identity or session parameters', () => {
    const link = marketProductUrl('talk-card', 'https://tonarium.example/?as=alice&secret=no');
    assert.equal(link, 'https://tonarium.example/#/market/talk-card');
    assert.equal(marketProductFromUrl(link, 'https://tonarium.example'), 'talk-card');
    for (const invalid of ['https://other.example/#/market/talk-card', '/#/market/missing', '/#/market/%ZZ', '/wrong#/market/talk-card']) {
        assert.equal(marketProductFromUrl(invalid, 'https://tonarium.example'), null);
    }
});
test('all four categories have usable bundled content and unique product IDs', () => {
    assert.equal(new Set(MARKET_PRODUCTS.map((p) => p.id)).size, MARKET_PRODUCTS.length);
    for (const category of Object.keys(MARKET_CATEGORIES))
        assert.ok(MARKET_PRODUCTS.some((p) => p.category === category));
    for (const p of MARKET_PRODUCTS) {
        assert.ok(p.price > 0);
        if (p.category === 'worlds')
            assert.ok(isWorldKind(p.content));
        if (p.category === 'sounds')
            assert.ok(SOUNDS.some((s) => s.id === p.content));
        if (p.category === 'emotes')
            assert.ok(isEmoteId(p.content));
        if (p.category === 'items')
            assert.ok(p.text.length > 0 && p.text.length < 1000);
    }
});
test('purchases unlock only their content; initial content stays available', () => {
    for (const p of MARKET_PRODUCTS) {
        assert.equal(contentAvailable([], p.category, p.content), false);
        assert.equal(contentAvailable([p.id], p.category, p.content), true);
        for (const other of MARKET_PRODUCTS.filter((x) => x.id !== p.id))
            assert.equal(contentAvailable([p.id], other.category, other.content), false);
    }
    for (const [category, id] of [['worlds', 'room'], ['items', 'note'], ['sounds', 'clap'], ['emotes', 'wave']])
        assert.ok(contentAvailable([], category, id));
});
test('persisted purchases reject malformed data and duplicate or unknown IDs', () => {
    for (const value of [null, {}, 3, 'star-lounge'])
        assert.deepEqual(cleanPurchases(value), []);
    assert.deepEqual(cleanPurchases(['star-lounge', 'missing', 'star-lounge', null, {}, 'bow-emote']), ['star-lounge', 'bow-emote']);
});
