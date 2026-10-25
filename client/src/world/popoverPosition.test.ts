import assert from 'node:assert/strict';
import { test } from 'node:test';
import { popoverPosition } from './popoverPosition.ts';

test('横画面・縦画面・PCで各方向のメニューが画面内に収まる', () => {
  for (const [width, height] of [[568, 320], [667, 375], [844, 390], [932, 430], [390, 844], [1440, 900]]) {
    const viewport = { left: 0, top: 0, width, height };
    const size = { width: 260, height: Math.min(600, height - 24) };
    for (const side of ['right', 'up', 'down'] as const) {
      for (const [left, top] of [[0, 0], [width - 44, height - 44]]) {
        const result = popoverPosition({ left, top, right: left + 44, bottom: top + 44, width: 44, height: 44 }, size, viewport, side);
        assert.ok(result.left >= 12 && result.top >= 12);
        assert.ok(result.left + size.width <= width - 12);
        assert.ok(result.top + size.height <= height - 12);
      }
    }
  }
});

test('回転後の古いアンカーとキーボード表示中の表示領域に合わせる', () => {
  const anchor = { left: 800, top: 350, right: 844, bottom: 394, width: 44, height: 44 };
  const result = popoverPosition(anchor, { width: 260, height: 176 }, { left: 20, top: 80, width: 390, height: 200 }, 'up');
  assert.deepEqual(result, { left: 138, top: 92, maxWidth: 366, maxHeight: 176 });
});
