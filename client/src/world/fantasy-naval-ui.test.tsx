import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { createFantasyCombat } from '../../../shared/fantasy-combat.ts';
import { FantasyTacticalBoard } from './FantasyTacticalBoard.tsx';
import { FantasyNavalEquipment, FantasyNavalGuide } from './FantasyNavalGuide.tsx';
import type { FantasyCombatState } from '../../../shared/fantasy-combat.ts';
import { applyFantasyAction, newFantasyProfile } from '../../../shared/fantasy-engine.ts';

const stats = { hp: 100, mp: 100, attack: 20, defense: 20, agility: 15, intelligence: 15, accuracy: 90, magicResist: 15 };
export function navalBattle() {
  return createFantasyCombat({ id: 'ship-ui', source: 'encounter:encounter-reef-beast', location: 'frontier-landing', hour: 12, seed: 39, naval: true,
    players: [{ id: 'p', userId: 'u', generation: 1, names: { ko: '검사', en: 'Swordswoman', ja: '剣士' }, stats, hp: 100, mp: 100, position: 'front', range: 'melee', skills: [] }], enemies: [{ id: 'core', template: 'monster-juvenile-kraken' }] });
}
function render(battle: FantasyCombatState, locale: 'ko' | 'en' | 'ja' = 'en') {
  return renderToStaticMarkup(<FantasyTacticalBoard battle={battle} actor={battle.fighters[0]} locale={locale} moving={false} targetIds={battle.fighters.filter(f => f.side === 'enemies').map(f => f.id)} onTile={() => { throw Error('Rendering cannot move'); }} onTarget={() => { throw Error('Rendering cannot attack'); }} />);
}

test('naval battlefield separates 56 deck tiles from 24 water tiles and names the reachable appendages and offshore body', () => {
  const html = render(navalBattle());
  assert.equal((html.match(/class="fr-tactical-cell[^\"]*naval-deck\b/g) ?? []).length, 56);
  assert.equal((html.match(/class="fr-tactical-cell[^\"]*naval-water\b/g) ?? []).length, 24);
  assert.match(html, /naval-body/); assert.match(html, /naval-appendage/); assert.match(html, /fr-naval-tethers/);
  assert.match(html, /aria-label="[^"]*Juvenile Kraken[^\"]*Creature body/);
  assert.match(html, /aria-label="[^"]*Juvenile Kraken Tentacle[^\"]*Deck-edge target/);
  assert.match(html, /Open water/); assert.doesNotMatch(html, /7, 1 · Wall/);
});

test('naval guidance explains melee and ranged routes and accurately reports the shared harpoon cooldown in every locale', () => {
  const battle = navalBattle(); battle.naval!.harpoonReadyRound = battle.round + 2;
  for (const [locale, deck, harm, harpoon, wait] of [
    ['ko', '선박 갑판', '본체', '작살', '2라운드'], ['en', 'Ship deck', 'body', 'harpoon', '2 rounds'], ['ja', '船の甲板', '本体', '銛', '2ラウンド'],
  ] as const) {
    const html = render(battle, locale) + renderToStaticMarkup(<FantasyNavalGuide battle={battle} locale={locale}/>); assert.ok(html.includes(deck)); assert.ok(html.includes(harm)); assert.ok(html.includes(harpoon)); assert.ok(html.includes(wait));
  }
});

test('naval charged attacks retain the existing cell danger warnings and no naval chrome appears on a normal battlefield', () => {
  const battle = navalBattle(), core = battle.fighters.find(f => f.id === 'core')!;
  core.enemyCharge = { skill: 'naval-wave', preparedRound: battle.round, resolvesRound: battle.round + 1, origin: core.tile!, target: { x: 2, y: 3 }, tiles: [{ x: 2, y: 3 }] };
  const html = render(battle); assert.match(html, /enemy-danger/); assert.match(html, /Releases in round 2/); assert.match(html, /fr-enemy-danger-marker/);
  delete battle.naval; assert.doesNotMatch(render(battle), /fr-naval-guide|naval-deck|naval-water|fr-naval-tethers/);
});

test('the temporary ship harpoon is selectable only when the shared crew cooldown has elapsed', () => {
  const battle = navalBattle(), actor = battle.fighters[0];
  const view = () => renderToStaticMarkup(<FantasyNavalEquipment battle={battle} actor={actor} locale="en" blocked={false} selected={false} onSelect={() => { throw Error('Rendering cannot select'); }}/>);
  assert.match(view(), /Ship equipment/); assert.match(view(), /Deck Harpoon/); assert.doesNotMatch(view(), / disabled/);
  battle.naval!.harpoonReadyRound = battle.round + 3; assert.match(view(), / disabled/); assert.match(view(), /Ready in 3 rounds/);
  battle.round += 3; assert.doesNotMatch(view(), / disabled/);
  battle.orders.other = { type: 'skill', skill: 'naval-deck-harpoon', target: 'core' }; assert.match(view(), / disabled/); assert.match(view(), /crewmate/);
  delete battle.orders.other;
  delete battle.naval; assert.equal(view(), '');
});

test('the actual combat panel presents temporary ship equipment and target guidance in three languages', () => {
  const require = createRequire(import.meta.url), socket = require.resolve('../net/ws.ts'), react = require('react') as typeof import('react'), original = react.useSyncExternalStore;
  require.cache[socket] = { id: socket, filename: socket, loaded: true, exports: { send: () => {} } } as NodeModule;
  react.useSyncExternalStore = (subscribe, getSnapshot) => original(subscribe, getSnapshot, getSnapshot);
  try {
    const { FantasyCombatPanel } = require('./FantasyCombatPanel.tsx') as typeof import('./FantasyCombatPanel.tsx');
    const { set } = require('../store.ts') as typeof import('../store.ts'), { setLocale } = require('../locale.ts') as typeof import('../locale.ts');
    const battle = navalBattle(), p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: 'Ship UI' }, () => .5).profile; p.combatId = battle.id;
    set({ selfId: 'u', wsConnected: true, fantasyCombat: battle, fantasyCombatPending: false, fantasyPending: false });
    for (const [locale, title] of [['ko', '선박 장비'], ['en', 'Ship equipment'], ['ja', '船の装備']] as const) {
      setLocale(locale); const html = renderToStaticMarkup(<FantasyCombatPanel profile={p}/>); assert.ok(html.includes(title)); assert.ok(html.includes(battle.fighters[0].skills[0].names[locale]));
      assert.match(html, /fr-naval-guide/); assert.match(html, /fr-naval-equipment/); assert.doesNotMatch(html, /undefined|naval-deck-harpoon/);
    }
    set({ fantasyCombat: null });
  } finally { react.useSyncExternalStore = original; }
});

test('boarder-only and offshore-serpent fights do not suggest nonexistent tentacles or unusable ship equipment', () => {
  for (const [template, offshore] of [['monster-deck-crab', false], ['monster-deep-serpent', true]] as const) {
    const battle = createFantasyCombat({ id: template, source: 'encounter:encounter-reef-beast', location: 'dawnport', hour: 12, seed: 39, naval: true,
      players: [{ id: 'p', userId: 'u', generation: 1, names: { ko: '선원', en: 'Sailor', ja: '船員' }, stats, hp: 100, mp: 100, position: 'front', range: 'melee', skills: [] }], enemies: [{ id: 'core', template }] });
    const guide = renderToStaticMarkup(<FantasyNavalGuide battle={battle} locale="en"/>), equipment = renderToStaticMarkup(<FantasyNavalEquipment battle={battle} actor={battle.fighters[0]} locale="en" blocked={false} selected={false} onSelect={() => {}}/>);
    assert.doesNotMatch(guide, /Sever tentacles/);
    if (offshore) { assert.match(guide, /offshore body/); assert.match(equipment, /harpoon/i); }
    else { assert.match(guide, /Defeat the boarders/); assert.match(guide, /flyers can cross/); assert.equal(equipment, ''); assert.match(render(battle), /naval-boarder/); }
  }
});
