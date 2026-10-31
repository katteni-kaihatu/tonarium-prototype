import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { FantasyTacticalBoard } from './FantasyTacticalBoard.tsx';
import type { FantasyCombatFighter, FantasyCombatSkill, FantasyCombatState } from '../../../shared/fantasy-combat.ts';

const actor = (): FantasyCombatFighter => ({ id: 'p', userId: 'p', side: 'players', names: { ko: '여행자', en: 'Traveler', ja: '旅人' }, stats: { hp: 100, mp: 50, attack: 10, defense: 10, agility: 1, intelligence: 10, accuracy: 80, magicResist: 10 }, hp: 100, mp: 50, tile: { x: 1, y: 1 }, range: 'ranged', position: 'rear', skills: [], effects: [], fled: false, guarding: false, ward: 0, contribution: { activeRounds: 0, effectiveActions: 0, manualActions: 0 } });
const battle = (): FantasyCombatState => ({ id: 'move-preview', status: 'active', round: 1, fighters: [actor()], logs: [], battlefield: { width: 10, height: 8, blocked: [], cover: [] } }) as unknown as FantasyCombatState;
const render = (state: FantasyCombatState, locale: 'ko' | 'en' | 'ja' = 'en', selected = { x: 6, y: 1 }, skill?: FantasyCombatSkill, tileLimit?: number) => renderToStaticMarkup(<FantasyTacticalBoard battle={state} actor={state.fighters[0]} locale={locale} selected={selected} movementSkill={skill} tileLimit={tileLimit} moving onTile={() => {}} onTarget={() => {}} />);
const cell = (html: string, x: number, y: number) => html.match(new RegExp(`<button[^>]*aria-label="${x},${y}[^>]*>`))?.[0] ?? '';

test('ordinary movement distinguishes guaranteed travel and 15, 10, 5 percent attempts by actual path length', () => {
  const html = render(battle());
  assert.ok(cell(html, 4, 2).includes('100%'));
  for (const [x, chance] of [[5, '15%'], [6, '10%'], [7, '5%']] as const) {
    const button = cell(html, x, 2);
    assert.ok(button.includes('dash-attempt')); assert.ok(button.includes(chance)); assert.ok(!button.includes('aria-disabled="true"'));
  }
});

test('selected attempt and cell descriptions give the exact failure location in all languages', () => {
  for (const [locale, chanceLabel, failureLabel] of [['ko', '성공률', '실패 시'], ['en', 'Success chance', 'On failure'], ['ja', '成功率', '失敗時']] as const) {
    const html = render(battle(), locale);
    const button = cell(html, 7, 2);
    assert.ok(button.includes(`${chanceLabel} 5%`)); assert.ok(button.includes(`${failureLabel} 4,2`));
    const status = html.match(/<div class="fr-tactical-replay-controls[^]*$/)?.[0] ?? '';
    assert.ok(status.includes('7,2')); assert.ok(status.includes('5%')); assert.ok(status.includes(`${failureLabel} 4,2`));
  }
});

test('root, walls, occupied tiles and the current tile remain disabled as destinations', () => {
  const rooted = battle(); rooted.fighters[0].conditions = [{ id: 'root', power: 3, turns: 2 }];
  assert.ok(cell(render(rooted), 5, 2).includes('aria-disabled="true"'));
  const blocked = battle(); blocked.battlefield!.blocked.push({ x: 4, y: 1 });
  assert.ok(cell(render(blocked), 5, 2).includes('aria-disabled="true"'));
  const occupied = battle(); occupied.fighters.push({ ...actor(), id: 'ally', userId: 'ally', tile: { x: 4, y: 1 } });
  assert.ok(cell(render(occupied), 5, 2).includes('aria-disabled="true"'));
  assert.ok(cell(render(battle()), 2, 2).includes('aria-disabled="true"'));
});

test('movement skills and explicit tile limits retain strict bounds without extra-distance attempts', () => {
  const skill: FantasyCombatSkill = { id: 'reposition', names: { ko: '이동', en: 'Reposition', ja: '移動' }, kind: 'focus', power: 1, mp: 4, motion: { kind: 'reposition', distance: 3 } };
  const html = render(battle(), 'en', { x: 5, y: 1 }, skill);
  assert.ok(!html.includes('dash-attempt')); assert.ok(cell(html, 6, 2).includes('aria-disabled="true"'));
  const limited = render(battle(), 'en', { x: 5, y: 1 }, undefined, 2);
  assert.ok(!limited.includes('dash-attempt')); assert.ok(cell(limited, 6, 2).includes('aria-disabled="true"'));
  const detour = battle(); detour.battlefield!.blocked.push({ x: 2, y: 1 });
  assert.ok(cell(render(detour, 'en', { x: 3, y: 1 }, undefined, 2), 4, 2).includes('aria-disabled="true"'));
});
