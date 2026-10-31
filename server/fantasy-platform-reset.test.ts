import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resetFantasyPlatformData, markFantasyPlatformDataCurrent, FANTASY_PLATFORM_RESET_MARKER } from './fantasy-platform-reset.ts';

function fixture(t: { after: (fn: () => void) => void }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-platform-reset-'));
  t.after(() => {
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.ok(path.basename(directory).startsWith('tonarium-platform-reset-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}
const saves = ['fantasy.json', 'fantasy-clock.json', 'fantasy-community.json', 'fantasy-contracts.json', 'fantasy-named-commissions.json', 'fantasy-accounts.json'];

test('upgrade removes only legacy RPG state and its private backups and diagnostics', t => {
  const directory = fixture(t);
  for (const name of saves) fs.writeFileSync(path.join(directory, name), 'legacy');
  for (const name of ['fantasy-backups', 'fantasy-diagnostics']) {
    fs.mkdirSync(path.join(directory, name, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(directory, name, 'nested', 'credentials.json'), 'old-private-data');
  }
  const retained = ['auth.json', 'home.json', 'friends.json', 'messages.json', 'ad-access.json', 'npc-history.json', 'fantasy-not-registered.json', '.ids-v1'];
  for (const name of retained) fs.writeFileSync(path.join(directory, name), `keep:${name}`);
  resetFantasyPlatformData(directory);
  for (const name of [...saves, 'fantasy-backups', 'fantasy-diagnostics']) assert.equal(fs.existsSync(path.join(directory, name)), false, name);
  for (const name of retained) assert.equal(fs.readFileSync(path.join(directory, name), 'utf8'), `keep:${name}`);
  assert.ok(fs.existsSync(path.join(directory, FANTASY_PLATFORM_RESET_MARKER)));
});

test('new install and later process restarts keep newly saved progress and backups', t => {
  const directory = path.join(fixture(t), 'new-data');
  resetFantasyPlatformData(directory);
  fs.writeFileSync(path.join(directory, 'fantasy.json'), '{"new-owner":{"character":"new"}}');
  fs.mkdirSync(path.join(directory, 'fantasy-backups'));
  fs.writeFileSync(path.join(directory, 'fantasy-backups', 'new.json'), 'new-backup');
  const result = spawnSync(process.execPath, ['--experimental-transform-types', '--input-type=module', '-e', 'import {resetFantasyPlatformData} from "./server/fantasy-platform-reset.ts"; resetFantasyPlatformData(process.argv[1]);', directory], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.readFileSync(path.join(directory, 'fantasy.json'), 'utf8').includes('new-owner'));
  assert.equal(fs.readFileSync(path.join(directory, 'fantasy-backups', 'new.json'), 'utf8'), 'new-backup');
});

test('deliberately marked current fixtures are retained without an environment bypass', t => {
  const directory = fixture(t), file = path.join(directory, 'fantasy.json');
  fs.writeFileSync(file, 'prepared-current-fixture');
  markFantasyPlatformDataCurrent(directory);
  resetFantasyPlatformData(directory);
  assert.equal(fs.readFileSync(file, 'utf8'), 'prepared-current-fixture');
});

test('malformed or unsupported completed markers fail closed without deleting state', t => {
  for (const value of ['', '{broken', '{}', '{"version":999,"completed":true}']) {
    const directory = fixture(t), file = path.join(directory, 'fantasy.json');
    fs.writeFileSync(file, 'private-progress');
    fs.writeFileSync(path.join(directory, FANTASY_PLATFORM_RESET_MARKER), value);
    assert.throws(() => resetFantasyPlatformData(directory), /marker/i);
    assert.equal(fs.readFileSync(file, 'utf8'), 'private-progress');
  }
});

test('failed deletions leave no completion marker and retry finishes the partial reset', t => {
  const directory = fixture(t);
  for (const name of saves) fs.writeFileSync(path.join(directory, name), 'old');
  const unlink = fs.unlinkSync;
  fs.unlinkSync = ((file: fs.PathLike) => { if (String(file) === path.join(directory, 'fantasy-clock.json')) throw Object.assign(new Error('Injected deletion failure'), { code: 'EIO' }); return unlink(file); }) as typeof fs.unlinkSync;
  try { assert.throws(() => resetFantasyPlatformData(directory), /Injected deletion failure/); } finally { fs.unlinkSync = unlink; }
  assert.equal(fs.existsSync(path.join(directory, FANTASY_PLATFORM_RESET_MARKER)), false);
  resetFantasyPlatformData(directory);
  for (const name of saves) assert.equal(fs.existsSync(path.join(directory, name)), false);
});

test('failed atomic marker publication never admits startup and can be retried', t => {
  const directory = fixture(t), rename = fs.renameSync;
  fs.renameSync = ((from: fs.PathLike, to: fs.PathLike) => { if (String(to) === path.join(directory, FANTASY_PLATFORM_RESET_MARKER)) throw new Error('Injected marker failure'); return rename(from, to); }) as typeof fs.renameSync;
  try { assert.throws(() => resetFantasyPlatformData(directory), /Injected marker failure/); } finally { fs.renameSync = rename; }
  assert.equal(fs.existsSync(path.join(directory, FANTASY_PLATFORM_RESET_MARKER)), false);
  resetFantasyPlatformData(directory);
  assert.ok(fs.existsSync(path.join(directory, FANTASY_PLATFORM_RESET_MARKER)));
});

test('failed marker content writes leave no marker and release the owned lock for retry', t => {
  const directory = fixture(t), write = fs.writeFileSync;
  fs.writeFileSync = ((file: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView, ...args: unknown[]) => {
    if (typeof data === 'string' && data.includes('tonarium-platform')) throw new Error('Injected marker content failure');
    return Reflect.apply(write, fs, [file, data, ...args]);
  }) as typeof fs.writeFileSync;
  try { assert.throws(() => resetFantasyPlatformData(directory), /Injected marker content failure/); } finally { fs.writeFileSync = write; }
  assert.equal(fs.existsSync(path.join(directory, FANTASY_PLATFORM_RESET_MARKER)), false);
  assert.equal(fs.existsSync(path.join(directory, '.fantasy-platform-reset.lock')), false);
  resetFantasyPlatformData(directory);
  assert.ok(fs.existsSync(path.join(directory, FANTASY_PLATFORM_RESET_MARKER)));
});

test('active, stale and malformed reset locks fail closed without taking another lease', t => {
  for (const lock of [{ version: 1, pid: process.pid, nonce: 'live' }, { version: 1, pid: 2147483647, nonce: 'stale' }, {}]) {
    const directory = fixture(t), file = path.join(directory, 'fantasy.json');
    fs.writeFileSync(file, 'untouched');
    fs.writeFileSync(path.join(directory, '.fantasy-platform-reset.lock'), JSON.stringify(lock));
    assert.throws(() => resetFantasyPlatformData(directory), /lock/i);
    assert.equal(fs.readFileSync(file, 'utf8'), 'untouched');
  }
});

test('live legacy RPG backup writers block upgrade before any state is removed', t => {
  const directory = fixture(t);
  fs.writeFileSync(path.join(directory, 'fantasy.json'), 'old');
  fs.mkdirSync(path.join(directory, 'fantasy-backups'));
  fs.writeFileSync(path.join(directory, 'fantasy-backups', 'runtime.lock'), JSON.stringify({ version: 1, pid: process.pid, nonce: 'legacy-server', at: Date.now() }));
  assert.throws(() => resetFantasyPlatformData(directory), /running|lock/i);
  assert.equal(fs.readFileSync(path.join(directory, 'fantasy.json'), 'utf8'), 'old');
});

test('symlink targets, nested links and linked data ancestors cannot escape reset bounds', t => {
  const directory = fixture(t), outside = fixture(t);
  fs.writeFileSync(path.join(outside, 'private.json'), 'keep-outside');
  fs.symlinkSync(outside, path.join(directory, 'fantasy-backups'), 'junction');
  assert.throws(() => resetFantasyPlatformData(directory), /symbolic|link/i);
  fs.unlinkSync(path.join(directory, 'fantasy-backups'));
  fs.mkdirSync(path.join(directory, 'fantasy-backups'));
  fs.symlinkSync(outside, path.join(directory, 'fantasy-backups', 'nested'), 'junction');
  assert.throws(() => resetFantasyPlatformData(directory), /symbolic|link/i);
  fs.symlinkSync(directory, path.join(outside, 'linked-data'), 'junction');
  assert.throws(() => resetFantasyPlatformData(path.join(outside, 'linked-data', 'child')), /symbolic|link/i);
  assert.equal(fs.readFileSync(path.join(outside, 'private.json'), 'utf8'), 'keep-outside');
});
