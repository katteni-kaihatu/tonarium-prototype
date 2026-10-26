import * as THREE from 'three';
import { decompressFrames, parseGIF } from 'gifuct-js';
import { GifPlayback, gifWithinLimits } from './gifPlayback.ts';

export function createImageTexture(url: string) {
  const texture = new THREE.Texture();
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const abort = new AbortController();
  let disposed = false;
  let image: HTMLImageElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let context: CanvasRenderingContext2D | null = null;
  let player: GifPlayback | null = null;
  let output: ImageData | null = null;

  function paint() {
    if (!player || !context || !output) return;
    output.data.set(player.pixels);
    context.putImageData(output, 0, 0);
    texture.needsUpdate = true;
  }

  function loadStatic() {
    if (disposed) return;
    image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (disposed) return;
      texture.image = image;
      texture.needsUpdate = true;
    };
    image.src = url;
  }

  async function loadGif() {
    try {
      const response = await fetch(url, { signal: abort.signal });
      if (!response.ok) throw new Error('GIF load failed');
      const bytes = await response.arrayBuffer();
      if (disposed) return;
      const gif = parseGIF(bytes);
      // 上限を超える GIF は全フレーム展開せず、静止画として表示する（既存の失敗時フォールバックへ合流）
      if (!gifWithinLimits(gif)) throw new Error('GIF exceeds size limits');
      const frames = decompressFrames(gif, true);
      const background = frames[0]?.transparentIndex === undefined
        ? [...(gif.gct?.[gif.lsd.backgroundColorIndex] ?? [0, 0, 0]), 255]
        : [0, 0, 0, 0];
      player = new GifPlayback(gif.lsd.width, gif.lsd.height, frames.map(({ dims, delay, disposalType, patch }) => ({
        dims, delay, disposalType, patch,
      })), background);
      canvas = document.createElement('canvas');
      canvas.width = player.width;
      canvas.height = player.height;
      context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      output = context.createImageData(player.width, player.height);
      texture.image = canvas;
      paint();
    } catch {
      player?.dispose();
      player = null;
      if (canvas) canvas.width = canvas.height = 0;
      canvas = null;
      context = null;
      output = null;
      loadStatic();
    }
  }

  // 共有メディアはサーバーが画像形式に対応する拡張子で保存する。
  if (/\.gif(?:[?#]|$)/i.test(url)) void loadGif();
  else loadStatic();

  return {
    texture,
    update(seconds: number) {
      if (!disposed && player?.update(seconds * 1000)) paint();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort();
      if (image) {
        image.onload = null;
        image.onerror = null;
        image.removeAttribute('src');
        image = null;
      }
      player?.dispose();
      player = null;
      if (canvas) canvas.width = canvas.height = 0;
      canvas = null;
      context = null;
      output = null;
      texture.dispose();
      texture.image = null;
    },
  };
}
