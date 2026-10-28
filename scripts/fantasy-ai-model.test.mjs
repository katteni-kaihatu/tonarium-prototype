import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as module from './fantasy-ai-model.mjs';

const bytes = Buffer.from('tiny verified model fixture');
const fixtureManifest = {
  filename: 'fixture.gguf',
  url: 'https://fixture.invalid/model.gguf',
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
};
const enoughDisk = async () => ({ bavail: 1024n, bsize: 1024n * 1024n });

async function directoryFor(t) {
  const directory = await mkdtemp(join(tmpdir(), 'fantasy-ai-model-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('downloads and verifies a model into its final filename', async (t) => {
  const directory = await directoryFor(t);
  const server = createServer((request, response) => {
    response.write(bytes.subarray(0, 9));
    response.end(bytes.subarray(9));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const result = await module.prepareModel({
    directory,
    manifest: { ...fixtureManifest, url: `http://127.0.0.1:${server.address().port}/model` },
    statfs: enoughDisk,
  });

  assert.deepEqual(await readFile(join(directory, 'fixture.gguf')), bytes);
  assert.deepEqual(await readdir(directory), ['fixture.gguf']);
  assert.deepEqual(result, { path: join(directory, 'fixture.gguf'), reused: false });
});

test('writes each streamed chunk before requesting the next without exposing the final path', async (t) => {
  const directory = await directoryFor(t);
  let inspectedFirstChunk = false;
  const body = new ReadableStream({
    start(stream) {
      stream.enqueue(bytes.subarray(0, 9));
    },
    async pull(stream) {
      const files = await readdir(directory);
      assert.equal(files.length, 1);
      assert.ok(files[0].endsWith('.part'));
      assert.deepEqual(await readFile(join(directory, files[0])), bytes.subarray(0, 9));
      inspectedFirstChunk = true;
      stream.enqueue(bytes.subarray(9));
      stream.close();
    },
  }, { highWaterMark: 0 });
  await module.prepareModel({ directory, manifest: fixtureManifest, fetch: async () => new Response(body), statfs: enoughDisk });
  assert.ok(inspectedFirstChunk);
  assert.deepEqual(await readdir(directory), ['fixture.gguf']);
});

test('reuses a verified existing model without network or free disk checks', async (t) => {
  const directory = await directoryFor(t);
  const path = join(directory, 'fixture.gguf');
  await writeFile(path, bytes);

  const result = await module.prepareModel({
    directory,
    manifest: fixtureManifest,
    fetch: async () => { throw new Error('network is unavailable'); },
    statfs: async () => { throw new Error('free disk check should not run'); },
  });

  assert.deepEqual(result, { path, reused: true });
  assert.deepEqual(await readFile(path), bytes);
});

test('rejects insufficient free disk before starting a download', async (t) => {
  const directory = await directoryFor(t);
  await assert.rejects(module.prepareModel({
    directory,
    manifest: fixtureManifest,
    fetch: async () => { throw new Error('download started before disk check'); },
    statfs: async () => ({ bavail: 128n * 1024n * 1024n, bsize: 1n }),
  }), /free disk space/i);
  assert.deepEqual(await readdir(directory), []);
});

for (const [name, data, expected] of [
  ['truncated download', bytes.subarray(1), /size/i],
  ['oversized download', Buffer.concat([bytes, Buffer.from('extra')]), /size/i],
  ['corrupt download', Buffer.alloc(bytes.length, 1), /SHA-256/i],
]) {
  test(`rejects a ${name}, preserves the previous model, and cleans only its own partial`, async (t) => {
    const directory = await directoryFor(t);
    const previous = Buffer.from('previous file');
    await writeFile(join(directory, 'fixture.gguf'), previous);
    await writeFile(join(directory, '.other.part'), 'unrelated');

    await assert.rejects(module.prepareModel({
      directory,
      manifest: fixtureManifest,
      fetch: async () => new Response(data),
      statfs: enoughDisk,
    }), expected);

    assert.deepEqual(await readFile(join(directory, 'fixture.gguf')), previous);
    assert.deepEqual((await readdir(directory)).sort(), ['.other.part', 'fixture.gguf']);
  });
}

test('replaces a same-size corrupt existing model after verified download', async (t) => {
  const directory = await directoryFor(t);
  await writeFile(join(directory, 'fixture.gguf'), Buffer.alloc(bytes.length));
  await module.prepareModel({ directory, manifest: fixtureManifest, fetch: async () => new Response(bytes), statfs: enoughDisk });
  assert.deepEqual(await readFile(join(directory, 'fixture.gguf')), bytes);
});

test('rejects an HTTP error without publishing an unverified model', async (t) => {
  const directory = await directoryFor(t);
  await assert.rejects(module.prepareModel({
    directory,
    manifest: fixtureManifest,
    fetch: async () => new Response('missing', { status: 404 }),
    statfs: enoughDisk,
  }), /HTTP 404/);
  assert.deepEqual(await readdir(directory), []);
});

test('cleans a download aborted after its first chunk', async (t) => {
  const directory = await directoryFor(t);
  const controller = new AbortController();
  const body = new ReadableStream({
    start(stream) {
      stream.enqueue(bytes.subarray(0, 9));
    },
    pull(stream) {
      controller.abort(new Error('fixture stopped'));
      stream.enqueue(bytes.subarray(9));
      stream.close();
    },
  }, { highWaterMark: 0 });
  await assert.rejects(module.prepareModel({
    directory,
    manifest: fixtureManifest,
    fetch: async () => new Response(body),
    signal: controller.signal,
    statfs: enoughDisk,
  }), /fixture stopped/);
  assert.deepEqual(await readdir(directory), []);
});

test('stops reading an oversized response immediately and cancels the stream', async (t) => {
  const directory = await directoryFor(t);
  let cancelled = false;
  const body = new ReadableStream({
    start(stream) {
      stream.enqueue(Buffer.alloc(bytes.length + 1));
    },
    pull() {
      throw new Error('read beyond the expected model size');
    },
    cancel() {
      cancelled = true;
    },
  }, { highWaterMark: 0 });
  await assert.rejects(module.prepareModel({
    directory,
    manifest: fixtureManifest,
    fetch: async () => new Response(body),
    statfs: enoughDisk,
  }), /exceeds expected size/);
  assert.ok(cancelled);
  assert.deepEqual(await readdir(directory), []);
});

test('rejects a disconnected download while keeping the previous model intact', async (t) => {
  const directory = await directoryFor(t);
  await writeFile(join(directory, 'fixture.gguf'), 'old model');
  const body = new ReadableStream({
    start(stream) {
      stream.enqueue(bytes.subarray(0, 9));
    },
    pull(stream) {
      stream.error(new Error('connection interrupted'));
    },
  }, { highWaterMark: 0 });
  await assert.rejects(module.prepareModel({
    directory,
    manifest: fixtureManifest,
    fetch: async () => new Response(body),
    statfs: enoughDisk,
  }), /connection interrupted/);
  assert.equal(await readFile(join(directory, 'fixture.gguf'), 'utf8'), 'old model');
  assert.deepEqual(await readdir(directory), ['fixture.gguf']);
});

test('parses Linux MemAvailable in KiB without confusing total or free memory', () => {
  assert.equal(module.parseAvailableMemoryMb('MemTotal: 16777216 kB\nMemFree: 123 kB\nMemAvailable: 2359807 kB\n'), 2304);
  assert.throws(() => module.parseAvailableMemoryMb('MemTotal: 16777216 kB\nMemFree: 8388608 kB\n'), /MemAvailable/);
  assert.throws(() => module.parseAvailableMemoryMb('MemAvailable: nonsense kB\n'), /MemAvailable/);
});

test('validates the operator memory threshold and applies the default', () => {
  assert.equal(module.parseMinimumAvailableMb(undefined), 2304);
  assert.equal(module.parseMinimumAvailableMb('256'), 256);
  assert.equal(module.parseMinimumAvailableMb('65536'), 65536);
  for (const value of ['', '0', '255', '65537', '2304.5', 'NaN', '2e3']) {
    assert.throws(() => module.parseMinimumAvailableMb(value), /NPC_AI_MIN_AVAILABLE_MB/);
  }
});

test('stops CLI preparation when Linux available memory is below the operator threshold', async () => {
  await assert.rejects(module.runModelPreparation({
    platform: 'linux',
    env: {},
    readMeminfo: async () => 'MemTotal: 16777216 kB\nMemAvailable: 2359295 kB\n',
    prepare: async () => { throw new Error('model preparation started despite low memory'); },
  }), /available memory.*2304 MiB/i);
});

test('allows sufficient Linux memory and passes the fixed model manifest to preparation', async () => {
  const result = await module.runModelPreparation({
    platform: 'linux',
    env: { MODEL_DIRECTORY: '/operator-models', NPC_AI_MIN_AVAILABLE_MB: '512', MODEL_URL: 'https://untrusted.invalid/arbitrary' },
    readMeminfo: async () => 'MemAvailable: 524288 kB\n',
    prepare: async (options) => {
      assert.equal(options.directory, '/operator-models');
      assert.equal(options.manifest.url, 'https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/90862c4b9d2787eaed51d12237eafdfe7c5f6077/Qwen3-1.7B-Q8_0.gguf');
      assert.equal(options.manifest.filename, 'Qwen3-1.7B-Q8_0.gguf');
      assert.equal(options.manifest.bytes, 1834426016);
      assert.equal(options.manifest.sha256, '061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a');
      assert.ok(options.signal instanceof AbortSignal);
      return { path: '/operator-models/Qwen3-1.7B-Q8_0.gguf', reused: true };
    },
  });
  assert.equal(result.reused, true);
});

test('skips Linux memory reads on other hosts and uses the default model directory', async () => {
  await module.runModelPreparation({
    platform: 'win32',
    env: {},
    readMeminfo: async () => { throw new Error('Linux-only file was read'); },
    prepare: async (options) => {
      assert.equal(options.directory, '/models');
      return { path: '/models/Qwen3-1.7B-Q8_0.gguf', reused: false };
    },
  });
});
