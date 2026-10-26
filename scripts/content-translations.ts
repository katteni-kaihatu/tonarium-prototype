import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { collectContentDocuments, readContentMetadata } from '../server/content-translation-sources.ts';
import { ContentTranslationStore } from '../server/content-translations.ts';
import { readSystemBundle, validateSystemSubmission } from '../server/system-catalog.ts';
import { contentTranslationConfig } from '../server/content-translation-config.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2];
try {
  if (mode !== 'validate' && mode !== 'translate') throw new Error('Use validate or translate.');
  const metadata = readContentMetadata(root);
  const catalog = fs.existsSync(path.join(root, 'shared-systems')) ? validateSystemSubmission(root).catalog : readSystemBundle(path.join(root, 'system-bundle')).catalog;
  const documents = collectContentDocuments(catalog, metadata);
  if (mode === 'translate') {
    const config = contentTranslationConfig(process.env, false);
    const store = new ContentTranslationStore(path.join(process.env.DATA_DIR ?? path.join(root, 'data'), 'content-translations'), config.translate, {
      glossary: metadata.glossary, profile: config.profile,
    });
    await store.register(documents);
    console.log(`Saved content translations: ${Object.keys(store.catalog().entries).length} registered documents. Missing translations retain their original text.`);
  } else console.log(`Content metadata valid: ${documents.length} registered documents.`);
} catch {
  console.error('Content metadata check failed. Check content-locales/metadata.json and registered source definitions.');
  process.exitCode = 1;
}
