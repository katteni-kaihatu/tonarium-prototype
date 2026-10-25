import { test } from '../assertion-runner.js';
import assert from 'node:assert/strict';
import { MarketLikes } from './market.js';
test('likes are idempotent per user and product, with a shared total and private liked list', () => {
    const likes = new MarketLikes();
    assert.ok(likes.like('star-lounge', 'alice'));
    assert.equal(likes.like('star-lounge', 'alice'), false);
    assert.ok(likes.like('star-lounge', 'bob'));
    assert.ok(likes.like('bow-emote', 'alice'));
    assert.equal(likes.snapshot('alice').counts['star-lounge'], 2);
    assert.deepEqual(likes.snapshot('bob').liked, ['star-lounge']);
    assert.deepEqual(likes.snapshot('new-user').liked, []);
    const restored = new MarketLikes(JSON.parse(JSON.stringify(likes.serialize())));
    assert.equal(restored.like('star-lounge', 'alice'), false);
    assert.deepEqual(restored.snapshot('alice'), likes.snapshot('alice'));
});
test('unknown products and malformed stored values cannot create votes', () => {
    const likes = new MarketLikes({ 'star-lounge': ['alice', 'alice', 0, null], 'bow-emote': {} });
    assert.equal(likes.snapshot('alice').counts['star-lounge'], 1);
    for (const id of ['__proto__', 'toString', 'missing', null, {}, 1])
        assert.equal(likes.like(id, 'alice'), false);
    assert.equal(likes.like('star-lounge', ''), false);
});
