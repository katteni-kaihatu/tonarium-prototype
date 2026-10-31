import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { FantasyTacticalBoard } from './FantasyTacticalBoard.tsx';
import { fantasyCombatSkillSummary } from '../../../shared/fantasy-combat-preview.ts';
import type { FantasyCombatSkill, FantasyCombatState } from '../../../shared/fantasy-combat.ts';

test('shape previews and summaries explain attack geometry in Korean English and Japanese', () => {
  const battle = { round: 1, fighters: [], battlefield: { width: 10, height: 8, blocked: [], cover: [] } } as unknown as FantasyCombatState;
  const skill: FantasyCombatSkill = { id: 'spear', names: { ko: '찌르기', en: 'Thrust', ja: '突き' }, kind: 'attack', power: 9, mp: 7, reach: 3, radius: 0, shape: 'line', secondaryDamage: 75 };
  for (const [locale, label, shape] of [['ko', '공격 범위', '직선 관통'], ['en', 'Attack area', 'Piercing line'], ['ja', '攻撃範囲', '直線貫通']] as const) {
    const html = renderToStaticMarkup(<FantasyTacticalBoard battle={battle} locale={locale} moving={false} attackTiles={[{ x: 3, y: 2 }]} onTile={() => {}} onTarget={() => {}} />);
    assert.ok(html.includes('attack-area')); assert.ok(html.includes(label));
    const summary = fantasyCombatSkillSummary(skill, locale);
    assert.ok(summary.includes(shape)); assert.ok(summary.includes('75%'));
    assert.ok(!summary.includes('undefined'));
  }
});

test('mobility descriptions and landing previews distinguish passing through from approaching', () => {
  const battle = { round: 1, fighters: [], battlefield: { width: 10, height: 8, blocked: [], cover: [] } } as unknown as FantasyCombatState;
  const art: FantasyCombatSkill = { id: 'dash', names: { ko: '기동', en: 'Mobility', ja: '機動' }, kind: 'attack', power: 9, mp: 10, reach: 3, shape: 'line', motion: { kind: 'dash', distance: 4 } };
  for (const [locale, dashLabel, advanceLabel] of [['ko', '관통 돌진 공격', '접근 후 공격'], ['en', 'Piercing dash attack', 'Approach then attack'], ['ja', '貫通突進攻撃', '接近後に攻撃']] as const) {
    assert.ok(fantasyCombatSkillSummary(art, locale).includes(dashLabel));
    assert.ok(fantasyCombatSkillSummary({ ...art, shape: 'single', motion: { kind: 'advance', distance: 3 } }, locale).includes(advanceLabel));
    const html = renderToStaticMarkup(<FantasyTacticalBoard battle={battle} locale={locale} moving={false} landingKind="advance" landingTile={{ x: 3, y: 2 }} onTile={() => {}} onTarget={() => {}} />);
    assert.ok(html.includes('dash-landing'));
    assert.ok(!html.includes('undefined'));
  }
});
