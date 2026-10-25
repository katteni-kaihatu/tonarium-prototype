import { run } from '../../scripts/check-changelog.mjs';

const base = process.env.PR_BASE_SHA || process.argv[2];
if (!/^[0-9a-f]{7,40}$/i.test(base || '')) {
  console.error('A pull request base commit SHA is required.');
  process.exitCode = 2;
} else {
  process.exitCode = run(process.cwd(), ['--base', base]);
}