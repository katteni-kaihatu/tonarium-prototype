import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { applyFantasyAction, newFantasyProfile } from '../../../shared/fantasy-engine.ts';
import { FantasyUnderworldPanel } from './FantasyUnderworldPanel.tsx';

test('underworld panel shows localized progress and costs while preventing claims by a former criminal', () => {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: '旅人' }, () => .5).profile;
  p.character!.job = 'adventurer';
  const receipts = Array.from({ length: 14 }, (_, i) => ({ quest: `old-${i}`, contract: `offer-${i}` }));
  p.character!.completed = receipts.map(row => row.quest);
  p.character!.underworld = { version: 1, trust: 280, merit: 280, receipts, claimed: [] };
  const html = renderToStaticMarkup(<FantasyUnderworldPanel profile={p} locale="en" hour={p.character!.hour} realm="test" npc="hearth-nyx" pending={false} onCommand={() => { throw new Error('Rendering must not issue actions'); }}/>);
  assert.match(html, /Shadow Council/);
  assert.match(html, /280/);
  assert.match(html, /Silk|silk/);
  assert.match(html, /disabled/);
  assert.match(html, /underworld profession/);
  assert.doesNotMatch(html, /undefined|NaN/);
});
