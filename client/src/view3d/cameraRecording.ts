export const RECORD_WIDTH = 160;
export const RECORD_HEIGHT = 90;
export const RECORD_LIMIT = 10_000;
export type RecordedFrame = { at: number; pixels: Uint8ClampedArray };
export type Recording = { frames: RecordedFrame[]; duration: number };

export class RecordingSubmission {
  busy = false;
  private completed = false;
  private cached?: { recording: Recording; start: number; end: number; image: string; requestId: string };

  async post(recording: Recording, start: number, end: number,
    generate: () => Promise<string>, send: (image: string, requestId: string) => Promise<void>) {
    if (this.busy || this.completed) return false;
    this.busy = true;
    try {
      if (this.cached?.recording !== recording || this.cached.start !== start || this.cached.end !== end) {
        const image = await generate();
        this.cached = { recording, start, end, image, requestId: crypto.randomUUID() };
      }
      await send(this.cached.image, this.cached.requestId);
      this.completed = true;
      return true;
    } finally { this.busy = false; }
  }
}

export function trimRange(start: number, end: number, count: number, handle: 'start' | 'end', value: number): [number, number] {
  const n = Math.round(Number.isFinite(value) ? value : 0);
  return handle === 'start' ? [Math.max(0, Math.min(end - 1, n)), end]
    : [start, Math.max(start + 1, Math.min(count, n))];
}

export function boundary(recording: Recording, index: number) {
  return recording.frames[index]?.at ?? recording.duration;
}

export function previewFrame(recording: Recording, start: number, end: number, elapsed: number) {
  const at = boundary(recording, start) + Math.max(0, elapsed) % (boundary(recording, end) - boundary(recording, start));
  let index = start;
  while (index + 1 < end && recording.frames[index + 1].at <= at) index++;
  return index;
}

export class CameraRecording {
  readonly frames: RecordedFrame[] = [];
  private finished = false;
  constructor(private capture: () => Uint8ClampedArray, private done: (recording: Recording) => void) {
    this.frames.push({ at: 0, pixels: capture() });
  }
  sample(elapsed: number) {
    if (this.finished) return;
    if (elapsed >= RECORD_LIMIT) { this.stop(RECORD_LIMIT); return; }
    const at = Math.floor(elapsed / 10) * 10;
    if (at - this.frames[this.frames.length - 1].at >= 100) this.frames.push({ at, pixels: this.capture() });
  }
  stop(elapsed: number) {
    if (this.finished) return;
    this.finished = true;
    const duration = Math.min(RECORD_LIMIT, Math.max(20, Math.floor(elapsed / 10) * 10));
    while (this.frames.length > 1 && this.frames[this.frames.length - 1].at > duration - 20) this.frames.pop();
    this.done({ frames: this.frames, duration });
  }
}

// 64色と短いLZWブロックで、10秒分でも既存チャットの2MB制限内に収める。
export async function encodeRecording(recording: Recording, start: number, end: number): Promise<Uint8Array> {
  if (!(0 <= start && start < end && end <= recording.frames.length)) throw new Error('Invalid recording range');
  const bytes: number[] = [];
  const word = (n: number) => bytes.push(n & 255, n >> 8);
  bytes.push(...new TextEncoder().encode('GIF89a'));
  word(RECORD_WIDTH); word(RECORD_HEIGHT); bytes.push(0xD5, 0, 0);
  for (let i = 0; i < 64; i++) bytes.push((i >> 4) * 85, ((i >> 2) & 3) * 85, (i & 3) * 85);
  bytes.push(0x21, 0xFF, 11, ...new TextEncoder().encode('NETSCAPE2.0'), 3, 1, 0, 0, 0);
  for (let f = start; f < end; f++) {
    const frame = recording.frames[f];
    if (frame.pixels.length !== RECORD_WIDTH * RECORD_HEIGHT * 4) throw new Error('Invalid recording frame');
    bytes.push(0x21, 0xF9, 4, 4);
    word((boundary(recording, f + 1) - frame.at) / 10);
    bytes.push(0, 0, 0x2C); word(0); word(0); word(RECORD_WIDTH); word(RECORD_HEIGHT); bytes.push(0, 6);
    const compressed: number[] = [];
    let bits = 0, value = 0;
    const code = (n: number) => {
      value |= n << bits; bits += 7;
      while (bits >= 8) { compressed.push(value & 255); value >>= 8; bits -= 8; }
    };
    for (let p = 0; p < RECORD_WIDTH * RECORD_HEIGHT; p++) {
      if (p % 60 === 0) code(64);
      const o = p * 4;
      code((frame.pixels[o] >> 6) * 16 + (frame.pixels[o + 1] >> 6) * 4 + (frame.pixels[o + 2] >> 6));
    }
    code(65);
    if (bits) compressed.push(value & 255);
    for (let i = 0; i < compressed.length; i += 255) {
      const block = compressed.slice(i, i + 255); bytes.push(block.length, ...block);
    }
    bytes.push(0);
    // フレーム間でUIへ制御を返し、生成中も進行状態を描画する。
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  bytes.push(0x3B);
  return new Uint8Array(bytes);
}
