import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEDIA_PLACEMENT, adjustMediaPlacement, boardSize, mediaPosition, mediaTransform } from './media-placement.ts';
import { applyItemAction, clockTime, createItem } from './items.ts';
import { pack, unpack } from './session-wire.ts';
import type { RoomServerMsg } from './protocol.ts';

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('wheel moves the preview along the view ray, including floor and air positions', () => {
  const value = { distance: 2, scale: 1 };
  const origin = { x: 1, y: 1.6, z: 3 };
  const direction = { x: 0, y: -0.6, z: -0.8 };
  const air = mediaPosition(origin, direction, value.distance);
  close(air.y, 0.4);
  adjustMediaPlacement(value, 100, false);
  assert.equal(value.distance, 2.25);
  assert.equal(value.scale, 1);
  const next = mediaPosition(origin, direction, value.distance);
  assert.ok(next.y < air.y && next.z < air.z);
  close(Math.hypot(next.x - origin.x, next.y - origin.y, next.z - origin.z), value.distance);
  const [, h] = boardSize(1920, 1080);
  const floor = mediaPosition(origin, direction, (origin.y - h / 2) / 0.6);
  close(floor.y - h / 2, 0);
});

test('shift wheel preserves distance, center and aspect ratio for portrait and landscape media', () => {
  for (const [width, height] of [[1920, 1080], [600, 1200]]) {
    const value = { distance: 3, scale: 1 };
    const center = () => mediaPosition({ x: 2, y: 4, z: 6 }, { x: 0, y: 0, z: -1 }, value.distance);
    const before = center();
    adjustMediaPlacement(value, -100, true);
    assert.ok(value.scale > 1);
    assert.equal(value.distance, 3);
    assert.deepEqual(center(), before);
    const [w, h] = boardSize(width, height);
    close((w * value.scale) / (h * value.scale), width / height);
  }
});

test('repeated wheel input saturates safely and reverses at every bound', () => {
  const value = { distance: 2.2, scale: 1 };
  for (const sign of [-1, 1]) {
    for (let i = 0; i < 1000; i++) {
      adjustMediaPlacement(value, sign * 100, false);
      adjustMediaPlacement(value, sign * 100, true);
    }
    assert.equal(value.distance, sign < 0 ? MEDIA_PLACEMENT.minDistance : MEDIA_PLACEMENT.maxDistance);
    assert.equal(value.scale, sign < 0 ? MEDIA_PLACEMENT.maxScale : MEDIA_PLACEMENT.minScale);
    const before = { ...value };
    adjustMediaPlacement(value, NaN, false);
    adjustMediaPlacement(value, 0, true);
    assert.deepEqual(value, before);
    adjustMediaPlacement(value, -sign, false);
    adjustMediaPlacement(value, -sign, true);
    assert.notDeepEqual(value, before);
  }
  assert.deepEqual(mediaTransform({}), { y: 1.6, scale: 1 });
  assert.deepEqual(mediaTransform({ y: Infinity, scale: NaN }), { y: 1.6, scale: 1 });
  assert.deepEqual(mediaTransform({ y: 200, scale: 100 }), { y: 100, scale: 10 });
  assert.deepEqual(mediaTransform({ y: -200, scale: -1 }), { y: -100, scale: 0.1 });
});

test('image and video transforms survive wire delivery and persistence without changing media or playback clock', () => {
  for (const kind of ['image', 'video'] as const) {
    const item = createItem(kind, { id: kind, x: 0, z: 0, ry: 0, createdBy: 'alice' }, () => 0,
      { url: `/media/00000000-0000-0000-0000-000000000001.${kind === 'image' ? 'png' : 'mp4'}`, w: 1920, h: 1080 })!;
    if (item.kind === 'video') assert.ok(applyItemAction(item, { a: 'mediaPlay', pos: 12 }, 'alice', () => 0));
    const original = structuredClone(item);
    const message: RoomServerMsg = { t: 'itemMove', sid: 'room', id: kind, x: 2, z: 3, ry: 1, ...mediaTransform({ y: 5, scale: 2 }) };
    const { t, sid, id, ...transform } = unpack(pack(message)) as typeof message;
    const clients = [structuredClone(item), structuredClone(item)];
    for (const client of clients) Object.assign(client, transform);
    assert.deepEqual(clients[0], clients[1]);
    assert.deepEqual(JSON.parse(JSON.stringify(clients[0])), clients[1]);
    assert.equal(clients[0].y, 5);
    assert.equal(clients[0].scale, 2);
    assert.equal('url' in clients[0] && clients[0].url, 'url' in original && original.url);
    if (clients[0].kind === 'video' && original.kind === 'video') {
      assert.deepEqual(clients[0].clock, original.clock);
      assert.equal(clockTime(clients[0].clock, original.clock.at + 1000), 13);
      assert.ok(applyItemAction(clients[0], { a: 'mediaPause', pos: 13 }, 'bob', () => 0));
      assert.equal(clients[0].y, 5);
      assert.equal(clients[0].scale, 2);
    }
  }
});
