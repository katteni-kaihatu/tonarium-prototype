const { build } = require('esbuild');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const output = path.resolve('work/qa/fantasy-terrain-ambience-tests.cjs');
build({ stdin: { contents: "import './client/src/world/fantasy-terrain-theme.test.ts'; import './client/src/world/fantasy-terrain-ambience.test.tsx'; import './client/src/world/fantasy-town-players.test.tsx';", resolveDir: process.cwd(), sourcefile: 'fantasy-terrain-tests.ts', loader: 'ts' }, outfile: output, bundle: true, platform: 'node', format: 'cjs', target: 'node22', packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', plugins: [{ name: 'isolated-network', setup(builder) {
  builder.onLoad({ filter: /client[\\/]src[\\/]net[\\/]ws\.ts$/ }, () => ({ contents: 'export const send = () => {};', loader: 'js' }));
} }] }).then(() => {
  const result = spawnSync(process.execPath, ['--test', output], { cwd: process.cwd(), encoding: 'utf8' });
  process.stdout.write(result.stdout); process.stderr.write(result.stderr); process.exitCode = result.status ?? 1;
}).catch(error => { console.error(error); process.exitCode = 1; });
