import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import type { FantasyCharacter } from '../../../shared/fantasy.ts';
import { applyFantasyAction, newFantasyProfile } from '../../../shared/fantasy-engine.ts';
import { FANTASY_CIRCLE_CORES, FANTASY_CIRCLE_RUNES, fantasyCircleKnowledge, fantasyCompileCircle, grantFantasyCircleBasics, learnFantasyCircleBook } from '../../../shared/fantasy-magic-circle.ts';
import {FANTASY_MAGIC_COMBINATIONS} from '../../../shared/fantasy-specializations.ts';
import {learnFantasyMagicBook} from '../../../shared/fantasy-magic-discovery.ts';

const require = createRequire(import.meta.url);
const react = require('react') as typeof import('react');
const originalSnapshot = react.useSyncExternalStore, originalState = react.useState;
react.useSyncExternalStore = (subscribe, snapshot) => originalSnapshot(subscribe, snapshot, snapshot);
let overrides: unknown[] = [];
react.useState = ((initial: unknown) => originalState(overrides.length ? overrides.shift() : initial)) as typeof react.useState;
const { FantasyRunicCircle } = require('./FantasyRunicCircle.tsx') as typeof import('./FantasyRunicCircle.tsx');
const { setLocale } = require('../locale.ts') as typeof import('../locale.ts');
const { set } = require('../store.ts') as typeof import('../store.ts');
const locales = ['ko', 'en', 'ja'] as const;
function player(job = 'mage') {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Rune UI', gender: 'female' }, () => .5).profile;
  const c = p.character!; c.job = job; c.jobXp[job] = 0; grantFantasyCircleBasics(c); return c;
}
function render(c: FantasyCharacter, locale: typeof locales[number], picker: number | null = null) {
  setLocale(locale); set({ wsConnected: true }); overrides = [1, picker];
  try { return renderToStaticMarkup(createElement(FantasyRunicCircle, { c, blocked: false, onAction: () => {} })); }
  finally { overrides = []; }
}
const choices = (html: string) => html.match(/<div class="fr-runic-picker"[\s\S]*?<\/div>/)?.[0] ?? '';

test('mage UI hides saved legacy healing while priest retains the same learned healing spell in all locales',()=>{
  const healing=FANTASY_MAGIC_COMBINATIONS.find(spell=>spell.element==='tide'&&spell.form==='mend')!;
  for(const locale of locales){
    const mage=player();learnFantasyMagicBook(mage,'remedies-and-rites');mage.specialization={spells:[{slot:1,element:'tide',form:'mend'}]};
    assert.ok(!render(mage,locale).includes(healing.names[locale]));
    mage.job='priest';grantFantasyCircleBasics(mage);
    assert.ok(render(mage,locale).includes(healing.names[locale]));
  }
});

test('each profession renders two, four and six circular rune nodes and one, two and three save slots in KO/EN/JA', () => {
  for (const job of ['mage', 'priest']) for (const locale of locales) for (const [xp, nodes, slots] of [[0, 2, 1], [30, 4, 2], [100, 6, 3]]) {
    const c = player(job); c.jobXp[job] = xp; const html = render(c, locale);
    assert.equal((html.match(/class="fr-runic-node/g) ?? []).length, nodes, `${job}/${locale}/${xp}`);
    assert.equal((html.match(/aria-pressed=/g) ?? []).length, slots, `${job}/${locale}/${xp}`);
    assert.ok(html.includes('<svg')); assert.ok(!html.includes('<select'));
    assert.ok(html.includes(({ ko: '합성하여 저장', en: 'Compose and save', ja: '合成して保存' })[locale]));
  }
});

test('unlearned core and rune choices remain hidden until a real book discovery in every locale', () => {
  for (const locale of locales) {
    const c = player(), physical = FANTASY_CIRCLE_CORES.find(core => core.id === 'physical')!, reach = FANTASY_CIRCLE_RUNES.find(rune => rune.id === 'reach')!;
    assert.ok(!render(c, locale, -1).includes(physical.names[locale]));
    assert.ok(!choices(render(c, locale, 0)).includes(reach.names[locale]));
    for (const id of ['focus', 'scatter', 'economy']) assert.ok(choices(render(c, locale, 0)).includes(FANTASY_CIRCLE_RUNES.find(rune => rune.id === id)!.names[locale]));
    learnFantasyCircleBook(c, 'rune-physical'); learnFantasyCircleBook(c, 'rune-reach');
    assert.ok(render(c, locale, -1).includes(physical.names[locale])); assert.ok(choices(render(c, locale, 0)).includes(reach.names[locale]));
  }
});

test('saved circle preview displays the actual compiler MP and combat values in each locale', () => {
  for (const locale of locales) {
    const c = player(); c.specialization = { spells: [{ slot: 1, element: 'flame', form: 'bolt', circle: { core: 'flame', runes: ['focus', 'scatter'] } }] };
    const compiled = fantasyCompileCircle(c, 'flame', ['focus', 'scatter'])!, html = render(c, locale);
    assert.ok(html.includes(`MP ${compiled.mp}`)); assert.ok(html.includes(compiled.names[locale]));
    assert.ok(html.includes(`${({ ko: '위력', en: 'Power', ja: '威力' })[locale]} ${compiled.power}`));
    assert.ok(html.includes(`${({ ko: '사거리', en: 'Reach', ja: '射程' })[locale]} ${compiled.reach}`));
  }
});

test('changing specialization hides a retained attribute crest that the current vocation cannot use', () => {
  const c = player(); c.jobPaths = { mage: { path: 'mage-flame', hour: c.hour } }; c.circleKnowledge = fantasyCircleKnowledge(c);
  c.jobPaths.mage.path = 'mage-ice';
  for (const locale of locales) {
    const html = render(c, locale, 0);
    assert.ok(!html.includes(FANTASY_CIRCLE_RUNES.find(r => r.id === 'flame-crest')!.names[locale]));
    assert.ok(html.includes(FANTASY_CIRCLE_RUNES.find(r => r.id === 'ice-crest')!.names[locale]));
  }
});

test('repeated runes remain selectable in every slot and positive geometry is required in all locales',()=>{
 for(const locale of locales){
 const c=player();c.jobXp.mage=100;c.specialization={spells:[{slot:1,element:'flame',form:'bolt',circle:{core:'flame',runes:['economy','economy']}}]};
 const picker=choices(render(c,locale,2));assert.ok(!picker.includes('fr-disabled-help'));assert.ok(!picker.includes('same rune cannot'));
 c.specialization.spells![0].circle!.runes=['focus'];const html=render(c,locale);assert.ok(html.includes(({ko:'사거리와 영역은 모두 0보다 커야 합니다.',en:'Reach and radius must both be greater than zero.',ja:'射程と範囲はどちらも0より大きい必要があります。'})[locale]));
 }
});
