import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const file = 'shared/changelog.ts';
const base = process.env.PR_BASE_SHA || process.argv[2];
if (!/^[0-9a-f]{7,40}$/i.test(base || '')) {
  console.error('A pull request base commit SHA is required.');
  process.exit(2);
}

function entries(source) {
  const start = source.indexOf('export const CHANGELOG:');
  if (start < 0) throw new Error(`${file} has no CHANGELOG array`);
  const end = source.indexOf('\n];',start);
  if (end < 0) throw new Error(`${file} has no closing CHANGELOG array`);
  const section = source.slice(start,end);
  return [...section.matchAll(/^  \{([\s\S]*?)^  \},?/gm)].map(([,block]) => {
    const date = block.match(/^    date:\s*['"](\d{4}-\d{2}-\d{2})['"]/m)?.[1];
    const title = block.match(/^    title:\s*['"]([^'"\n]+)['"]/m)?.[1];
    const items = block.match(/^    items:\s*\[([\s\S]*?)\]/m)?.[1]?.trim();
    if (!date || !title || !items) throw new Error(`${file} contains an incomplete entry`);
    return `${date}\u0000${title}`;
  });
}

try {
  const before = execFileSync('git',['show',`${base}:${file}`],{encoding:'utf8'});
  const after = readFileSync(file,'utf8');
  const existing = new Set(entries(before));
  const added = entries(after).filter(entry => !existing.has(entry));
  if (!added.length) {
    console.error(`Every PR must add a new dated entry with a title and items to ${file}.`);
    process.exit(1);
  }
  console.log(`Changelog check passed: ${added.length} new entry/entries.`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
