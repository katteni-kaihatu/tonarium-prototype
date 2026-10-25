import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChangelog } from './legacy-changelog.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const signature = ({ date, title, items, tag }) => JSON.stringify([date, title, items, tag ?? null]);
const filenamePattern = /^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/;

export function parseFragment(filename, source) {
  const match = filenamePattern.exec(filename);
  if (!match) throw new Error('履歴ファイル名は YYYY-MM-DD-<英小文字・数字・ハイフンの識別子>.json にしてください。');
  let entry;
  try { entry = JSON.parse(source); } catch { throw new Error('履歴ファイルは JSON オブジェクトで記載してください。'); }
  if (!entry || Array.isArray(entry) || typeof entry !== 'object'
    || Object.keys(entry).some(key => !['date', 'title', 'items', 'tag'].includes(key))
    || entry.date !== match[1] || !Number.isFinite(Date.parse(entry.date))
    || new Date(entry.date).toISOString().slice(0, 10) !== entry.date
    || typeof entry.title !== 'string' || !entry.title.trim()
    || !Array.isArray(entry.items) || !entry.items.length
    || entry.items.some(item => typeof item !== 'string' || !item.trim())
    || (entry.tag !== undefined && (typeof entry.tag !== 'string' || !entry.tag.trim()))) {
    throw new Error('履歴にはファイル名と一致する実在日付 date、空でない title、空でない文字列配列 items、任意の文字列 tag を記載してください。');
  }
  return { ...entry, id: filename.slice(0, -5) };
}

export function readFragments(cwd = root) {
  let files;
  try { files = readdirSync(join(cwd, 'changelog'), { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return new Map(); throw error; }
  const entries = new Map();
  const contents = new Set();
  for (const file of files) {
    if (!file.isFile()) throw new Error('changelog/ には履歴 JSON ファイルだけを配置してください。');
    const entry = parseFragment(file.name, readFileSync(join(cwd, 'changelog', file.name), 'utf8'));
    const content = signature(entry);
    if (contents.has(content)) throw new Error('作業別履歴の内容が重複しています。');
    contents.add(content);
    entries.set(file.name, entry);
  }
  return entries;
}

export function aggregateChangelog(cwd = root) {
  const legacy = parseChangelog(readFileSync(join(cwd, 'shared/changelog.ts'), 'utf8'));
  const existing = new Set(legacy.map(signature));
  const entries = legacy.map((entry, index) => ({ ...entry, id: `legacy-${index}-${createHash('sha256').update(signature(entry)).digest('hex')}` }));
  for (const entry of readFragments(cwd).values()) {
    // 移行時に共通履歴にも追記された項目は、既存の表示を一件だけ残す。
    if (!existing.has(signature(entry))) entries.push(entry);
  }
  return entries.sort((a, b) => a.date === b.date
    ? (a.id.startsWith('legacy-') && b.id.startsWith('legacy-') ? 0
      : a.id.startsWith('legacy-') ? 1 : b.id.startsWith('legacy-') ? -1 : a.id < b.id ? 1 : -1)
    : a.date < b.date ? 1 : -1);
}
