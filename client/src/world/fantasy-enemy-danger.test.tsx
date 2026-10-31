import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { FantasyTacticalBoard } from './FantasyTacticalBoard.tsx';
import { FantasyCombatEffects } from './FantasyCombatEffects.tsx';
import * as presentation from './fantasy-combat-presentation.ts';
import type { FantasyCombatBeat } from './fantasy-combat-presentation.ts';
import type { FantasyCombatFighter, FantasyCombatState } from '../../../shared/fantasy-combat.ts';

const names = { ko: '화염룡', en: 'Flame Dragon', ja: '炎竜' };
const skill = { id: 'enemy-flame', names: { ko: '화염 숨결', en: 'Flame Breath', ja: '炎の息' }, kind: 'attack' as const, mp: 4, power: 12, range: 'magic' as const, magic: true, visualElement: 'fire' as const };
const enemy = (id = 'dragon') => ({ id, side: 'enemies', names, hp: 100, stats: { hp: 100, mp: 20, attack: 20, defense: 10, magicResist: 10, agility: 10, intelligence: 10, accuracy: 80 }, mp: 20, range: 'magic', tile: { x: 5, y: 1 }, skills: [skill], effects: [], enemyCharge: { skill: skill.id, preparedRound: 2, resolvesRound: 3, origin: { x: 5, y: 1 }, target: { x: 1, y: 1 }, tiles: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } }) as unknown as FantasyCombatFighter;
const battle = (fighters = [enemy()]) => ({ id: 'danger', round: 3, revision: 2, status: 'active', logs: [], fighters, battlefield: { width: 10, height: 8, blocked: [], cover: [] } }) as unknown as FantasyCombatState;
const render = (state: FantasyCombatState, locale: 'ko' | 'en' | 'ja' = 'en') => renderToStaticMarkup(<FantasyTacticalBoard battle={state} locale={locale} moving={false} onTile={() => {}} onTarget={() => {}} />);

test('locked enemy areas identify the exact release round after player action and every overlapping attacker in all languages', () => {
  for (const [locale, warning, timing] of [['ko', '다음 행동 뒤', '3라운드 발동'], ['en', 'After your action', 'Releases in round 3'], ['ja', '次の行動後', '3ラウンドで発動']] as const) {
    const second = enemy('second'); second.names = { ko: '둘째 용', en: 'Second Dragon', ja: '二体目の竜' };
    const html = render(battle([enemy(), second]), locale);
    assert.equal((html.match(/class="fr-enemy-danger-marker"/g) ?? []).length, 2);
    const cell = html.match(/<button[^>]*aria-label="1,1[^>]*>/)?.[0] ?? '';
    assert.ok(cell.includes(warning)); assert.ok(cell.includes(timing)); assert.ok(cell.includes(names[locale])); assert.ok(cell.includes(second.names[locale])); assert.ok(cell.includes(skill.names[locale]));
    assert.ok(html.includes('role="status"')); assert.ok(!html.includes('undefined'));
  }
});

test('enemy warning disappears when cleared, defeated, fled or ended, while legacy battles still render', () => {
  for (const state of [battle([]), battle([{ ...enemy(), enemyCharge: undefined } as FantasyCombatFighter]), battle([{ ...enemy(), hp: 0 }]), battle([{ ...enemy(), fled: true }]), { ...battle(), status: 'victory' as const }]) {
    assert.ok(!render(state).includes('class="fr-enemy-danger-marker"'));
    for (const [locale, timing] of [['ko', '라운드 발동'], ['en', 'Releases in round'], ['ja', 'ラウンドで発動']] as const) assert.ok(!render(state, locale).includes(timing));
  }
});

test('prepare is a quiet charge at the zero-based tile center, with no damage or impact cue', () => {
  const beat = { id: 'prepare', event: { kind: 'prepare', actor: 'dragon', skill: skill.id, from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }, actor: enemy(), skill, tier: 3, visual: 'charge', text: { ko: '준비', en: 'Prepare', ja: '準備' } } as unknown as FantasyCombatBeat;
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const html = renderToStaticMarkup(<FantasyCombatEffects beat={beat} locale={locale} width={10} height={8} positions={{}} />);
    assert.ok(html.includes('fr-fx-charge-rune')); assert.ok(html.includes('translate(50 50)'));
    assert.ok(!html.includes('fr-fx-impact')); assert.ok(!html.includes('fr-fx-physical')); assert.ok(!html.includes('damage'));
  }
});

test('enemy release visuals follow skill metadata and preparation never becomes an impact', () => {
  for (const [visualElement, damageType, range, want] of [['fire', undefined, 'magic', 'fire'], ['frost', undefined, 'magic', 'frost'], ['storm', undefined, 'magic', 'storm'], [undefined, undefined, 'melee', 'slash'], [undefined, 'pierce', 'melee', 'thrust'], [undefined, undefined, 'ranged', 'projectile']] as const) {
    const attackSkill = { ...skill, visualElement, damageType, range };
    assert.equal(presentation.fantasyCombatVisualKind({ kind: 'attack', actor: 'dragon', skill: skill.id }, attackSkill, enemy()), want);
    assert.equal(presentation.fantasyCombatVisualKind({ kind: 'prepare', actor: 'dragon', skill: skill.id } as never, attackSkill, enemy()), 'charge');
  }
});

test('one area cast yields one visual beat while all damage logs remain available', () => {
  const state = battle();
  const event = { kind: 'attack', actor: 'dragon', skill: skill.id, from: { x: 5, y: 1 }, to: { x: 1, y: 1 }, tiles: [{ x: 0, y: 0 }, { x: 1, y: 1 }] };
  const logs = [{ id: 1, round: 3, text: names, presentation: event }, { id: 2, round: 3, text: names, presentation: { ...event, tiles: undefined, target: 'one' } }, { id: 3, round: 3, text: names, presentation: { ...event, tiles: undefined, target: 'two' } }, { id: 4, round: 4, text: names, presentation: event }];
  const beats = presentation.fantasyCombatPresentationBeats(state, state, logs as never);
  assert.equal(beats.length, 2); assert.deepEqual(beats[0].event.tiles, event.tiles); assert.equal(logs.length, 4);
});

test('stale preparation events cannot flash a warning after the charge is cleared or combat ends', () => {
  const logs = [{ id: 1, round: 2, text: names, presentation: { kind: 'prepare', actor: 'dragon', skill: skill.id } }];
  assert.equal(presentation.fantasyCombatPresentationBeats(battle(), battle(), logs as never).length, 1);
  for (const state of [battle([{ ...enemy(), enemyCharge: undefined } as FantasyCombatFighter]), battle([{ ...enemy(), hp: 0 }]), { ...battle(), status: 'defeat' as const }]) {
    assert.equal(presentation.fantasyCombatPresentationBeats(state, battle(), logs as never).length, 0);
  }
});

test('reduced-motion effects retain a static warning without travel animation', () => {
  const beat = { id: 'charge', event: { kind: 'prepare', actor: 'dragon' }, tier: 3, visual: 'charge', text: names } as unknown as FantasyCombatBeat;
  const html = renderToStaticMarkup(<FantasyCombatEffects beat={beat} locale="en" width={10} height={8} positions={{ dragon: { x: 0, y: 0 } }} reducedMotion />);
  assert.ok(html.includes('fr-fx-charge-rune')); assert.ok(html.includes('reduced-motion'));
  assert.ok(!html.includes('fr-fx-shot-trail'));
});
