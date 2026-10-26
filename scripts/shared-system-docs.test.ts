import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { systemItemDefinitions } from '../shared/system-items.ts';
import { ITEM_INFO, type ItemInfo } from '../shared/items.ts';
import { createSystemMap } from '../shared/system-map.ts';
import { compareVersions, validateSystemMap } from '../shared/systems.ts';
import type { SystemManifest, SystemMap } from '../shared/system-types.ts';
import { validateSystemSubmission } from '../server/system-catalog.ts';
import { readContentMetadata } from '../server/content-translation-sources.ts';
import { GENERATED_SHARED_SYSTEM_DOCS, checkSharedSystemDocs, documentedContentText, generateSharedSystemDocs, itemPlacementExample, renderSharedSystemDocs, systemPlacementExample } from './shared-system-docs.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function temporary(t: { after(fn: () => void): void }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-shared-system-docs-'));
  t.after(() => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}
const fixture = (t: { after(fn: () => void): void }) => {
  const directory = temporary(t);
  fs.cpSync(path.join(root, 'shared-systems'), path.join(directory, 'shared-systems'), { recursive: true });
  return directory;
};
function snapshot(directory: string, prefix = ''): Record<string, { bytes: string; modified: number }> {
  return Object.fromEntries(fs.readdirSync(path.join(directory, prefix), { withFileTypes: true }).flatMap(entry => {
    const relative = prefix + entry.name;
    return entry.isDirectory() ? Object.entries(snapshot(directory, relative + '/')) : [[relative, { bytes: fs.readFileSync(path.join(directory, relative)).toString('base64'), modified: fs.statSync(path.join(directory, relative)).mtimeMs }]];
  }));
}
const runExample = (source: string): SystemMap => new Function('createSystemMap', source.replace(/^import .*;\n/m, '').replace('export const myMap', 'const myMap') + '\nreturn myMap;')(createSystemMap);
const manifest = (version: string, title = '시험 시스템'): SystemManifest => ({
  schema: 1, sdk: 'tonarium-systems/1', id: 'docs-example', version, title, description: '대상을 제어하는 문서 시험', license: 'MIT', credits: ['문서 시험'],
  targets: { display: { capabilities: ['text'], required: false } },
  config: { duration: { type: 'number', default: 1.25, min: 0.001, max: 100 } }, state: {},
  inputs: { start: { payload: { user: 'user' } } }, outputs: { finished: { payload: { user: 'user' } } }, handlers: {},
});
function writeManifest(root: string, value: SystemManifest) {
  const folder = path.join(root, 'shared-systems', value.id, value.version); fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'system.json'), JSON.stringify(value, null, 2) + '\n');
}

test('the catalog has one page per supported ID and keeps every exact source, version, byte count and integrity', () => {
  const bundle = validateSystemSubmission(root), items = systemItemDefinitions(), rendered = renderSharedSystemDocs(root);
  const ids = new Set(bundle.catalog.entries.map(entry => entry.id));
  assert.equal(rendered.size, 1 + items.length + ids.size);
  assert.ok(items.length > 0);
  for (const item of items) {
    const page = rendered.get(`items/${item.id}.md`)!;
    assert.ok(page, item.id);
    assert.ok(page.includes(`| 등록 원본 이름 | ${item.info.name}`));
    assert.ok(page.includes(`"itemId": "${item.id}"`));
    assert.ok(page.includes('position')); assert.ok(page.includes('native')); assert.ok(page.includes('system'));
    assert.ok(page.includes('../../../.claude/skills/add-world/SKILL.md'));
    assert.ok(rendered.get('README.md')!.includes(`](items/${item.id}.md)`));
  }
  for (const unsupported of ['bike', 'talk-card', 'welcome-note', 'image', 'video', 'youtube']) assert.equal(rendered.has(`items/${unsupported}.md`), false);
  for (const entry of bundle.catalog.entries) {
    const page = rendered.get(`systems/${entry.id}.md`)!;
    const bytes = bundle.objects.get(entry.integrity)!;
    assert.ok(page.includes(`../../../shared-systems/${entry.id}/${entry.version}/system.json`));
    assert.ok(page.includes('`' + bytes.length + '`'));
    assert.ok(page.includes('sha256-' + createHash('sha256').update(bytes).digest('hex')));
  }
  assert.ok(rendered.get('systems/timer.md')!.includes('`duration` | `number` | `10` | `0.001` | `86400`'));
  assert.ok(rendered.get('systems/chair.md')!.includes('`user: user`'));
  assert.ok(rendered.get('systems/chair.md')!.includes('참가자 ID를 전달하는 이벤트'));
  assert.ok(rendered.get('README.md')!.includes('../../.claude/skills/add-world/SKILL.md'));
});

test('new supported basic items appear automatically without editing a second documentation ID list', t => {
  const directory = temporary(t), registry = ITEM_INFO as Record<string, ItemInfo>, id = 'docsFreshItem';
  assert.equal(Object.hasOwn(registry, id), false);
  registry[id] = { ...registry.note, name: '追加サンプル', desc: '新しい基本アイテム' };
  t.after(() => { delete registry[id]; });
  generateSharedSystemDocs(directory);
  assert.ok(fs.readFileSync(path.join(directory, 'docs/shared-systems/README.md'), 'utf8').includes(`items/${id}.md`));
  const page = fs.readFileSync(path.join(directory, `docs/shared-systems/items/${id}.md`), 'utf8');
  assert.ok(page.includes(`"itemId": "${id}"`)); assert.ok(page.includes('追加サンプル'));
  assert.deepEqual(checkSharedSystemDocs(directory), []);
});

test('copyable item placements and current system connection examples validate without pinning versions', () => {
  const bundle = validateSystemSubmission(root), rendered = renderSharedSystemDocs(root);
  const checkSavedExample = (page: string, example: string) => {
    assert.ok(page.includes(example));
    assert.ok(page.includes('`shared/my-shared-map.ts`에 저장합니다.'));
    const dependency = /^import \{ createSystemMap \} from '([^']+)';/.exec(example); assert.ok(dependency);
    assert.equal(path.resolve(root, 'shared', dependency[1]), path.join(root, 'shared/system-map.ts'));
    assert.ok(fs.existsSync(path.resolve(root, 'shared', dependency[1])));
  };
  for (const item of systemItemDefinitions()) for (const controlled of [false, true]) {
    const source = itemPlacementExample(item, controlled), map = runExample(source);
    assert.doesNotThrow(() => validateSystemMap(map, bundle.catalog), item.id);
    assert.equal(map.objects[0].position[1], 0);
    assert.equal(map.objects[0].itemId, item.id);
    assert.equal(map.objects[0].itemMode, controlled ? 'system' : 'native');
    assert.ok(source.includes('    "position": [0, 0, -2]'));
    checkSavedExample(rendered.get(`items/${item.id}.md`)!, source);
  }
  const latest = new Map<string, typeof bundle.catalog.entries[number]>();
  for (const entry of bundle.catalog.entries) {
    const previous = latest.get(entry.id);
    if (!previous || compareVersions(entry.version, previous.version) > 0) latest.set(entry.id, entry);
  }
  for (const entry of latest.values()) {
    const example = systemPlacementExample(entry.manifest), map = runExample(example);
    assert.doesNotThrow(() => validateSystemMap(map, bundle.catalog));
    assert.equal(map.systems[0].systemId, entry.id);
    assert.equal(Object.hasOwn(map.systems[0], 'version'), false);
    assert.equal(Object.hasOwn(map.systems[0], 'integrity'), false);
    checkSavedExample(rendered.get(`systems/${entry.id}.md`)!, example);
    if (map.objects.length) assert.ok(example.includes('    "position": [0, 0, 0]'));
    for (const object of map.objects.filter(object => object.capabilities.includes('text'))) {
      assert.equal(object.itemId, 'note'); assert.equal(object.itemMode, 'system');
    }
  }
});

test('visible note displays retain every required capability and their system bindings', t => {
  const directory = temporary(t), source = manifest('1.0.0');
  source.targets.display.capabilities = ['text', 'interact', 'move', 'seat'];
  source.targets.display.required = true;
  writeManifest(directory, source);
  const page = renderSharedSystemDocs(directory).get('systems/docs-example.md')!;
  const expression = /```ts\n([\s\S]*?)\n```/.exec(page); assert.ok(expression);
  const result = runExample(expression[1]);
  assert.doesNotThrow(() => validateSystemMap(result, validateSystemSubmission(directory).catalog));
  assert.equal(result.objects[0].itemId, 'note');
  assert.equal(result.objects[0].itemMode, 'system');
  assert.equal(result.objects[0].position[1], 0);
  assert.deepEqual(result.objects[0].capabilities, source.targets.display.capabilities);
  assert.deepEqual(result.systems[0].bindings.display, [result.objects[0].id]);
});

test('CRLF checkouts retain generated ownership and check and generation preserve equivalent file bytes', t => {
  const directory = fixture(t); generateSharedSystemDocs(directory);
  const target = path.join(directory, 'docs/shared-systems');
  for (const name of renderSharedSystemDocs(directory).keys()) {
    const file = path.join(target, name); fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll('\n', '\r\n'));
  }
  fs.writeFileSync(path.join(target, 'registration.md'), '# 수동 안내\r\n');
  fs.writeFileSync(path.join(target, 'items/manual.md'), '# 수동 아이템 안내\r\n');
  const before = snapshot(target);
  assert.deepEqual(checkSharedSystemDocs(directory), []);
  assert.deepEqual(snapshot(target), before);
  generateSharedSystemDocs(directory);
  assert.deepEqual(snapshot(target), before);
  fs.writeFileSync(path.join(target, 'systems/old.md'), GENERATED_SHARED_SYSTEM_DOCS + '\r\n\r\n# 이전 생성 문서\r\n');
  assert.deepEqual(checkSharedSystemDocs(directory), ['obsolete: docs/shared-systems/systems/old.md']);
  generateSharedSystemDocs(directory);
  assert.deepEqual(snapshot(target), before);
});

test('new releases refresh only one system page, choose the latest numeric contract and retain old source links', t => {
  const directory = temporary(t);
  const old = manifest('1.2.0', '이전 이름'); writeManifest(directory, old);
  generateSharedSystemDocs(directory);
  const before = snapshot(path.join(directory, 'docs/shared-systems'));
  const latest = manifest('1.10.0', '새 이름'); latest.config.duration.default = 2.75; latest.outputs.finished.payload.count = 'number';
  writeManifest(directory, latest);
  assert.ok(checkSharedSystemDocs(directory).includes('outdated: docs/shared-systems/systems/docs-example.md'));
  generateSharedSystemDocs(directory);
  const page = fs.readFileSync(path.join(directory, 'docs/shared-systems/systems/docs-example.md'), 'utf8');
  assert.ok(page.includes('새 이름')); assert.ok(page.includes('`2.75`')); assert.ok(page.includes('`count: number`'));
  assert.ok(page.includes('/1.2.0/system.json')); assert.ok(page.includes('/1.10.0/system.json'));
  for (const [file, data] of Object.entries(before)) if (file.startsWith('items/')) assert.deepEqual(snapshot(path.join(directory, 'docs/shared-systems'))[file], data);
  assert.deepEqual(checkSharedSystemDocs(directory), []);
});

test('generation is deterministic, check is read-only, and only marked stale pages are removed', t => {
  const directory = fixture(t);
  generateSharedSystemDocs(directory);
  const target = path.join(directory, 'docs/shared-systems');
  const first = snapshot(target); generateSharedSystemDocs(directory); assert.deepEqual(snapshot(target), first);
  fs.writeFileSync(path.join(target, 'contracts.md'), '# 수동 공통 규칙\n');
  fs.writeFileSync(path.join(target, 'items/manual.md'), '# 수동 문서\n');
  fs.writeFileSync(path.join(target, 'systems/obsolete.md'), GENERATED_SHARED_SYSTEM_DOCS + '\n\n# 이전 생성 문서\n');
  fs.unlinkSync(path.join(target, 'items/chess.md'));
  fs.appendFileSync(path.join(target, 'systems/timer.md'), '\nwrong generated output\n');
  const beforeCheck = snapshot(directory), problems = checkSharedSystemDocs(directory);
  assert.ok(problems.includes('missing: docs/shared-systems/items/chess.md'));
  assert.ok(problems.includes('outdated: docs/shared-systems/systems/timer.md'));
  assert.ok(problems.includes('obsolete: docs/shared-systems/systems/obsolete.md'));
  assert.deepEqual(snapshot(directory), beforeCheck);
  generateSharedSystemDocs(directory);
  assert.equal(fs.readFileSync(path.join(target, 'contracts.md'), 'utf8'), '# 수동 공통 규칙\n');
  assert.equal(fs.readFileSync(path.join(target, 'items/manual.md'), 'utf8'), '# 수동 문서\n');
  assert.equal(fs.existsSync(path.join(target, 'systems/obsolete.md')), false);
  assert.deepEqual(checkSharedSystemDocs(directory), []);
});

test('manual page collisions are rejected before changing any output', t => {
  const directory = fixture(t), target = path.join(directory, 'docs/shared-systems');
  fs.mkdirSync(path.join(target, 'items'), { recursive: true });
  fs.writeFileSync(path.join(target, 'items/note.md'), '# 내가 작성한 메모 가이드\n');
  const before = snapshot(directory);
  assert.throws(() => generateSharedSystemDocs(directory), /Refusing to overwrite manual/);
  assert.deepEqual(snapshot(directory), before);
  assert.ok(checkSharedSystemDocs(directory).includes('manual file collision: docs/shared-systems/items/note.md'));
});

test('curated Korean text is used only when it matches the source and untrusted Markdown stays literal', t => {
  const directory = temporary(t), source = manifest('1.0.0', '<script>bad</script> | [name]');
  source.description = '원문 `code` | [unsafe](javascript:bad)'; writeManifest(directory, source);
  const metadata = { schema: 1, glossary: {}, entries: {
    'item/note': { fields: { name: { source: '付箋', translations: { ko: '기존 한국어 메모' } } } },
    'system/docs-example/1.0.0': { fields: { title: { source: source.title, translations: { ko: '번역된 이름' } }, description: { source: '낡은 설명', translations: { ko: '사용하면 안 되는 번역' } } } },
  } };
  fs.mkdirSync(path.join(directory, 'content-locales')); fs.writeFileSync(path.join(directory, 'content-locales/metadata.json'), JSON.stringify(metadata));
  const rendered = renderSharedSystemDocs(directory), page = rendered.get('systems/docs-example.md')!;
  assert.ok(page.includes('# 시스템: 번역된 이름'));
  assert.ok(page.includes('&lt;script&gt;bad&lt;/script&gt;'));
  assert.ok(!page.includes('사용하면 안 되는 번역')); assert.ok(!page.includes('[unsafe](javascript:bad)'));
  assert.ok(rendered.get('items/note.md')!.includes('# 아이템: 기존 한국어 메모'));
  const current = readContentMetadata(directory);
  assert.equal(documentedContentText(current, 'item/note', 'name', 'changed'), 'changed');
});

test('string defaults containing Markdown fences stay inside the copyable code block and keep exact values', t => {
  const directory = temporary(t), source = manifest('1.0.0');
  source.config.message = { type: 'string', default: 'pipe | and ``` fenced code' };
  writeManifest(directory, source);
  const rendered = renderSharedSystemDocs(directory).get('systems/docs-example.md')!;
  assert.ok(rendered.includes('````ts\n'));
  const expression = /````ts\n([\s\S]*?)\n````/.exec(rendered); assert.ok(expression);
  const result = runExample(expression[1]);
  assert.equal(result.systems[0].config.message, source.config.message.default);
  assert.doesNotThrow(() => validateSystemMap(result, validateSystemSubmission(directory).catalog));
  assert.ok(rendered.includes('pipe \\| and ``` fenced code'));
});

test('output directory symlinks are rejected and cannot change files outside the catalog', t => {
  const directory = fixture(t), outside = temporary(t), docs = path.join(directory, 'docs'); fs.mkdirSync(docs);
  fs.writeFileSync(path.join(outside, 'sentinel.md'), '# outside\n');
  const link = path.join(docs, 'shared-systems');
  try { fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EPERM') { t.skip('Symlink creation requires OS permission'); return; } throw error; }
  try {
    assert.throws(() => generateSharedSystemDocs(directory), /symlink/);
    assert.throws(() => checkSharedSystemDocs(directory), /symlink/);
    assert.deepEqual(fs.readdirSync(outside), ['sentinel.md']);
    assert.equal(fs.readFileSync(path.join(outside, 'sentinel.md'), 'utf8'), '# outside\n');
  } finally { fs.unlinkSync(link); }
});
