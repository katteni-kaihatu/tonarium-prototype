import test from 'node:test';
import assert from 'node:assert/strict';
import { fantasyFacilityOpen, fantasyFacilityActionError, fantasyTempleTreatment } from './fantasy-facility-hours.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from './fantasy-engine.ts';

test('only inn and guild stay open overnight, and the same global boundaries apply everywhere', () => {
  for(const hour of [0,5.99,18,23.99,42])for(const building of ['market','merchantGuild','blacksmith','alchemist','tower','restaurant','library','shipyard','temple','archaeology'])assert.equal(fantasyFacilityOpen(building,hour),false,`${building}:${hour}`);
  for(const hour of [0,6,12,18,24])for(const building of ['inn','guild'])assert.equal(fantasyFacilityOpen(building,hour),true);
  for(const hour of [6,12,17.99,30])assert.equal(fantasyFacilityOpen('market',hour),true);
});
test('night patients may request paid temple treatment without opening other temple services', () => {
  const c=applyFantasyAction(newFantasyProfile(),{type:'create',source:'human',name:'환자',gender:'female'},()=>.5).profile.character!;
  c.hour=22;c.location='hearth';c.gold=100;c.hp=fantasyStats(c).hp;
  assert.ok(fantasyFacilityActionError(c,{type:'pray'}));assert.ok(fantasyFacilityActionError(c,{type:'read',book:'mana-primer'}));
  assert.equal(fantasyFacilityActionError(c,{type:'lodge',room:'common'}),undefined);
  assert.equal(fantasyTempleTreatment(c,fantasyStats(c).hp).eligible,false);
  c.hp-=10;const offer=fantasyTempleTreatment(c,fantasyStats(c).hp);assert.equal(offer.eligible,true);assert.ok(offer.cost>0);
  c.gold=0;assert.equal(fantasyTempleTreatment(c,fantasyStats(c).hp).eligible,false);
});

test('recruitment respects its actual facilities while the night guild and inn remain available',()=>{
  const c=applyFantasyAction(newFantasyProfile(),{type:'create',source:'human',name:'밤의 방문자',gender:'female'},()=>.5).profile.character!;c.hour=22;c.location='hearth';
  assert.ok(fantasyFacilityActionError(c,{type:'command',kind:'summons',operation:'hire',member:'summon-wisp'}));
  assert.equal(fantasyFacilityActionError(c,{type:'command',kind:'troop',operation:'hire',member:'troop-guard'}),undefined);
  assert.equal(fantasyFacilityActionError(c,{type:'command',kind:'syndicate',operation:'hire',member:'syndicate-lookout'}),undefined);
  assert.equal(fantasyFacilityActionError(c,{type:'command',kind:'troop',operation:'recover',member:'troop-guard'}),undefined);
});
