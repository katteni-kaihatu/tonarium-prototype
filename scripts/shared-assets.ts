import fs from 'node:fs';
import path from 'node:path';
import { CatalogStore, validateSubmission } from '../server/shared-catalog.ts';
import { check } from '../shared/shared-assets.ts';

const [mode, source, commit, storePath] = process.argv.slice(2);
check(['validate', 'publish'].includes(mode) && source && commit, 'usage: shared-assets.ts validate|publish SOURCE COMMIT [STORE]');
const store = storePath ? new CatalogStore(path.resolve(storePath)) : undefined;
const bundle = validateSubmission(path.resolve(source), commit, store?.current());
if (mode === 'publish') { check(store, 'persistent store required'); store.publish(bundle); }
else if (store) check(fs.existsSync(path.join(store.directory, 'objects')), 'store');
console.log(`${mode}: ${bundle.catalog.entries.length} assets, ${bundle.catalog.maps.length} maps; commit ${commit}`);
