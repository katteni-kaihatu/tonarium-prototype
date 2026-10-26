import path from 'node:path';
import { check } from '../shared/shared-assets.ts';
import { validateSubmission } from '../server/shared-catalog.ts';
const [candidate, commit, baseline, baseCommit] = process.argv.slice(2);
check(candidate && baseline && commit && baseCommit, 'candidate/commit/baseline/commit required');
const previous = validateSubmission(path.resolve(baseline), baseCommit).catalog;
const result = validateSubmission(path.resolve(candidate), commit, previous);
console.log(`Verified ${result.catalog.entries.length} assets and ${result.catalog.maps.length} maps at ${commit}`);
