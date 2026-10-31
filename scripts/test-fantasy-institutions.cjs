const { build } = require('esbuild');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const entries = ['fantasy-combat-contribution', 'fantasy-guild-rendezvous', 'fantasy-underworld-panel', 'fantasy-shared-quest-board', 'fantasy-travel-gear'];
const directory = path.resolve('work/qa/fantasy-institutions-ui');

(async () => {
  fs.mkdirSync(directory, { recursive: true });
  let failed = false;
  for (const entry of entries) {
    const source = path.resolve(`client/src/world/${entry}.test.tsx`);
    const output = path.join(directory, `${entry}.cjs`);
    await build({
      entryPoints: [source], outfile: output, bundle: true, platform: 'node', format: 'cjs', target: 'node22', packages: 'external',
      define: { 'import.meta.url': JSON.stringify(pathToFileURL(source).href) }, loader: { '.css': 'empty' }, logLevel: 'silent',
      plugins: [{ name: 'isolated-render', setup(builder) {
        // CJS バンドル内の相対 require と通信境界を隔離する。
        builder.onLoad({ filter: /fantasy-(?:guild-rendezvous|shared-quest-board|travel-gear)\.test\.tsx$/ }, args => ({
          contents: fs.readFileSync(args.path, 'utf8').replace('const require = createRequire(import.meta.url), react =', 'const react =').replace(/^require\.cache.*$/mg, ''), loader: 'tsx',
        }));
        builder.onLoad({ filter: /client[\\/]src[\\/]net[\\/]ws\.ts$/ }, () => ({
          contents: 'export const send = () => { throw Error("Rendering cannot send network requests"); };', loader: 'js',
        }));
      } }],
    });
    const result = spawnSync(process.execPath, ['--test', output], { encoding: 'utf8' });
    process.stdout.write(`${entry}\n${result.stdout ?? ''}${result.stderr ?? ''}`);
    if (result.error) process.stderr.write(String(result.error));
    failed ||= result.status !== 0;
  }
  process.exitCode = failed ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
