import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const changelogPath = 'shared/changelog.ts';
export const fixMessage = `${changelogPath} の CHANGELOG 配列の先頭に、今回実際に行った変更の日付・見出し・本文を持つ新規項目を追記してください。既存項目は残してください。編集・削除・並べ替え・書式変更・複製だけでは完了できません。`;

// 履歴はコードとして実行せず、既存のデータ形式だけを読み取る。
export function parseChangelog(source) {
  const tokens = [];
  const pattern = /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:\\[\s\S]|[^'\\])*'|"(?:\\[\s\S]|[^"\\])*"|[A-Za-z_$][\w$]*|[^\s]/gy;
  let match;
  while ((match = pattern.exec(source))) {
    if (!/^(?:\s|\/\/|\/\*)/.test(match[0])) tokens.push(match[0]);
  }
  let pos = tokens.findIndex((token, i) => token === 'export' && tokens[i + 1] === 'const' && tokens[i + 2] === 'CHANGELOG');
  if (pos < 0) throw new Error('CHANGELOG の定義が見つかりません。');
  pos += 3;
  while (pos < tokens.length && tokens[pos] !== '=') pos++;
  pos++;
  const expect = (token) => {
    if (tokens[pos++] !== token) throw new Error('CHANGELOG のデータ形式を確認してください。');
  };
  const string = () => {
    const token = tokens[pos++];
    if (!token || !/^['"]/.test(token)) throw new Error('履歴の値は文字列リテラルで記載してください。');
    let value = '';
    for (let i = 1; i < token.length - 1; i++) {
      if (token[i] !== '\\') { value += token[i]; continue; }
      const escape = token[++i];
      const escapes = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' };
      if (escape === 'u' || escape === 'x') {
        const length = escape === 'u' ? 4 : 2;
        const hex = token.slice(i + 1, i + 1 + length);
        if (!new RegExp(`^[0-9a-fA-F]{${length}}$`).test(hex)) throw new Error('文字列のエスケープを確認してください。');
        value += String.fromCharCode(parseInt(hex, 16));
        i += length;
      } else if (escape === '\n') {
        continue;
      } else if (escape === '\r') {
        if (token[i + 1] === '\n') i++;
      } else {
        value += escapes[escape] ?? escape;
      }
    }
    return value;
  };
  const array = (read) => {
    expect('[');
    const values = [];
    while (tokens[pos] !== ']') {
      values.push(read());
      if (tokens[pos] !== ',') break;
      pos++;
    }
    expect(']');
    return values;
  };
  const entries = array(() => {
    expect('{');
    const entry = {};
    while (tokens[pos] !== '}') {
      const key = /^['"]/.test(tokens[pos] ?? '') ? string() : tokens[pos++];
      if (!['date', 'title', 'items', 'tag'].includes(key) || Object.hasOwn(entry, key)) throw new Error('履歴のプロパティを確認してください。');
      expect(':');
      entry[key] = key === 'items' ? array(string) : string();
      if (tokens[pos] !== ',') break;
      pos++;
    }
    expect('}');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date ?? '') || !entry.title?.trim() || !entry.items?.length || entry.items.some(item => !item.trim())) {
      throw new Error('履歴には日付・空でない見出し・本文が必要です。');
    }
    return entry;
  });
  if (tokens[pos] === ';') pos++;
  if (pos !== tokens.length) throw new Error('CHANGELOG はリテラル配列で定義してください。');
  return entries;
}

const signature = ({ date, title, items, tag }) => JSON.stringify([date, title, items, tag ?? null]);

export function checkChangelog(baseSource, currentSource) {
  const base = parseChangelog(baseSource).map(signature);
  const entries = parseChangelog(currentSource);
  const current = entries.map(signature);
  const addedCount = current.length - base.length;
  if (addedCount <= 0) throw new Error('タスクの差分に新規の変更履歴項目がありません。');
  if (current.slice(addedCount).some((entry, i) => entry !== base[i])) {
    throw new Error('比較元の履歴項目と順序を保ち、新規項目を先頭に追記してください。');
  }
  const added = current.slice(0, addedCount);
  if (added.some(entry => base.includes(entry)) || new Set(added).size !== added.length) {
    throw new Error('既存項目の複製ではなく、今回の実施内容を新規項目に記載してください。');
  }
  const dates = entries.map(entry => entry.date);
  if (dates.some((date, i) => i > 0 && date > dates[i - 1])) throw new Error('変更履歴は日付が新しい順に並べてください。');
}

export function run(cwd = process.cwd(), args = process.argv.slice(2)) {
  try {
    const { values } = parseArgs({ args, options: { base: { type: 'string' } }, allowPositionals: false });
    const git = (...argv) => execFileSync('git', argv, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const baseRef = values.base ?? process.env.CHANGELOG_BASE;
    const base = baseRef
      ? git('rev-parse', '--verify', '--end-of-options', `${baseRef}^{commit}`)
      : git('merge-base', 'HEAD', 'origin/main');
    const before = git('show', `${base}:${changelogPath}`);
    checkChangelog(before, readFileSync(resolve(cwd, changelogPath), 'utf8'));
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
