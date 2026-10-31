import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { applyFantasyAction, newFantasyProfile } from '../../../shared/fantasy-engine.ts';
import { FantasyExpeditionPanel } from './FantasyExpeditionPanel.tsx';
import { FantasyUnderworldPanel } from './FantasyUnderworldPanel.tsx';
const require = createRequire(import.meta.url), socket = require.resolve('../net/ws.ts');
require.cache[socket] = { id: socket, filename: socket, loaded: true, exports: { send: () => {} } } as NodeModule;
const { FantasyFishingPanel } = require('./FantasyFieldActions.tsx') as typeof import('./FantasyFieldActions.tsx');

const profile = () => applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: 'Expedition' }, () => .5).profile;
test('guild recruitment explains Gold or priest equivalent, survival and departure in three languages', () => {
  const c = profile().character!; c.location = 'hearth'; c.hour = 12;
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const html = renderToStaticMarkup(<FantasyExpeditionPanel c={c} route="guild" locale={locale} blocked={false} onAction={() => { throw Error('Rendering must not issue actions'); }}/>);
    assert.ok(html.includes({ ko: '미개척 대륙 원정', en: 'Uncharted expedition', ja: '未開拓大陸への遠征' }[locale]));
    assert.ok(html.includes({ ko: '골드', en: 'Gold', ja: 'ゴールド' }[locale]));
    assert.ok(html.includes({ ko: '신전', en: 'temple', ja: '神殿' }[locale]));
    assert.match(html, new RegExp({ ko: '야영', en: 'camp', ja: '野営' }[locale], 'i'));
    assert.match(html, /disabled/); assert.doesNotMatch(html, /Rootbound|Drowned Stone|Sandburied|Severed Aqueduct/);
  }
});

test('registered Gold recruits have an enabled recruitment control while pending requests disable it', () => {
  const c = profile().character!; c.location = 'hearth'; c.hour = 12;
  c.guildProgress = { version: 1, grade: 4, completedAtGrade: 0, creditedQuests: [] };
  const render = (blocked: boolean) => renderToStaticMarkup(<FantasyExpeditionPanel c={c} route="guild" locale="en" blocked={blocked} onAction={() => {}}/>);
  assert.match(render(false), /Join the expedition/); assert.doesNotMatch(render(false), /disabled/);
  assert.match(render(true), /disabled/); assert.match(render(true), /aria-busy="true"/);
});

test('the dawnport criminal contact offers smuggling with a combat requirement', () => {
  const p = profile(); p.character!.job = 'bandit'; p.character!.location = 'dawnport'; p.character!.hour = 12;
  const render = (npc: string) => renderToStaticMarkup(<FantasyUnderworldPanel profile={p} locale="en" hour={12} realm="test" npc={npc} pending={false} onCommand={() => {}}/>);
  assert.match(render('dawnport-toren'), /Illegal passage/); assert.match(render('dawnport-toren'), /combat/);
  assert.match(render('dawnport-toren'), /80 G/); assert.match(render('dawnport-toren'), /fare is separate/);
  assert.doesNotMatch(render('hearth-nyx'), /Illegal passage/);
});

test('ordinary frontier explorers see shore fishing without a port or fisher profession', () => {
  const p = profile(); p.character!.job = 'warrior'; p.character!.location = 'frontier-river-bend'; p.character!.hour = 12;
  const html = renderToStaticMarkup(<FantasyFishingPanel c={p.character!} blocked={false} onAction={() => {}}/>);
  assert.match(html, /강가|Shore|岸辺/); assert.doesNotMatch(html, /어선 준비|Arrange a fishing boat|漁船の手配/);
});
