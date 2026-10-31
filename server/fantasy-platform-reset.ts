import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const FANTASY_PLATFORM_RESET_MARKER = 'fantasy-platform-reset.json';
export const FANTASY_PLATFORM_RESET_VERSION = 1;
const LOCK = '.fantasy-platform-reset.lock';
const FILES = ['fantasy.json', 'fantasy-clock.json', 'fantasy-community.json', 'fantasy-contracts.json', 'fantasy-named-commissions.json', 'fantasy-accounts.json'] as const;
const DIRECTORIES = ['fantasy-backups', 'fantasy-diagnostics'] as const;
const completed = { version: FANTASY_PLATFORM_RESET_VERSION, identity: 'tonarium-platform', completed: true };
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';

function inspect(target: string): fs.Stats | undefined {
  try {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) throw new Error(`RPG reset path cannot be a symbolic link: ${target}`);
    return stat;
  } catch (error) { if (!missing(error)) throw error; }
}

function ancestors(target: string): void {
  const parent = path.dirname(target);
  if (parent !== target) ancestors(parent);
  const stat = inspect(target);
  if (stat && !stat.isDirectory()) throw new Error(`RPG reset data ancestor must be a directory: ${target}`);
}

export function validFantasyPlatformResetMarker(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const marker = value as Record<string, unknown>;
  return marker.version === completed.version && marker.identity === completed.identity && marker.completed === true;
}

function isComplete(root: string): boolean {
  const marker = path.join(root, FANTASY_PLATFORM_RESET_MARKER), stat = inspect(marker);
  if (!stat) return false;
  try {
    if (!stat.isFile() || stat.size > 1024 || !validFantasyPlatformResetMarker(JSON.parse(fs.readFileSync(marker, 'utf8')))) throw new Error('Unsupported marker');
  } catch (error) { throw new Error(`Invalid RPG platform reset marker: ${marker}`, { cause: error }); }
  return true;
}

function validateTree(target: string, directory: boolean): void {
  const stat = inspect(target);
  if (!stat) return;
  if (directory ? !stat.isDirectory() : !stat.isFile()) throw new Error(`Unexpected RPG reset path type: ${target}`);
  if (directory) for (const name of fs.readdirSync(target)) {
    const child = path.join(target, name), childStat = inspect(child);
    if (childStat) validateTree(child, childStat.isDirectory());
  }
}

function removeTree(root: string, target: string): void {
  ancestors(path.dirname(target));
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('RPG reset path escaped its data directory');
  const stat = inspect(target);
  if (!stat) return;
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(target)) removeTree(root, path.join(target, name));
    ancestors(path.dirname(target));
    inspect(target);
    fs.rmdirSync(target);
  } else {
    if (!stat.isFile()) throw new Error(`Unexpected RPG reset path type: ${target}`);
    fs.unlinkSync(target);
  }
}

function publish(root: string): void {
  ancestors(root);
  const temporary = path.join(root, `.fantasy-platform-reset-${randomUUID()}.tmp`);
  try {
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(completed)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    inspect(path.join(root, FANTASY_PLATFORM_RESET_MARKER));
    fs.renameSync(temporary, path.join(root, FANTASY_PLATFORM_RESET_MARKER));
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) { if (!missing(error)) throw error; }
  }
}

function withResetLock(root: string, action: () => void): void {
  const lock = path.join(root, LOCK), nonce = randomUUID();
  inspect(lock);
  let fd: number;
  try { fd = fs.openSync(lock, 'wx', 0o600); }
  catch (error) { throw new Error(`RPG platform reset lock prevents startup: ${lock}. Stop all writers and follow docs/fantasy-backups.md before quarantining a stale lock.`, { cause: error }); }
  const owned = fs.fstatSync(fd);
  try {
    fs.writeFileSync(fd, JSON.stringify({ version: 1, pid: process.pid, nonce }));
    fs.fsyncSync(fd);
    action();
  } finally {
    fs.closeSync(fd);
    const current = inspect(lock);
    if (!current || current.dev !== owned.dev || current.ino !== owned.ino) throw new Error(`RPG platform reset lock changed ownership: ${lock}`);
    fs.unlinkSync(lock);
  }
}

export function resetFantasyPlatformData(dataDirectory: string): void {
  const root = path.resolve(dataDirectory);
  ancestors(root);
  if (isComplete(root)) return;
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  withResetLock(root, () => {
    if (isComplete(root)) return;
    for (const name of FILES) validateTree(path.join(root, name), false);
    for (const name of DIRECTORIES) validateTree(path.join(root, name), true);
    for (const name of ['runtime.lock', 'restore.lock']) {
      const lock = path.join(root, 'fantasy-backups', name);
      if (inspect(lock)) throw new Error(`Existing RPG backup lock prevents platform reset: ${lock}. Stop all writers and follow docs/fantasy-backups.md.`);
    }
    for (const name of [...FILES, ...DIRECTORIES]) removeTree(root, path.join(root, name));
    publish(root);
  });
}

export function markFantasyPlatformDataCurrent(dataDirectory: string): void {
  const root = path.resolve(dataDirectory);
  ancestors(root);
  if (isComplete(root)) return;
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  withResetLock(root, () => { if (!isComplete(root)) publish(root); });
}
