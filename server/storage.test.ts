import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FileStorage, S3Storage, type ObjectStorage } from './storage.ts';

test('file storage writes, serves by URL and deletes', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tonarium-objects-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const s: ObjectStorage = new FileStorage(dir);
  await s.put('icons/abc-1.jpg', Buffer.from('jpeg'), 'image/jpeg');
  assert.equal(await readFile(path.join(dir, 'icons/abc-1.jpg'), 'utf8'), 'jpeg');
  assert.equal(s.url('icons/abc-1.jpg'), '/objects/icons/abc-1.jpg');
  await s.delete('icons/abc-1.jpg');
  await assert.rejects(readFile(path.join(dir, 'icons/abc-1.jpg')));
});

test('keys that could leave the storage are refused', async () => {
  const s: ObjectStorage = new FileStorage(os.tmpdir());
  for (const key of ['../x.jpg', 'a/../../x.jpg', '/abs.jpg', 'icons/x', 'Icons/X.JPG', 'a//b.jpg']) {
    await assert.rejects(s.put(key, Buffer.from(''), 'image/jpeg'), Error, key);
    assert.throws(() => s.url(key), Error, key);
  }
});

// 手元の SeaweedFS（npm run services）で確かめるときだけ動かす: S3_TEST_ENDPOINT=http://localhost:8333
test('S3 storage puts objects readable from the public URL', { skip: !process.env.S3_TEST_ENDPOINT }, async () => {
  const endpoint = process.env.S3_TEST_ENDPOINT!;
  const s = new S3Storage({ endpoint, region: 'auto', bucket: 'tonarium-test', accessKeyId: 'dev', secretAccessKey: 'dev', publicUrl: `${endpoint}/tonarium-test`, prefix: 'test/' });
  await s.ensureBucket();
  const key = `icons/${randomUUID()}.jpg`;
  await s.put(key, Buffer.from('hello'), 'image/jpeg');
  const res = await fetch(s.url(key));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/jpeg');
  assert.equal(await res.text(), 'hello');
  await s.delete(key);
  assert.equal((await fetch(s.url(key))).status, 404);
});
