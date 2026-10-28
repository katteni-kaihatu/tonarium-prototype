import assert from 'node:assert/strict';
import test from 'node:test';
import { bigFromNumber, createNewGame, deserialize, serialize } from './engine.mjs';
import { createAdSlice, type AdSlice } from './slice.ts';
import { buildExportBundle, createProfile, getActiveProfile, parseImportBundle, readSaveRaw, writeSave, type StorageLike } from './user.mjs';
import { adExhibitTitle, buildAdLabSnapshot } from './labView.ts';
import { getLanguage, msg, setLanguage, systemText, t } from '../i18n/core.ts';
import { resources } from '../i18n/resources.ts';
import { formatDuration } from '../world/antimatter/format.ts';
import { ACHIEVEMENT_DEFS } from '../world/antimatter/styles.ts';
import { LAYERS, INFINITY_UPGRADES, INFINITY_DIMENSIONS, CHALLENGES, TIME_DIMENSIONS, TIME_STUDIES, ETERNITY_UPGRADES, GLYPH_TYPES, REALITY_UPGRADES, CELESTIALS_OVERVIEW } from '../world/antimatter/layersData.ts';
import { ANTIMATTER_EXHIBITS } from '../../../shared/antimatterLayout.ts';
import { adReadoutLines, drawAdBoard, drawAdReadings } from '../view3d/antimatterText.ts';

test('ja → en → ko → ja preserves progress, saved data, IDs and user names', () => {
  const previous = getLanguage();
  const game = createNewGame(0);
  game.dimensionalBoosts = 6;
  game.achievements.push('first-dimension');
  const profile = { id: 'same-id', name: '次元 {0} Player 플레이어' };
  const saved = JSON.stringify({ save: serialize(game), profile });
  const definitions = [ACHIEVEMENT_DEFS, LAYERS, INFINITY_UPGRADES, INFINITY_DIMENSIONS, CHALLENGES, TIME_DIMENSIONS, TIME_STUDIES, ETERNITY_UPGRADES, GLYPH_TYPES, REALITY_UPGRADES, CELESTIALS_OVERVIEW];
  const identifiers = definitions.map(items => items.map(item => 'id' in item ? item.id : item.tier));
  const views: Record<string, ReturnType<typeof buildAdLabSnapshot>> = {};
  const labels: Record<string, string> = {};
  try {
    for (const language of ['ja', 'en', 'ko', 'ja'] as const) {
      setLanguage(language);
      views[language] = buildAdLabSnapshot(game);
      labels[language] = ACHIEVEMENT_DEFS[0].name;
      assert.equal(JSON.stringify({ save: serialize(game), profile }), saved);
      assert.deepEqual(definitions.map(items => items.map(item => 'id' in item ? item.id : item.tier)), identifiers);
      for (const exhibit of ANTIMATTER_EXHIBITS) {
        assert.ok(adExhibitTitle(exhibit.id));
        if (language !== 'ja') assert.doesNotMatch(adExhibitTitle(exhibit.id), /[ぁ-んァ-ヶ一-龠]/);
      }
      for (const items of definitions) for (const item of items) {
        for (const [property, value] of Object.entries(item)) {
          if (typeof value === 'string' && !['id', 'status'].includes(property) && language !== 'ja') assert.doesNotMatch(value, /[ぁ-んァ-ヶ一-龠]/);
        }
      }
      assert.equal(formatDuration(90061), t('adDays', 1) + ' ' + t('adHours', 1) + ' ' + t('adMinutes', 1) + ' ' + t('adSeconds', 1));
    }
    assert.notEqual(labels.ja, labels.en);
    assert.notEqual(labels.en, labels.ko);
    const numeric = ({ boostRequirementText, galaxyRequirementText, ...rest }: ReturnType<typeof buildAdLabSnapshot>) => rest;
    assert.deepEqual(numeric(views.ja), numeric(views.en));
    assert.deepEqual(numeric(views.en), numeric(views.ko));
  } finally { setLanguage(previous); }
});

test('displayed notices retain event arguments while being translated again', () => {
  const previous = getLanguage();
  const notice = msg('adLabText35', 7);
  const nested = msg('adRankingAuto', '名前 {0} 플레이어');
  const original = JSON.stringify([notice, nested]);
  try {
    for (const language of ['ja', 'en', 'ko', 'ja'] as const) {
      setLanguage(language);
      assert.equal(systemText(notice), t('adLabText35', 7));
      assert.ok(systemText(nested).includes('名前 {0} 플레이어'));
      assert.equal(JSON.stringify([notice, nested]), original);
    }
  } finally { setLanguage(previous); }
});

test('purchases and Tickspeed survive a save reload in every display language', () => {
  const previous = getLanguage();
  const values = new Map<string, string>();
  const storage: StorageLike = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
  };
  const profile = createProfile(storage, '名前 {0} Player 플레이어');
  let slice: AdSlice;
  slice = createAdSlice(partial => Object.assign(slice, partial), () => slice);
  slice.adGame = createNewGame(1000);
  slice.adGame.antimatter = bigFromNumber(1e10);
  try {
    for (const language of ['ja', 'en', 'ko', 'ja'] as const) {
      setLanguage(language);
      const bought: number = slice.adGame.dimensions[0].bought;
      const tickspeed: number = slice.adGame.tickspeedBought;
      assert.equal(slice.adBuyDimension(1), true);
      assert.equal(slice.adBuyTickspeed(), true);
      assert.equal(slice.adGame.dimensions[0].bought, bought + 1);
      assert.equal(slice.adGame.tickspeedBought, tickspeed + 1);
      const saved = serialize(slice.adGame);
      writeSave(storage, profile.id, saved);
      const bundle = buildExportBundle(profile, JSON.parse(saved), 2000);
      const raw = readSaveRaw(storage, profile.id);
      assert.equal(raw, saved);
      slice.adGame = deserialize(raw, 1000);
      assert.equal(serialize(slice.adGame), saved);
      assert.deepEqual(getActiveProfile(storage), profile);
      assert.deepEqual(parseImportBundle(JSON.stringify(bundle)), bundle);
      const stored = [...values];
      setLanguage(language === 'ja' ? 'en' : 'ja');
      assert.deepEqual([...values], stored);
    }
  } finally { setLanguage(previous); }
});

test('Canvas headings and units change with unchanged numbers; all board rows fit', () => {
  const previous = getLanguage();
  const readings = { antimatterText: '1.23e99999', perSecondText: '0' };
  const draws: { text: string; x: number; y: number }[] = [];
  const context = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 0, textAlign: '', textBaseline: '',
    fillRect() {}, strokeRect() {},
    measureText(text: string) { return { width: text.length * Number.parseFloat(this.font.replace(/^600 /, '')) * 0.65 }; },
    fillText(text: string, x: number, y: number) { draws.push({ text, x, y }); },
  };
  const canvas = { width: 512, height: 320, getContext: () => context } as unknown as HTMLCanvasElement;
  const seen: string[] = [];
  try {
    for (const language of ['ja', 'en', 'ko', 'ja'] as const) {
      setLanguage(language);
      draws.length = 0;
      drawAdReadings(canvas, readings);
      assert.deepEqual(draws.map(row => row.text), adReadoutLines(readings));
      seen.push(draws[0].text);
      const lines = [t('adLabText13', 8), t('adLabText89', readings.antimatterText), t('adLabText90', '0'), t('adLabText91', '1.23e99999')];
      draws.length = 0;
      drawAdBoard(canvas, lines);
      assert.deepEqual(draws.map(row => row.text), lines);
      assert.ok(draws.every(row => row.y > 0 && row.y < canvas.height));
      assert.ok(context.measureText(lines.at(-1)!).width <= canvas.width - 48 + 0.01);
    }
    assert.equal(new Set(seen).size, 3);
    assert.deepEqual(readings, { antimatterText: '1.23e99999', perSecondText: '0' });
  } finally { setLanguage(previous); }
});

test('all AD catalog keys have matching arguments across the three languages', () => {
  const keys = (language: keyof typeof resources) => Object.keys(resources[language]).filter(key => /^(ad|mergeAd)/.test(key)).sort();
  for (const language of ['en', 'ko'] as const) assert.deepEqual(keys(language), keys('ja'), language);
  for (const key of keys('ja')) {
    const slots = (text: string) => [...text.matchAll(/\{\d+\}/g)].map(match => match[0]).sort();
    for (const language of ['en', 'ko'] as const) {
      assert.ok(resources[language][key], key);
      assert.deepEqual(slots(resources[language][key]), slots(resources.ja[key]), `${language}: ${key}`);
    }
  }
});
