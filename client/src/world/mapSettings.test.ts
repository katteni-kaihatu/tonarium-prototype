import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

// store 全体はブラウザを前提とするため、実際の初期値と保存読み込みを取り出す。
const source = readFileSync(new URL('../store.ts', import.meta.url), 'utf8');
const load = source.match(/function load<T>\(key: string, fallback: T\): T \{([\s\S]*?)\n\}/)![1]
  .replace(' as T | null', '');
const initializer = source.match(/mapMode: (load\('tonarium\.mapMode', '[^']+'\))/)![1];

test('未保存では 2D、保存済み三択は再読み込みしても保持する', () => {
  for (const value of [null, 'none', '2d', '3d']) {
    const saved = value === null ? null : JSON.stringify(value);
    const localStorage = { getItem: (key: string) => { assert.equal(key, 'tonarium.mapMode'); return saved; } };
    for (let reload = 0; reload < 2; reload++) {
      const actual = runInNewContext(`function load(key, fallback) {${load}}; ${initializer}`, { localStorage });
      assert.equal(actual, value ?? '2d');
    }
  }
});

test('保存を利用できない端末でも 2D で表示する', () => {
  const localStorage = { getItem: () => { throw new Error('unavailable'); } };
  assert.equal(runInNewContext(`function load(key, fallback) {${load}}; ${initializer}`, { localStorage }), '2d');
});
