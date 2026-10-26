import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { systemDemoMap } from '../../../shared/system-demo.ts';
import type { SystemManifest, SystemObject } from '../../../shared/system-types.ts';
import { getLanguage, setLanguage } from '../i18n/core.ts';
import { LANGUAGES } from '../i18n/locale.ts';
import { ITEM_INFO } from '../i18n/static.ts';
import { SystemItemCatalog } from './SystemItemCatalog.tsx';
import { SystemLibraryGuide } from './SystemLibraryGuide.tsx';
import { systemDescription, systemObjectLabel, systemTitle } from './catalog-labels.ts';
import { systemErrorText } from './messages.ts';

const copy = {
  ja: {
    usage: '共有システムの使い方', intro: '共有システムは、マップのオブジェクトにつないで使う動作です。',
    registration: '新しいシステムの登録ガイド', items: '既存アイテムをIDで配置する',
    automatic: 'Tonariumに新しい基本アイテムを追加してデプロイすると、この一覧にも自動で表示されます。',
    titles: ['ボタン', 'タイマー', '椅子'], descriptions: ['マップで作ったオブジェクト', 'サーバー時刻を基準に', '選んだ参加者を'],
    controls: ['開始', '一時停止', 'リセット', '座る', 'クリック: タイマー開始'],
    occupied: 'この椅子は別の参加者が使用しています。', catalogError: '登録されたシステム一覧を読み込めませんでした。',
  },
  en: {
    usage: 'How to use shared systems', intro: 'Shared systems are behaviors that you connect to objects in your map.',
    registration: 'Register a new system', items: 'Place existing items by ID',
    automatic: 'New basic items appear here automatically after they are added to Tonarium and deployed.',
    titles: ['Button', 'Timer', 'Chair'], descriptions: ['Pressing an object created by the map', 'Runs a countdown in seconds', 'Seats a selected participant'],
    controls: ['Start', 'Pause', 'Reset', 'Sit', 'Click: start timer'],
    occupied: 'Another participant is already using this chair.', catalogError: 'Could not load the registered systems.',
  },
  ko: {
    usage: '공유 시스템 사용법', intro: '공유 시스템은 맵의 오브젝트에 연결해서 쓰는 동작입니다.',
    registration: '새 시스템 등록 가이드', items: '기존 아이템을 ID로 배치하기',
    automatic: 'Tonarium에 새 기본 아이템을 추가하고 배포하면 이 목록에도 자동으로 표시됩니다.',
    titles: ['버튼', '타이머', '의자'], descriptions: ['맵에서 만든 오브젝트를', '서버 시간을 기준으로', '선택한 참가자를'],
    controls: ['시작', '일시정지', '초기화', '앉기', '클릭: 타이머 시작'],
    occupied: '이미 다른 참가자가 앉아 있습니다.', catalogError: '등록된 시스템 목록을 불러오지 못했습니다.',
  },
};

test('basic item names added after the original language catalog follow the selected language', t => {
  const previous = getLanguage(); t.after(() => setLanguage(previous));
  const names = { ja: ['お絵描き伝言', '鏡', 'ジャンプ台', 'AD ポータル'], en: ['Drawing relay', 'Mirror', 'Jump pad', 'AD portal'], ko: ['그림 전달 게임', '거울', '점프대', 'AD 포털'] };
  for (const language of LANGUAGES) {
    setLanguage(language);
    assert.deepEqual([ITEM_INFO.telephone.name, ITEM_INFO.mirror.name, ITEM_INFO.jumpPad.name, ITEM_INFO.antimatter.name], names[language]);
  }
});

const decode = (value: string) => value.replace(/&(?:amp|lt|gt|quot|#x27);/g, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'" })[entity]!);
const text = (html: string) => decode(html.replace(/<[^>]*>/g, ''));
const blocks = (html: string, tag: string) => [...html.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map(match => decode(match[1]));

test('open library guidance and item help follow the selected language without translating code', t => {
  const previous = getLanguage(); t.after(() => setLanguage(previous));
  let previousCode: string[] | undefined, previousExamples: string[] | undefined;
  for (const language of LANGUAGES) {
    setLanguage(language);
    const guide = renderToStaticMarkup(<SystemLibraryGuide />), items = renderToStaticMarkup(<SystemItemCatalog />);
    const html = guide + items, visible = text(html), expected = copy[language];
    for (const value of [expected.usage, expected.intro, expected.registration, expected.items, expected.automatic]) assert.ok(visible.includes(value), `${language}: ${value}`);
    assert.doesNotMatch(html, /\bss(?:Guide|Catalog|Play|Error|Library)[A-Z]\w*/);
    const code = blocks(html, 'code').sort(), examples = blocks(html, 'pre');
    for (const identifier of ['systemId', 'instanceId', 'bindings', 'pressed', 'start', 'migrations', 'shared/system-types.ts']) assert.ok(code.includes(identifier), identifier);
    assert.ok(examples.some(value => value.includes("instanceId: 'countdown', systemId: 'timer'")));
    assert.ok(examples.some(value => value.includes("from: 'start-button', output: 'pressed'")));
    assert.ok(examples.some(value => value.includes("id: 'clock-note', itemId: 'note', itemMode: 'system'")));
    assert.ok(examples.some(value => value.includes('npm run systems -- validate .')));
    if (previousCode) assert.deepEqual(code, previousCode);
    if (previousExamples) assert.deepEqual(examples, previousExamples);
    previousCode = code; previousExamples = examples;
    for (const id of ['note', 'chess']) assert.ok(items.includes(`<code>${id}</code>`), id);
  }
});

test('only stock system metadata is localized and original or author-modified definitions stay intact', t => {
  const previous = getLanguage(); t.after(() => setLanguage(previous));
  const manifests = ['button', 'timer', 'chair'].map(id => JSON.parse(readFileSync(new URL(`../../../shared-systems/${id}/1.0.0/system.json`, import.meta.url), 'utf8')) as SystemManifest);
  const original = structuredClone(manifests);
  for (const language of LANGUAGES) {
    setLanguage(language);
    for (const [index, manifest] of manifests.entries()) {
      assert.equal(systemTitle(manifest), copy[language].titles[index]);
      assert.ok(systemDescription(manifest).startsWith(copy[language].descriptions[index]));
      const custom = [
        { ...manifest, id: `author-${manifest.id}`, title: 'ホーム {0} <b>custom</b>', description: 'User text / 사용자 문구' },
        { ...manifest, description: 'Custom description for an updated stock system' },
        { ...manifest, credits: ['Another author'] },
      ];
      for (const entry of custom) {
        const before = structuredClone(entry);
        assert.equal(systemTitle(entry), entry.title);
        assert.equal(systemDescription(entry), entry.description);
        assert.deepEqual(entry, before);
      }
    }
  }
  assert.deepEqual(manifests, original);
});

test('demo control labels change per viewer while custom object text, empty labels and IDs remain unchanged', t => {
  const previous = getLanguage(); t.after(() => setLanguage(previous));
  const view = { map: systemDemoMap }, original = structuredClone(systemDemoMap);
  const objectIds = ['start-button', 'pause-button', 'reset-button', 'chair-object', 'menu-chess-button'];
  const custom: SystemObject = { id: 'my-object', capabilities: ['interact'], position: [0, 0, 0], text: 'ホーム {0} <button>사용자 문구</button>' };
  for (const language of LANGUAGES) {
    setLanguage(language);
    for (const [index, id] of objectIds.entries()) {
      const object = systemDemoMap.objects.find(value => value.id === id)!;
      assert.equal(systemObjectLabel(view, object), copy[language].controls[index]);
      assert.equal(systemObjectLabel({ map: { ...systemDemoMap, id: 'custom-map' } }, object), object.text ?? object.id);
      assert.equal(systemObjectLabel(view, { ...object, text: '' }), '');
      assert.equal(systemObjectLabel(view, { ...object, text: custom.text }), custom.text);
    }
    assert.equal(systemObjectLabel(view, custom), custom.text);
    assert.equal(systemObjectLabel(undefined, custom), custom.text);
    const { text: _text, ...idOnly } = custom;
    assert.equal(systemObjectLabel(view, idOnly), 'my-object');
  }
  assert.deepEqual(systemDemoMap, original);
});

test('stored system errors translate when read in a new language and unknown author errors stay verbatim', t => {
  const previous = getLanguage(); t.after(() => setLanguage(previous));
  const stored = { occupied: 'seat occupied', catalog: 'ssCatalogLoadFailed', custom: 'Error: Author problem {0} <b>사용자</b> $&' };
  const original = structuredClone(stored);
  for (const language of LANGUAGES) {
    setLanguage(language);
    assert.equal(systemErrorText(stored.occupied), copy[language].occupied);
    assert.equal(systemErrorText(`Error: ${stored.occupied}`), copy[language].occupied);
    assert.equal(systemErrorText(stored.catalog), copy[language].catalogError);
    assert.equal(systemErrorText(stored.custom), stored.custom);
    for (const unknown of ['toString', 'constructor', '__proto__', 'Error: ssCatalogAuthorText']) assert.equal(systemErrorText(unknown), unknown);
    assert.equal(systemErrorText(''), '');
  }
  assert.deepEqual(stored, original);
});
