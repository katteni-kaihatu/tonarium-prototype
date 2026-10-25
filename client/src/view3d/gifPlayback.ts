import type { ParsedFrame } from 'gifuct-js';

export type GifFrame = Pick<ParsedFrame, 'dims' | 'delay' | 'disposalType' | 'patch'>;

export class GifPlayback {
  pixels: Uint8ClampedArray;
  private saved: Uint8ClampedArray | null = null;
  private index = 0;
  private elapsed = 0;
  private duration: number;

  constructor(
    readonly width: number,
    readonly height: number,
    private frames: GifFrame[],
    private background: readonly number[] = [0, 0, 0, 0],
  ) {
    if (!frames.length) throw new Error('GIF has no frames');
    this.pixels = new Uint8ClampedArray(width * height * 4);
    this.duration = frames.reduce((sum, frame) => sum + this.delay(frame), 0);
    this.clear();
    this.draw();
  }

  private delay(frame: GifFrame) {
    // ブラウザと同様に、極端に短い待ち時間は100msとして扱う。
    return frame.delay > 10 ? frame.delay : 100;
  }

  private clear(dims = { left: 0, top: 0, width: this.width, height: this.height }) {
    for (let y = dims.top; y < Math.min(this.height, dims.top + dims.height); y++) {
      for (let x = dims.left; x < Math.min(this.width, dims.left + dims.width); x++) {
        this.pixels.set(this.background, (y * this.width + x) * 4);
      }
    }
  }

  private draw() {
    const frame = this.frames[this.index];
    this.saved = frame.disposalType === 3 ? this.pixels.slice() : null;
    const { left, top, width, height } = frame.dims;
    for (let y = 0; y < height && top + y < this.height; y++) {
      for (let x = 0; x < width && left + x < this.width; x++) {
        const source = (y * width + x) * 4;
        if (frame.patch[source + 3]) {
          const target = ((top + y) * this.width + left + x) * 4;
          this.pixels[target] = frame.patch[source];
          this.pixels[target + 1] = frame.patch[source + 1];
          this.pixels[target + 2] = frame.patch[source + 2];
          this.pixels[target + 3] = frame.patch[source + 3];
        }
      }
    }
  }

  update(milliseconds: number): boolean {
    if (this.frames.length < 2) return false;
    this.elapsed += Math.max(0, milliseconds) % this.duration;
    let changed = false;
    while (this.elapsed >= this.delay(this.frames[this.index])) {
      const previous = this.frames[this.index];
      this.elapsed -= this.delay(previous);
      if (previous.disposalType === 2) this.clear(previous.dims);
      else if (previous.disposalType === 3 && this.saved) this.pixels.set(this.saved);
      this.index = (this.index + 1) % this.frames.length;
      // 前の周回の差分を先頭フレームへ持ち越さない。
      if (this.index === 0) this.clear();
      this.draw();
      changed = true;
    }
    return changed;
  }

  dispose() {
    this.frames = [];
    this.saved = null;
    this.pixels = new Uint8ClampedArray(0);
  }
}
