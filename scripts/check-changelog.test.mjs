import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkChangelog, parseChangelog } from './check-changelog.mjs';

const entry = (title) => ({ date: '2026-10-25', title, items: ['実施内容'] });
const old = entry('既存の変更');
const older = entry('以前の変更');
const added = entry('今回の文書更新');
const source = (entries) => `export const CHANGELOG: ChangelogEntry[] = ${JSON.stringify(entries)};`;
const base = source([old, older]);

test('未記載・既存項目の編集・削除・並べ替え・複製だけでは失敗する', () => {
  for (const entries of [
    [old, older],
    [{ ...old, title: '編集した見出し' }, older],
    [{ ...old, items: ['編集した本文'] }, older],
    [{ ...old, date: '2026-10-26' }, older],
    [older],
    [older, old],
    [old, old, older],
    [added, old],
    [old, added, older],
    [old, older, added],
    [added, older, old],
    [added, old, old, older],
    [added, added, old, older],
    [{ ...added, date: '2026-10-24' }, old, older],
  ]) assert.throws(() => checkChangelog(base, source(entries)));
});

test('引用符・空白・コメント・末尾カンマ・プロパティ順の変更は新規項目にならない', () => {
  const formatted = `export const CHANGELOG: ChangelogEntry[] = [
    {items: ['実施内容',], title: '既存の変更', date: '2026-10-25',},
    // 新規項目を追加したというコメント
    {date: '2026-10-25', title: '以前の変更', items: ['実施内容']},
  ];`;
  assert.throws(() => checkChangelog(base, formatted));
  assert.doesNotThrow(() => checkChangelog(base, formatted.replace('= [', `= [${JSON.stringify(added)},`)));
});

test('同じ日付でも新しい実施内容の追記で成功する', () => {
  assert.doesNotThrow(() => checkChangelog(base, source([added, old, older])));
  assert.doesNotThrow(() => checkChangelog(base, source([added, entry('別の保守作業'), old, older])));
});

test('空の項目・文字列以外・実行式・不明な形式は拒否する', () => {
  for (const current of [
    source([{ ...added, title: '' }, old, older]),
    source([{ ...added, items: [] }, old, older]),
    source([{ ...added, items: [' '] }, old, older]),
    source([{ ...added, items: [1] }, old, older]),
    'export const CHANGELOG = run();',
    'export const CHANGELOG = [{ ...entry }];',
    '// export const CHANGELOG = [];',
    source([added, old, older]).replace(/;$/, '.slice(1);'),
    source([added, old, older]).replace(/;$/, '.filter(() => false);'),
  ]) assert.throws(() => checkChangelog(base, current));
});

test('文字列のエスケープと省略可能なタグを読み取れる', () => {
  const data = `export const CHANGELOG = [{date:'2026-10-25', title:'開発者\\'の変更', items:["引用符\\\"と\\n改行", '\\u5b9f施\\x41'], tag:'保守'}];`;
  assert.deepEqual(parseChangelog(data), [{ date: '2026-10-25', title: "開発者'の変更", items: ['引用符"と\n改行', '実施A'], tag: '保守' }]);
});

test('CLI はタスク全体の Git 比較元と作業ツリーを比較し、失敗時に修正方法を表示する', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'tonarium-changelog-'));
  const cli = fileURLToPath(new URL('./check-changelog.mjs', import.meta.url));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', env: { ...process.env, CHANGELOG_BASE: '' } });
  try {
    git('init', '-b', 'main');
    git('config', 'user.name', 'Changelog test');
    git('config', 'user.email', 'test@example.invalid');
    mkdirSync(join(cwd, 'shared'));
    const path = join(cwd, 'shared/changelog.ts');
    mkdirSync(join(cwd, 'changelog'));
    const fragment = join(cwd, 'changelog/2026-10-25-test-task.json');
    writeFileSync(path, base);
    git('add', '.');
    git('-c', 'core.hooksPath=', 'commit', '-m', 'base');
    const baseCommit = git('rev-parse', 'HEAD');
    git('update-ref', 'refs/remotes/origin/main', baseCommit);

    const missing = run('--base', baseCommit);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /changelog\/YYYY-MM-DD/);
    assert.match(missing.stderr, /今回実際に行った変更/);
    assert.equal(run().status, 1);
    assert.equal(run('--base', 'missing-ref').status, 1);

    writeFileSync(path, source([added, old, older]));
    assert.equal(run('--base', baseCommit).status, 1);
    writeFileSync(path, base);
    writeFileSync(fragment, JSON.stringify(added));
    assert.equal(run('--base', baseCommit).status, 0);
    writeFileSync(path, source([entry('置き換えられた履歴'), older]));
    assert.equal(run('--base', baseCommit).status, 1);
    writeFileSync(path, base);
    assert.equal(run('--base', baseCommit).status, 0);
    git('add', '.');
    assert.equal(run('--base', baseCommit).status, 0);
    git('-c', 'core.hooksPath=', 'commit', '-m', 'task changelog');
    writeFileSync(join(cwd, 'maintenance.md'), '同じタスクの文書更新');
    git('add', '.');
    git('-c', 'core.hooksPath=', 'commit', '-m', 'task maintenance');
    assert.equal(run('--base', baseCommit).status, 0);
    assert.equal(run().status, 0);
    git('update-ref', 'refs/remotes/origin/develop', 'HEAD');
    assert.equal(run().status, 1);
    git('update-ref', '-d', 'refs/remotes/origin/develop');
    assert.equal(run('--base', 'HEAD^').status, 1);
    const existingBase = git('rev-parse', 'HEAD');
    const second = join(cwd, 'changelog/2026-10-25-second-task.json');
    writeFileSync(second, JSON.stringify(entry('次の作業')));
    assert.equal(run('--base', existingBase).status, 0);
    writeFileSync(fragment, JSON.stringify(entry('改変')));
    assert.equal(run('--base', existingBase).status, 1);
    rmSync(fragment);
    assert.equal(run('--base', existingBase).status, 1);
    writeFileSync(fragment, JSON.stringify(added));
    writeFileSync(second, JSON.stringify(added));
    assert.equal(run('--base', existingBase).status, 1);
    writeFileSync(second, '{ invalid JSON');
    assert.equal(run('--base', existingBase).status, 1);
    writeFileSync(second, JSON.stringify(old));
    assert.equal(run('--base', existingBase).status, 1);
    writeFileSync(second, JSON.stringify(entry('次の作業')));
    writeFileSync(path, source([old]));
    assert.equal(run('--base', existingBase).status, 1);
    writeFileSync(path, base);
    assert.equal(run('--base', existingBase).status, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('完了処理と全 PR の CI が履歴チェックを必須で実行する', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['check:completion'], 'npm run check:changelog && npm run check:content-locales && npm run typecheck && npm run build');
  const ci = readFileSync(new URL('../.github/workflows/web-checks.yml', import.meta.url), 'utf8');
  assert.match(ci, /pull_request:\s+branches: \[main, develop\]/);
  assert.doesNotMatch(ci, /paths(?:-ignore)?:|continue-on-error:/);
  assert.match(ci, /fetch-depth: 0/);
  assert.match(ci, /CHANGELOG_BASE:.*github.event.pull_request.base.sha/);
  assert.match(ci, /run: npm run test:changelog/);
  assert.match(ci, /run: npm run check:completion/);
});
