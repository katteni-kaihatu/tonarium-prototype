import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSystemTemplate, prepareSystemBundle, SystemCatalogStore, validateSystemSubmission } from '../server/system-catalog.ts';

export function runSystemsCLI(args: string[]): void {
  const [mode, source, destination, commit] = args;
  if (mode === 'init') {
    if (!source || !destination) throw new Error('usage: systems init ID SUBMISSION_ROOT');
    const manifest = createSystemTemplate(source);
    const directory = path.resolve(destination, 'shared-systems', source, manifest.version);
    if (fs.existsSync(directory)) throw new Error('system version directory already exists');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'system.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    console.log(`Created ${source}@${manifest.version}: ${directory}`); return;
  }
  if (!['validate', 'prepare', 'publish'].includes(mode) || !source) throw new Error('usage: systems init ID ROOT | validate SOURCE [BASELINE] [COMMIT] | prepare SOURCE OUTPUT [COMMIT] | publish SOURCE STORE [COMMIT]');
  if ((mode === 'prepare' || mode === 'publish') && !destination) throw new Error('output/store directory required');
  const store = mode === 'publish' ? new SystemCatalogStore(path.resolve(destination)) : undefined;
  const previous = mode === 'validate' && destination ? validateSystemSubmission(path.resolve(destination)).catalog : undefined;
  const bundle = validateSystemSubmission(path.resolve(source), commit, previous);
  if (mode === 'prepare') prepareSystemBundle(bundle, path.resolve(destination));
  if (store) store.publish(bundle);
  console.log(`${mode}: ${bundle.catalog.entries.length} systems; ${bundle.catalog.commit}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runSystemsCLI(process.argv.slice(2));
