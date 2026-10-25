import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createImageTexture } from './imageTexture.ts';

// ループ指定のない2フレームGIFでも、アイテムでは繰り返し再生する。
const gif = new Uint8Array([
  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0,
  255, 0, 0, 0, 255, 0,
  33, 249, 4, 4, 10, 0, 0, 0,
  44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0,
  33, 249, 4, 4, 20, 0, 0, 0,
  44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 76, 1, 0, 59,
]);

function browser(t: TestContext) {
  const images: FakeImage[] = [];
  class FakeImage {
    src = '';
    crossOrigin = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() { images.push(this); }
    removeAttribute() { this.src = ''; }
  }
  const painted: number[][] = [];
  const context = {
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (data: ImageData) => painted.push([...data.data]),
  };
  const canvas = { width: 0, height: 0, getContext: () => context };
  for (const [key, value] of Object.entries({ Image: FakeImage, document: { createElement: () => canvas } })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  return { images, painted, canvas };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test('decoded GIF pixels update the texture through multiple loops and stop after disposal', async t => {
  const { painted, canvas, images } = browser(t);
  let signal: AbortSignal | undefined;
  t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    signal = options.signal as AbortSignal;
    return { ok: true, arrayBuffer: async () => gif.buffer };
  });
  const media = createImageTexture('/media/test.gif');
  await settle();
  assert.equal(images.length, 0);
  assert.equal(media.texture.image, canvas);
  for (let loop = 0; loop < 4; loop++) {
    assert.deepEqual(painted.at(-1), [255, 0, 0, 255]);
    const version = media.texture.version;
    media.update(0.1);
    assert.deepEqual(painted.at(-1), [0, 255, 0, 255]);
    assert.ok(media.texture.version > version);
    media.update(0.2);
  }
  let disposed = 0;
  media.texture.addEventListener('dispose', () => disposed++);
  media.dispose();
  const count = painted.length;
  media.update(10);
  assert.equal(painted.length, count);
  assert.equal(signal?.aborted, true);
  assert.equal(canvas.width, 0);
  assert.equal(media.texture.image, null);
  assert.equal(disposed, 1);
});

test('static images keep their source and texture settings without frame uploads', t => {
  const { images, painted } = browser(t);
  const media = createImageTexture('/media/photo.png');
  const image = images[0];
  assert.equal(image.src, '/media/photo.png');
  assert.equal(image.crossOrigin, 'anonymous');
  image.onload?.();
  assert.equal(media.texture.image, image);
  assert.equal(media.texture.colorSpace, 'srgb');
  assert.equal(media.texture.anisotropy, 4);
  const version = media.texture.version;
  media.update(1);
  assert.equal(media.texture.version, version);
  assert.equal(painted.length, 0);
  media.dispose();
  assert.equal(image.src, '');
  assert.equal(image.onload, null);
});

test('removal during fetching prevents late decoding and texture resurrection', async t => {
  const { painted, images } = browser(t);
  let finish!: (response: unknown) => void;
  t.mock.method(globalThis, 'fetch', () => new Promise(resolve => { finish = resolve; }));
  const media = createImageTexture('/media/test.gif');
  media.dispose();
  finish({ ok: true, arrayBuffer: async () => gif.buffer });
  await settle();
  assert.equal(painted.length, 0);
  assert.equal(images.length, 0);
  assert.equal(media.texture.image, null);
});

test('GIF decoding failure falls back to a native image and cleans it up', async t => {
  const { images } = browser(t);
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
  const media = createImageTexture('/media/test.gif');
  await settle();
  assert.equal(images[0].src, '/media/test.gif');
  media.dispose();
  assert.equal(images[0].src, '');
});
