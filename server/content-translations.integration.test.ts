import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, writeFile, readFile, readdir, stat, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { testServerEnv } from './test-db.ts';
import { devLogin } from './test-auth.ts';
import { fileURLToPath } from 'node:url';
import { ITEM_INFO } from '../shared/items.ts';
import { ITEM_USAGE } from '../shared/item-usage.ts';
import { WORLDS } from '../shared/worlds.ts';
import type { ContentTranslationCatalog } from '../shared/content-translations.ts';
import type { SystemCatalog } from '../shared/system-types.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function until<T>(read: () => Promise<T | undefined>, timeout = 15000): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await read();
    if (result !== undefined) return result;
    await delay(25);
  }
  throw new Error('Timed out waiting for local content translation server');
}

async function unusedPort() {
  const listener = net.createServer();
  await new Promise<void>((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
  const port = (listener.address() as net.AddressInfo).port;
  await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return port;
}

async function stop(child: ChildProcess) {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
  let timeout: ReturnType<typeof setTimeout> | undefined;
  child.kill();
  await Promise.race([exited, new Promise<void>(resolve => { timeout = setTimeout(resolve, 5000); })]);
  clearTimeout(timeout);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await exited;
  }
}

async function cacheSnapshot(directory: string) {
  const folder = path.join(directory, 'content-translations');
  const files = (await readdir(folder)).filter(name => /^[a-f0-9]{64}\.json$/.test(name)).sort();
  return Promise.all(files.map(async name => {
    const file = path.join(folder, name);
    return { name, text: await readFile(file, 'utf8'), mtime: (await stat(file)).mtimeMs };
  }));
}

test('deployed content translation HTTP registers once, persists results and leaves chat and system originals independent', { timeout: 60000 }, async t => {
  const dbEnv = await testServerEnv(t);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tonarium-content-http-'));
  const sessions = path.join(directory, 'sessions.json'), environment = path.join(directory, 'test.env');
  await writeFile(sessions, JSON.stringify({ name: 'Content translation test', sessions: [] }));
  await writeFile(environment, '');
  const children: ChildProcess[] = [];
  t.after(async () => {
    for (const child of children) await stop(child);
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  async function start() {
    const port = await unusedPort(), base = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
      cwd: root,
      env: {
        ...process.env, ...dbEnv, DOTENV_CONFIG_PATH: environment, DOTENV_CONFIG_OVERRIDE: 'false', DOTENV_CONFIG_QUIET: 'true',
        OPENAPI_KEY: '', CHAT_TRANSLATION_PROVIDER: 'openai', CHAT_TRANSLATION_MOCK_FAILURE: '0',
        CONTENT_TRANSLATION_PROVIDER: 'mock', CONTENT_TRANSLATION_MODEL: 'gpt-4o-mini',
        SERVER_PORT: String(port), DATA_DIR: directory, SESSIONS_FILE: sessions,
        LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '', KOKOSYNC_URL: 'http://127.0.0.1:1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    let ready = false, error: Error | undefined;
    child.on('error', reason => { error = reason; });
    child.stdout?.on('data', (chunk: Buffer) => { if (chunk.toString().includes('server on')) ready = true; });
    child.stderr?.resume();
    await until(async () => {
      if (error) throw error;
      assert.ok(child.exitCode === null && child.signalCode === null, 'local server exited before becoming ready');
      return ready ? true : undefined;
    });
    return { child, base };
  }

  async function contentCatalog(base: string) {
    const response = await fetch(`${base}/api/content-translations`, { signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
    const value = await response.json() as ContentTranslationCatalog;
    assert.equal(value.schema, 1);
    assert.equal(typeof value.pending, 'boolean');
    return value;
  }
  async function completeCatalog(base: string) {
    return until(async () => {
      const catalog = await contentCatalog(base);
      return catalog.pending ? undefined : catalog;
    });
  }

  const first = await start(), catalog = await completeCatalog(first.base);
  assert.deepEqual(catalog.entries['item/note'].fields.name, {
    source: ITEM_INFO.note.name, translations: { ja: '付箋', en: 'Sticky note', ko: '메모' },
  });
  assert.equal(catalog.entries['item/note'].fields.usage.source, ITEM_USAGE.note);
  assert.deepEqual(catalog.entries['world/cafe'].fields.name, {
    source: WORLDS.cafe.name, translations: { ja: 'カフェ', en: 'Café', ko: '카페' },
  });
  assert.deepEqual(catalog.entries['system/button/1.0.0'].fields.title, {
    source: '버튼', translations: { ja: 'ボタン', en: 'Button', ko: '버튼' },
  });
  assert.deepEqual(catalog.entries['item/bike'].fields.desc, {
    source: ITEM_INFO.bike.desc,
    translations: { ja: ITEM_INFO.bike.desc, en: `[en mock] ${ITEM_INFO.bike.desc}`, ko: `[ko mock] ${ITEM_INFO.bike.desc}` },
  });
  for (const id of Object.keys(ITEM_INFO)) assert.ok(catalog.entries[`item/${id}`]);
  for (const id of Object.keys(WORLDS)) assert.ok(catalog.entries[`world/${id}`]);
  assert.ok(catalog.entries['product/bike']);

  const head = await fetch(`${first.base}/api/content-translations`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('cache-control'), 'no-store');
  assert.equal(await head.text(), '');
  const post = await fetch(`${first.base}/api/content-translations`, { method: 'POST', body: '{}' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');

  const chatText = 'Hello from an isolated HTTP test.';
  assert.equal((await fetch(`${first.base}/api/translate`, { method: 'POST', body: '{}' })).status, 401, 'chat translation needs a login');
  const reader = await devLogin(first.base, 'Reader');
  const chat = await fetch(`${first.base}/api/translate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...reader.headers }, body: JSON.stringify({ text: chatText, targetLanguage: 'ko' }),
  });
  assert.equal(chat.status, 200);
  assert.deepEqual(await chat.json(), { text: chatText, sourceLanguage: null, status: 'unavailable' });

  const systemsResponse = await fetch(`${first.base}/api/shared-systems`);
  assert.equal(systemsResponse.status, 200);
  const systems = await systemsResponse.json() as SystemCatalog;
  assert.ok(systems.entries.length >= 4);
  for (const entry of systems.entries) {
    const original = await readFile(path.join(root, 'shared-systems', entry.id, entry.version, 'system.json'));
    assert.deepEqual(entry.manifest, JSON.parse(original.toString('utf8')));
    assert.equal(entry.id, entry.manifest.id);
    assert.equal(entry.version, entry.manifest.version);
    const originalResponse = await fetch(`${first.base}/system-originals/${entry.integrity}`);
    assert.equal(originalResponse.status, 200);
    assert.deepEqual(Buffer.from(await originalResponse.arrayBuffer()), original);
    assert.equal(catalog.entries[`system/${entry.id}/${entry.version}`].fields.title.source, entry.manifest.title);
  }

  const saved = await cacheSnapshot(directory);
  assert.ok(saved.length > 0, 'mock-generated translations are persisted separately from originals');
  for (let i = 0; i < 3; i++) assert.deepEqual(await contentCatalog(first.base), catalog);
  assert.deepEqual(await cacheSnapshot(directory), saved, 'HTTP reads do not rewrite cached translations');

  await stop(first.child);
  const restarted = await start(), restored = await completeCatalog(restarted.base);
  assert.deepEqual(restored, catalog);
  assert.deepEqual(await cacheSnapshot(directory), saved, 'restart reuses saved results without rewriting them');
});
