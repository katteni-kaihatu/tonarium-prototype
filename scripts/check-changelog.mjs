import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const changelogPath = 'shared/changelog.ts';
export const modes = ['develop', 'main', 'release'];
export const fixMessages = {
  develop: '変更履歴はリリース担当が main への反映時にまとめて作成します。changelog/ と shared/changelog.ts の変更を取り消し、利用者向けの変更は PR 本文の「利用者向けの変更」に書いてください。',
  main: '既存の履歴を元に戻し、changelog/ の JSON 形式を docs/changelog.md に合わせてください。',
  release: 'changelog/YYYY-MM-DD-<識別子>.json を新規追加し、反映する変更の date・title・items を記載してください。既存履歴は残してください。'
};

export { parseChangelog, checkChangelog } from './legacy-changelog.mjs';
import { checkChangelog, parseChangelog } from './legacy-changelog.mjs';
import { readFragments, parseFragment, signature } from './changelog.mjs';

export function run(cwd = process.cwd(), args = process.argv.slice(2)) {
  let mode = 'develop';
  try {
    const { values } = parseArgs({ args, options: { base: { type: 'string' }, mode: { type: 'string' } }, allowPositionals: false });
    mode = values.mode || process.env.CHANGELOG_MODE || 'develop';
    if (!modes.includes(mode)) throw new Error(`--mode は ${modes.join(' / ')} のいずれかにしてください。`);
    const git = (...argv) => execFileSync('git', argv, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const baseRef = values.base ?? process.env.CHANGELOG_BASE;
    // 作業ブランチは develop から切るので、develop にだけある他人の履歴を自分の変更に数えないよう develop と比べる
    const hasDevelop = () => { try { git('rev-parse', '--verify', '--quiet', 'refs/remotes/origin/develop'); return true; } catch { return false; } };
    const base = baseRef
      ? git('rev-parse', '--verify', '--end-of-options', `${baseRef}^{commit}`)
      : git('merge-base', 'HEAD', hasDevelop() ? 'origin/develop' : 'origin/main');
    const before = git('show', `${base}:${changelogPath}`);
    const after = readFileSync(resolve(cwd, changelogPath), 'utf8');
    const legacyChanged = JSON.stringify(parseChangelog(before)) !== JSON.stringify(parseChangelog(after));
    const current = readFragments(cwd);
    const previous = new Map(git('ls-tree', '-r', '--name-only', base, '--', 'changelog/').split('\n').filter(Boolean).map(path => {
      const filename = path.slice('changelog/'.length);
      return [filename, parseFragment(filename, git('show', `${base}:${path}`))];
    }));
    const added = [...current].filter(([filename]) => !previous.has(filename));
    if (mode === 'develop' && (legacyChanged || added.length || [...previous].some(([filename, entry]) => !current.has(filename) || signature(current.get(filename)) !== signature(entry)))) {
      throw new Error('develop 向けの作業では変更履歴を追加・編集しません。');
    }
    if (legacyChanged) checkChangelog(before, after);
    for (const [filename, entry] of previous) {
      if (!current.has(filename) || signature(current.get(filename)) !== signature(entry)) {
        throw new Error('既存の作業別履歴の編集・削除・改名はできません。');
      }
    }
    if (mode === 'release' && !added.length) throw new Error('反映する変更の新規履歴ファイルがありません。');
    const legacy = new Set(parseChangelog(before).map(signature));
    if (added.some(([, entry]) => legacy.has(signature(entry)))) throw new Error('既存履歴の複製ではなく今回の変更を記載してください。');
    console.log(mode === 'develop' ? '変更履歴チェック成功: 履歴は変更されていません。' : `変更履歴チェック成功: 既存履歴の保持と形式を確認しました（新規 ${added.length} 件）。`);
    return 0;
  } catch (error) {
    // Git のエラーにはパスなどが含まれるため、そのまま出力しない。
    const reason = error.status !== undefined || error.code ? '比較元または履歴を読み取れません。--base <タスク開始時のコミット> を指定し、必要な Git 履歴を取得してください。' : error.message;
    console.error(`変更履歴チェック失敗: ${reason}\n${fixMessages[mode] || fixMessages.develop}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = run();
