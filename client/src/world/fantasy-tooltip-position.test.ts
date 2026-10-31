import test from 'node:test';
import assert from 'node:assert/strict';
import { fantasyTooltipPosition } from './fantasy-tooltip-position.ts';
test('tooltip fits the panel at either edge and flips above the bottom button', () => {
  const bounds = { left: 10, top: 20, right: 410, bottom: 420 };
  for (const anchor of [{left:390,top:390,right:410,bottom:420},{left:10,top:20,right:30,bottom:40}]) {
    const point = fantasyTooltipPosition(anchor, {width:300,height:90}, bounds);
    assert.ok(point.left >= bounds.left + 8 && point.left + 300 <= bounds.right - 8);
    assert.ok(point.top >= bounds.top + 8 && point.top + 90 <= bounds.bottom - 8);
  }
});
