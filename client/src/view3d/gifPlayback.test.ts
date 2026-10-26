import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GIF_MAX_FRAMES, GifPlayback, gifWithinLimits, type GifFrame } from './gifPlayback.ts';
import type { ParsedGif } from 'gifuct-js';

const red = [255, 0, 0, 255];
const green = [0, 255, 0, 255];
const clear = [0, 0, 0, 0];
const frame = (patch: number[], delay = 100, disposalType = 1, left = 0): GifFrame => ({
  patch: new Uint8ClampedArray(patch), delay, disposalType,
  dims: { left, top: 0, width: patch.length / 4, height: 1 },
});

test('each frame keeps its delay and the last frame loops to the first for multiple cycles', () => {
  const player = new GifPlayback(1, 1, [frame(red), frame(green, 200)]);
  for (let cycle = 0; cycle < 4; cycle++) {
    assert.deepEqual([...player.pixels], red);
    assert.equal(player.update(99), false);
    assert.equal(player.update(1), true);
    assert.deepEqual([...player.pixels], green);
    assert.equal(player.update(199), false);
    assert.equal(player.update(1), true);
  }
  assert.deepEqual([...player.pixels], red);
});

test('transparent patches preserve previous pixels and looping clears the previous cycle', () => {
  const player = new GifPlayback(2, 1, [frame([...red, ...clear]), frame(green, 100, 1, 1)]);
  player.update(100);
  assert.deepEqual([...player.pixels], [...red, ...green]);
  player.update(100);
  assert.deepEqual([...player.pixels], [...red, ...clear]);
});

test('disposal 2 clears just the previous patch to the background', () => {
  const player = new GifPlayback(2, 1, [frame(red, 100, 2), frame(green, 100, 1, 1)]);
  player.update(100);
  assert.deepEqual([...player.pixels], [...clear, ...green]);
  const opaque = new GifPlayback(2, 1, [frame(red, 100, 2), frame(green, 100, 1, 1)], green);
  opaque.update(100);
  assert.deepEqual([...opaque.pixels], [...green, ...green]);
});

test('disposal 3 restores the canvas before the previous patch', () => {
  const player = new GifPlayback(2, 1, [
    frame([...red, ...red]), frame(green, 100, 3), frame(green, 100, 1, 1),
  ]);
  player.update(100);
  assert.deepEqual([...player.pixels], [...green, ...red]);
  player.update(100);
  assert.deepEqual([...player.pixels], [...red, ...green]);
});

test('long rendering pauses keep the correct loop phase and zero delays do not spin', () => {
  const player = new GifPlayback(1, 1, [frame(red, 0), frame(green, 200)]);
  player.update(300 * 1000 + 150);
  assert.deepEqual([...player.pixels], green);
  player.update(150);
  assert.deepEqual([...player.pixels], red);
});

test('a static GIF stays visible and disposal releases the pixels and stops playback', () => {
  const player = new GifPlayback(1, 1, [frame(red)]);
  assert.equal(player.update(10000), false);
  assert.deepEqual([...player.pixels], red);
  player.dispose();
  assert.equal(player.pixels.length, 0);
  assert.equal(player.update(10000), false);
});

test('GIF limits reject oversized logical screens, frame counts and total pixels before decoding', () => {
  const frame = (width: number, height: number) => ({ image: { descriptor: { width, height } } });
  const gif = (width: number, height: number, frames: unknown[]) => ({ lsd: { width, height }, frames }) as unknown as ParsedGif;
  assert.equal(gifWithinLimits(gif(480, 480, [frame(480, 480)])), true);
  assert.equal(gifWithinLimits(gif(1024, 1024, [frame(1024, 1024)])), true);
  assert.equal(gifWithinLimits(gif(2000, 2000, [frame(1, 1)])), false);
  assert.equal(gifWithinLimits(gif(100, 100, Array.from({ length: GIF_MAX_FRAMES }, () => frame(100, 100)))), true);
  assert.equal(gifWithinLimits(gif(100, 100, Array.from({ length: GIF_MAX_FRAMES + 1 }, () => frame(100, 100)))), false);
  assert.equal(gifWithinLimits(gif(1000, 1000, Array.from({ length: 100 }, () => frame(1000, 1000)))), false);
  assert.equal(gifWithinLimits(gif(1000, 1000, Array.from({ length: 64 }, () => frame(1000, 1000)))), true);
  // アプリケーションブロックはフレームとして数えない
  assert.equal(gifWithinLimits(gif(10, 10, [{ application: {} }, frame(10, 10)])), true);
  assert.equal(gifWithinLimits(gif(10, 10, [])), false);
});
