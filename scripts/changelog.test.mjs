import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { aggregateChangelog, parseFragment, root } from './changelog.mjs';
import { parseChangelog } from './legacy-changelog.mjs';
import { changelogPlugin } from './changelog-plugin.mjs';

const entry = (date, title) => ({ date, title, items: ['実施内容'] });

test('作業別 JSON の名前・日付・必須項目・型を検証する', () => {
  const valid = entry('2026-10-25', '変更');
  assert.equal(parseFragment('2026-10-25-task-123.json', JSON.stringify(valid)).id, '2026-10-25-task-123');
  for (const filename of ['task.json', '2026-10-25-Task.json', '2026-10-25-a_b.json', '2026-10-25-.json']) {
    assert.throws(() => parseFragment(filename, JSON.stringify(valid)));
  }
  for (const data of [null, [], { ...valid, date: '2026-10-24' }, { ...valid, title: ' ' },
    { ...valid, items: [] }, { ...valid, items: [''] }, { ...valid, items: [3] },
    { ...valid, tag: 3 }, { ...valid, tag: '' }, { ...valid, extra: true }, { date: valid.date }]) {
    assert.throws(() => parseFragment('2026-10-25-task.json', JSON.stringify(data)));
  }
  assert.throws(() => parseFragment('2026-02-30-task.json', JSON.stringify(entry('2026-02-30', '無効日付'))));
  assert.throws(() => parseFragment('2026-10-25-task.json', 'process.exit()'));
});

test('複数ファイル・既存全件・同日順序・移行時の重複・再集約を検証する', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'tonarium-aggregate-'));
  try {
    mkdirSync(join(cwd, 'shared'));
    mkdirSync(join(cwd, 'changelog'));
    const legacy = [entry('2026-10-25', '既存先頭'), entry('2026-10-25', '既存次'), entry('2026-10-18', '古い履歴')];
    const source = `export const CHANGELOG = ${JSON.stringify(legacy)};`;
    writeFileSync(join(cwd, 'shared/changelog.ts'), source);
    const add = (filename, data) => writeFileSync(join(cwd, 'changelog', filename), JSON.stringify(data));
    add('2026-10-25-a.json', entry('2026-10-25', '同日A'));
    add('2026-10-26-z.json', entry('2026-10-26', '最新'));
    add('2026-10-25-z.json', entry('2026-10-25', '同日Z'));
    add('2026-10-25-migration.json', legacy[0]);
    const result = aggregateChangelog(cwd);
    assert.deepEqual(result.map(e => e.title), ['最新', '同日Z', '同日A', ...legacy.map(e => e.title)]);
    assert.equal(new Set(result.map(e => e.id)).size, result.length);
    assert.deepEqual(result.filter(e => e.id.startsWith('legacy-')).map(({ id, ...e }) => e), legacy);
    assert.deepEqual(aggregateChangelog(cwd), result);
    assert.equal(readFileSync(join(cwd, 'shared/changelog.ts'), 'utf8'), source);

    add('2026-10-25-copy.json', entry('2026-10-25', '同日A'));
    assert.throws(() => aggregateChangelog(cwd), /重複/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('Vite ビルドで既存履歴と作業別ファイルを集約する', async () => {
  const { build } = await import('vite');
  const cwd = mkdtempSync(join(tmpdir(), 'tonarium-vite-history-'));
  try {
    mkdirSync(join(cwd, 'shared'));
    mkdirSync(join(cwd, 'changelog'));
    writeFileSync(join(cwd, 'shared/changelog.ts'), `export const CHANGELOG = ${JSON.stringify([entry('2026-10-24', '既存')])};`);
    writeFileSync(join(cwd, 'changelog/2026-10-25-build.json'), JSON.stringify(entry('2026-10-25', '追加')));
    const result = aggregateChangelog(cwd);
    writeFileSync(join(cwd, 'main.js'), "import { CHANGELOG } from './shared/changelog.ts'; console.log(JSON.stringify(CHANGELOG));");
    const bundle = await build({ configFile: false, root: cwd, logLevel: 'silent', plugins: [changelogPlugin(cwd)],
      build: { write: false, minify: false, lib: { entry: join(cwd, 'main.js'), formats: ['es'], fileName: 'history' } } });
    const code = [bundle].flat().flatMap(output => output.output).find(file => file.type === 'chunk').code;
    const messages = [];
    const { runInNewContext } = await import('node:vm');
    runInNewContext(code, { console: { log: value => messages.push(value) } });
    assert.deepEqual(JSON.parse(messages[0]), result);

  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('リポジトリの既存履歴を全件保持し、今回の移行項目は一件だけ表示する', () => {
  const legacy = parseChangelog(readFileSync(join(root, 'shared/changelog.ts'), 'utf8'));
  const result = aggregateChangelog();
  assert.deepEqual(result.filter(e => e.id.startsWith('legacy-')).map(({ id, ...e }) => e), legacy);
  assert.equal(result.filter(e => e.title === '作業別の変更履歴ファイルを自動集約').length, 1);
});

test('ネイティブ用の出力も同じ集約結果となり、再出力しても増えない', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'tonarium-native-history-'));
  try {
    const output = join(cwd, 'changelog.json');
    for (let i = 0; i < 2; i++) {
      const run = spawnSync(process.execPath, [join(root, 'native/export-changelog.ts'), output], { encoding: 'utf8' });
      assert.equal(run.status, 0, run.stderr);
      assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), aggregateChangelog());
    }
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
