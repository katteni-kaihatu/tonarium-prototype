import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore, isFantasyAction } from './fantasy-store.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { grantFantasyCircleBasics } from '../shared/fantasy-magic-circle.ts';

function fixture(t: TestContext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-circle-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'save.json'), p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Circle Store', gender: 'female' }, () => .5).profile;
  const c = p.character!; c.job = 'mage'; c.jobXp.mage = 0; grantFantasyCircleBasics(c);
  const stats = fantasyStats(c); c.hp = stats.hp; c.mp = stats.mp;
  fs.writeFileSync(file, JSON.stringify({ mage: p })); let hour = c.hour;
  const make = () => new FantasyStore(file, { worldHour: () => hour });
  return { make, hour: (v: number) => { hour = v; }, start: hour, mp: c.mp };
}
const compose = { type: 'magicCompose', slot: 1, core: 'flame', runes: ['focus','scatter'] } as const;

test('circle reservation persists and completes once across reload without spending MP for composition', t => {
  const f = fixture(t); let store = f.make(); assert.equal(store.loadError, undefined);
  const result = store.apply('mage', store.profile('mage').revision, { ...compose, runes: [...compose.runes] });
  assert.equal(result.error, undefined); assert.equal(result.profile.activity?.action.type, 'magicCompose');
  assert.equal(result.profile.activity?.endsAt, f.start + 1); assert.equal(result.profile.character!.mp, f.mp);
  assert.equal(result.profile.character!.specialization?.spells?.length ?? 0, 0);
  f.hour(f.start + .5); store = f.make(); assert.equal(store.loadError, undefined);
  assert.equal(store.synchronize('mage').profile.activity?.action.type, 'magicCompose');
  f.hour(f.start + 1); const completed = store.synchronize('mage');
  assert.equal(completed.error, undefined); assert.equal(completed.profile.activity, undefined);
  assert.deepEqual(completed.profile.character!.specialization!.spells![0].circle, { core: 'flame', runes: ['focus','scatter'] });
  assert.equal(completed.profile.character!.mp, f.mp);
  const reloaded = f.make(); assert.equal(reloaded.loadError, undefined);
  assert.deepEqual(reloaded.synchronize('mage').profile, completed.profile);
});

test('cancelling a saved circle reservation neither prepares a spell nor spends MP after reload', t => {
  const f = fixture(t); let store = f.make();
  const started = store.apply('mage', store.profile('mage').revision, { ...compose, runes: [...compose.runes] });
  assert.equal(started.error, undefined); f.hour(f.start + .5); store = f.make(); assert.equal(store.loadError, undefined);
  const cancelled = store.apply('mage', store.profile('mage').revision, { type: 'cancel' });
  assert.equal(cancelled.error, undefined); assert.equal(cancelled.profile.activity, undefined); assert.equal(cancelled.profile.character!.mp, f.mp);
  f.hour(f.start + 2); store = f.make(); const later = store.synchronize('mage').profile;
  assert.equal(later.character!.specialization?.spells?.length ?? 0, 0); assert.equal(later.character!.mp, f.mp);
});

test('server circle action accepts repeated runes and rejects supplied effects and invented nodes', () => {
  assert.ok(isFantasyAction(compose));
  assert.ok(isFantasyAction({...compose,runes:['economy','economy']}));
  for (const action of [{ ...compose, power: 999 }, { ...compose, effects: { revive: true } }, { ...compose, core: 'void' }, { ...compose, runes: ['free-mana'] }]) assert.equal(isFantasyAction(action), false);
});

test('server persists repeated rune slots without silently merging them',t=>{
  const f=fixture(t),store=f.make();
  const start=store.apply('mage',store.profile('mage').revision,{...compose,runes:['economy','economy']});
  assert.equal(start.error,undefined);f.hour(start.profile.activity!.endsAt);
  const result=store.synchronize('mage');assert.equal(result.error,undefined);
  assert.deepEqual(result.profile.character!.specialization!.spells![0].circle!.runes,['economy','economy']);
  assert.deepEqual(f.make().profile('mage').character!.specialization!.spells![0].circle!.runes,['economy','economy']);
});
