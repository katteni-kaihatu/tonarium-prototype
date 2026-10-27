import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decompressFrames, parseGIF } from 'gifuct-js';
import { CameraRecording, RecordingSubmission, RECORD_WIDTH, RECORD_HEIGHT, boundary, encodeRecording, previewFrame, trimRange, type Recording } from './cameraRecording.ts';
import { gifWithinLimits } from './gifPlayback.ts';

function pixels(r: number, g = 0, b = 0) {
  const result = new Uint8ClampedArray(RECORD_WIDTH * RECORD_HEIGHT * 4);
  for (let p = 0; p < result.length; p += 4) result.set([r, g, b, 255], p);
  return result;
}
const fixture = (): Recording => ({ duration: 350, frames: [
  { at: 0, pixels: pixels(255) }, { at: 100, pixels: pixels(0, 255) }, { at: 230, pixels: pixels(0, 0, 255) },
] });

test('manual, automatic and competing stops finalize once and retain only recorded frames', () => {
  for (const stops of [[350, 10_000], [10_000, 10_001], [9999, 10_000], [10_000, 9999], [20, 21]]) {
    const results: Recording[] = [];
    const recorder = new CameraRecording(() => pixels(255), r => results.push(r));
    for (let at = 100; at < stops[0]; at += 100) recorder.sample(at);
    for (const at of stops) recorder.stop(at);
    recorder.sample(11_000);
    assert.equal(results.length, 1);
    const result = results[0];
    assert.equal(result.duration, Math.floor(stops[0] / 10) * 10);
    assert.ok(result.frames.every(f => f.at >= 0 && f.at < result.duration));
    assert.ok(result.duration - result.frames.at(-1)!.at >= 20);
  }
  let done = 0;
  const automatic = new CameraRecording(() => pixels(0), () => done++);
  automatic.sample(10_001); automatic.stop(10_000);
  assert.equal(done, 1);
});

test('handles clamp at edges and crossings, including one-frame recordings', () => {
  for (let count = 1; count <= 100; count++) {
    let range: [number, number] = [0, count];
    for (const value of [-100, 0, count, count + 100, NaN, 0.5]) for (const handle of ['start', 'end'] as const) {
      range = trimRange(...range, count, handle, value);
      assert.ok(0 <= range[0] && range[0] < range[1] && range[1] <= count);
    }
  }
});

test('play starts at the selected frame and loops exactly at the end boundary', () => {
  const recording = fixture();
  assert.equal(boundary(recording, 3), 350);
  assert.equal(previewFrame(recording, 1, 3, 0), 1);
  assert.equal(previewFrame(recording, 1, 3, 129), 1);
  assert.equal(previewFrame(recording, 1, 3, 130), 2);
  assert.equal(previewFrame(recording, 1, 3, 249), 2);
  assert.equal(previewFrame(recording, 1, 3, 250), 1);
  assert.equal(previewFrame(recording, 1, 3, 500), 1);
});

test('decoded GIF matches each selected frame and its duration, including a short recording', async () => {
  const cases: [Recording, number, number][] = [[fixture(), 1, 3], [fixture(), 0, 1], [{ duration: 20, frames: [{ at: 0, pixels: pixels(255) }] }, 0, 1]];
  for (const [recording, start, end] of cases) {
    const bytes = await encodeRecording(recording, start, end);
    const gif = parseGIF(bytes.buffer as ArrayBuffer);
    assert.equal(gifWithinLimits(gif), true);
    const frames = decompressFrames(gif, true);
    assert.equal(frames.length, end - start);
    assert.equal(frames.reduce((sum, f) => sum + f.delay, 0), boundary(recording, end) - boundary(recording, start));
    frames.forEach((frame, i) => assert.deepEqual(frame.patch, recording.frames[start + i].pixels));
    assert.ok(gif.frames.some(f => 'application' in f));
  }
});

test('maximum recording fits the existing data URL and GIF decoding limits', async () => {
  const frames = Array.from({ length: 100 }, (_, index) => ({ at: index * 100, pixels: pixels(index % 4 * 85) }));
  const bytes = await encodeRecording({ duration: 10_000, frames }, 0, 100);
  assert.ok('data:image/gif;base64,'.length + Math.ceil(bytes.length / 3) * 4 < 2_000_000);
  const gif = parseGIF(bytes.buffer as ArrayBuffer);
  assert.equal(gifWithinLimits(gif), true);
  assert.equal(decompressFrames(gif, false).reduce((sum, f) => sum + f.delay, 0), 10_000);
});

test('posting locks synchronously, retains generated content after failure, and retries with the same request ID', async () => {
  const submission = new RecordingSubmission(), recording = fixture();
  let generated = 0, sent = 0, release!: () => void;
  const requests: string[] = [];
  const generate = async () => { generated++; await new Promise<void>(r => { release = r; }); return 'gif'; };
  const send = async (image: string, id: string) => { assert.equal(image, 'gif'); requests.push(id); if (++sent === 1) throw new Error('offline'); };
  const pending = submission.post(recording, 1, 3, generate, send);
  assert.equal(await submission.post(recording, 1, 3, generate, send), false);
  release(); await assert.rejects(pending, /offline/);
  assert.equal(submission.busy, false);
  assert.equal(await submission.post(recording, 1, 3, generate, send), true);
  assert.equal(generated, 1); assert.equal(sent, 2); assert.equal(requests[0], requests[1]);
  assert.equal(await submission.post(recording, 1, 3, generate, send), false);
  assert.equal(sent, 2);
});

test('generation failure permits retry, and edited ranges regenerate after a send failure', async () => {
  const submission = new RecordingSubmission(), recording = fixture();
  await assert.rejects(submission.post(recording, 0, 3, async () => { throw new Error('generation'); }, async () => {}));
  await assert.rejects(submission.post(recording, 0, 3, async () => 'full', async () => { throw new Error('send'); }));
  assert.equal(await submission.post(recording, 1, 2, async () => 'trimmed', async image => { assert.equal(image, 'trimmed'); }), true);
  assert.equal(recording.frames.length, 3);
  assert.equal(recording.duration, 350);
});
