import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { aggregateChangelog } from '../scripts/changelog.mjs';

const output = process.argv[2];
if (!output) throw new Error('変更履歴の出力先を指定してください');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(aggregateChangelog()));
