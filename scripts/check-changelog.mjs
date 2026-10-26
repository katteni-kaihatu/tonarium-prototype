import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const changelogPath = 'shared/changelog.ts';
export const fixMessage = 'changelog/YYYY-MM-DD-<識別子>.json を新規追加し、今回実際に行った変更の date・title・items を記載してください。既存履歴は残してください。';

export { parseChangelog, checkChangelog } from './legacy-changelog.mjs';
import { checkChangelog, parseChangelog } from './legacy-changelog.mjs';
import { readFragments, parseFragment, signature } from './changelog.mjs';

export function run(cwd = process.cwd(), args = process.argv.slice(2)) {
  try {
    const { values } = parseArgs({ args, options: { base: { type: 'string' } }, allowPositionals: false });
    const git = (...argv) => execFileSync('git', argv, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const baseRef = values.base ?? process.env.CHANGELOG_BASE;
    // 作業ブランチは develop から切るので、develop にだけある他人の履歴を自分の新規に数えないよう develop と比べる
    const hasDevelop = () => { try { git('rev-parse', '--verify', '--quiet', 'refs/remotes/origin/develop'); return true; } catch { return false; } };
    const base = baseRef
      ? git('rev-parse', '--verify', '--end-of-options', `${baseRef}^{commit}`)
      : git('merge-base', 'HEAD', hasDevelop() ? 'origin/develop' : 'origin/main');
    const before = git('show', `${base}:${changelogPath}`);
    const after = readFileSync(resolve(cwd, changelogPath), 'utf8');
    if (JSON.stringify(parseChangelog(before)) !== JSON.stringify(parseChangelog(after))) checkChangelog(before, after);
    const current = readFragments(cwd);
    const previous = new Map(git('ls-tree', '-r', '--name-only', base, '--', 'changelog/').split('\n').filter(Boolean).map(path => {
      const filename = path.slice('changelog/'.length);
      return [filename, parseFragment(filename, git('show', `${base}:${path}`))];
    }));
    for (const [filename, entry] of previous) {
      if (!current.has(filename) || signature(current.get(filename)) !== signature(entry)) {
        throw new Error('既存の作業別履歴の編集・削除・改名はできません。');
      }
    }
    const added = [...current].filter(([filename]) => !previous.has(filename));
    if (!added.length) throw new Error('タスクの差分に新規の作業別履歴ファイルがありません。');
    const legacy = new Set(parseChangelog(before).map(signature));
    if (added.some(([, entry]) => legacy.has(signature(entry)))) throw new Error('既存履歴の複製ではなく今回の実施内容を記載してください。');
    console.log('変更履歴チェック成功: タスクの新規項目を確認しました。');
    return 0;
  } catch (error) {
    // Git のエラーにはパスなどが含まれるため、そのまま出力しない。
    const reason = error.status !== undefined || error.code ? '比較元または履歴を読み取れません。--base <タスク開始時のコミット> を指定し、必要な Git 履歴を取得してください。' : error.message;
    console.error(`変更履歴チェック失敗: ${reason}\n${fixMessage}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = run();
