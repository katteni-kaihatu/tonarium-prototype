import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHANGELOG } from '../../../shared/changelog.ts';
import { filterChangelog, loadChangelogSeen, markChangelogSeen, useChangelog } from './changelog.ts';
import type { ChangelogEntry } from '../../../shared/changelog.ts';

test('開発・保守だけを初期表示から除外し、オン・オフと見出し・本文検索をANDで適用する', () => {
  const entries: ChangelogEntry[] = [
    { date: '2026-10-25', title: 'Shared feature', items: ['本文'], tag: '新機能' },
    { date: '2026-10-25', title: 'Maintenance', items: ['Shared body'], tag: '開発・保守' },
    { date: '2026-10-25', title: 'タグなし', items: ['shared body'] },
    { date: '2026-10-25', title: '開発・保守という見出し', items: ['本文'], tag: '改善' },
  ];
  assert.deepEqual(filterChangelog(entries, ''), [entries[0], entries[2], entries[3]]);
  assert.deepEqual(filterChangelog(entries, '', true), entries);
  assert.deepEqual(filterChangelog(entries, '', false), [entries[0], entries[2], entries[3]]);
  for (const include of [false, true]) {
    assert.deepEqual(filterChangelog(entries, 'SHARED', include), include ? entries.slice(0, 3) : [entries[0], entries[2]]);
    assert.deepEqual(filterChangelog(entries, '', include), include ? entries : [entries[0], entries[2], entries[3]]);
    assert.deepEqual(filterChangelog(entries, '見つからない', include), []);
  }
  assert.deepEqual(filterChangelog(entries, 'Maintenance'), []);
  assert.deepEqual(filterChangelog([], '', true), []);
});

test('履歴は日付の新しい順で、日付・見出し・本文を持つ', () => {
  assert.ok(CHANGELOG.length >= 3);
  CHANGELOG.forEach((entry, i) => {
    assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(entry.title && entry.items.length && entry.items.every(Boolean));
    if (i) assert.ok(CHANGELOG[i - 1].date >= entry.date);
  });
});

test('既読日付を保存して再読み込みし、保存できない環境では今回だけ既読にする', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    } });
    assert.ok(CHANGELOG[0].date > loadChangelogSeen());
    markChangelogSeen();
    assert.equal(values.get('tonarium.changelog.seen'), CHANGELOG[0].date);
    assert.equal(useChangelog.getState().seen, CHANGELOG[0].date);
    assert.equal(loadChangelogSeen(), CHANGELOG[0].date);
    assert.equal(CHANGELOG[0].date > loadChangelogSeen(), false);
    Reflect.deleteProperty(globalThis, 'localStorage');
    assert.equal(loadChangelogSeen(), '');
    assert.doesNotThrow(markChangelogSeen);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('denied'); } });
    assert.equal(loadChangelogSeen(), '');
    useChangelog.setState({ seen: '' });
    assert.doesNotThrow(markChangelogSeen);
    assert.equal(useChangelog.getState().seen, CHANGELOG[0].date);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: () => null, setItem: () => { throw new Error('denied'); },
    } });
    assert.doesNotThrow(markChangelogSeen);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
