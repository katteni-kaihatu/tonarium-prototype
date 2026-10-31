import test from 'node:test';
import assert from 'node:assert/strict';
import {applyFantasyAction,newFantasyProfile} from './fantasy-engine.ts';
import {beginFantasyDowned,advanceFantasyDowned,stabilizeFantasyDowned,validFantasyDowned} from './fantasy-downed.ts';
const person=()=>{const p=applyFantasyAction(newFantasyProfile(),{type:'create',source:'human',gender:'female',name:'응급환자'},()=>.5).profile;p.character!.hour=12;return p;};
test('a fallen combatant is downed without death, cannot reset their deadline and validates after reload',()=>{
  const p=person();p.character!.hp=0;beginFantasyDowned(p,12);assert.equal(p.death,undefined);assert.equal(p.character!.downed?.expiresAt,18);
  beginFantasyDowned(p,13);assert.equal(p.character!.downed?.since,12);assert.ok(validFantasyDowned(JSON.parse(JSON.stringify(p))));
  const broken=structuredClone(p);broken.character!.downed!.expiresAt=11;assert.equal(validFantasyDowned(broken),false);
});
test('stabilization consumes no time rewind, wakes only after two game hours and cannot be repeated',()=>{
  const p=person();p.character!.hp=0;beginFantasyDowned(p,12);p.character!.hour=13;
  assert.equal(stabilizeFantasyDowned(p,13),true);assert.equal(stabilizeFantasyDowned(p,14),false);
  advanceFantasyDowned(p,14.99);assert.equal(p.character!.hp,0);advanceFantasyDowned(p,15);assert.ok(p.character!.hp>0);assert.equal(p.character!.downed,undefined);assert.equal(p.death,undefined);
});
test('unassisted expiry follows settlement rescue or permanent wilderness death, never ordinary healing',()=>{
  const safe=person();safe.character!.hp=0;beginFantasyDowned(safe,12);advanceFantasyDowned(safe,18);assert.ok(safe.character!.hp>0);assert.equal(safe.death,undefined);
  const lost=person();lost.character!.location='deepcave';lost.character!.hp=0;beginFantasyDowned(lost,12);advanceFantasyDowned(lost,18);assert.ok(lost.death);assert.equal(lost.character!.downed,undefined);assert.equal(lost.pastLives!.length,1);
});
test('an active battle retains its own revival opportunity and already dead lives cannot stabilize',()=>{
  const p=person();p.character!.location='deepcave';p.character!.hp=0;p.combatId='battle-test';beginFantasyDowned(p,12);advanceFantasyDowned(p,30);assert.equal(p.death,undefined);assert.ok(p.character!.downed);
  assert.equal(stabilizeFantasyDowned(p,30),false);delete p.combatId;advanceFantasyDowned(p,30);assert.ok(p.death);assert.equal(stabilizeFantasyDowned(p,30),false);
});
