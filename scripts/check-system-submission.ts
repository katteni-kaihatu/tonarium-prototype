import path from 'node:path';
import { validateSystemSubmission } from '../server/system-catalog.ts';

const [candidate, commit, baseline, baseCommit] = process.argv.slice(2);
if (!candidate || !commit || !baseline || !baseCommit) throw new Error('candidate/commit/baseline/commit required');
const previous = validateSystemSubmission(path.resolve(baseline), baseCommit).catalog;
const bundle = validateSystemSubmission(path.resolve(candidate), commit, previous);
console.log(`Verified ${bundle.catalog.entries.length} systems at ${commit}`);
