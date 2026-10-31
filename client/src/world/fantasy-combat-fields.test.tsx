import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { FantasyTacticalBoard } from './FantasyTacticalBoard.tsx';
import { fantasyCombatField } from '../../../shared/fantasy-combat-tactics.ts';
import type { FantasyCombatState } from '../../../shared/fantasy-combat.ts';

test('tactical cells expose visible terrain markers, effect and remaining rounds in all three languages', () => {
  const battle = { round: 2, fighters: [], battlefield: fantasyCombatField(), fields: [{ kind: 'fire', tile: { x: 2, y: 3 }, power: 4, source: 'p', expiresRound: 4, appliedRound: {} }] } as unknown as FantasyCombatState;
  for (const [locale, effect, remaining] of [['ko', '불타는 바닥', '2라운드 남음'], ['en', 'Burning ground', '2 rounds remaining'], ['ja', '燃える床', '2ラウンド残り']] as const) {
    const html = renderToStaticMarkup(<FantasyTacticalBoard battle={battle} locale={locale} moving={false} onTile={() => {}} onTarget={() => {}} />);
    assert.ok(html.includes(effect)); assert.ok(html.includes(remaining)); assert.ok(html.includes('fr-field-marker'));
  }
});
