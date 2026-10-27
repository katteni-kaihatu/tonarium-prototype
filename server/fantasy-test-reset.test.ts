import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { recordFantasyDeath } from '../shared/fantasy-mortality.ts';
import { validFantasyLifeProfile } from '../shared/fantasy-progression.ts';
import { fantasyTestToolsAllowed, resetFantasyTestLife } from './fantasy-test-reset.ts';

const born = () => applyFantasyAction(newFantasyProfile(), { type:'create', name:'Reset visitor', gender:'female', source:'human' }, () => .5).profile;

test('test reset starts a fresh draft and preserves the previous life without modifying its input', () => {
  const profile = born(), before = structuredClone(profile);
  profile.activity = { action:{type:'work'}, startedAt:profile.character!.hour, endsAt:profile.character!.hour+4, seed:1 };
  const active = structuredClone(profile), result = resetFantasyTestLife(profile);
  assert.equal(result.changed,true); assert.deepEqual(profile,active);
  assert.equal(result.profile.character,null); assert.equal(result.profile.activity,undefined); assert.equal(result.profile.death,undefined);
  assert.deepEqual(result.profile.draft,{remaining:5,candidate:null,kept:null}); assert.equal(result.profile.generation,2);
  assert.equal(result.profile.pastLives!.length,1); assert.equal(result.profile.pastLives![0].name,before.character!.name);
  assert.equal(result.profile.revision,profile.revision+1); assert.equal(validFantasyLifeProfile(result.profile),true);
  assert.equal(resetFantasyTestLife(result.profile).changed,false);
});

test('resetting an already ended life does not duplicate its trace or transfer belongings', () => {
  const profile=born(); recordFantasyDeath(profile,'Lost at sea',true);
  const result=resetFantasyTestLife(profile); assert.equal(result.profile.pastLives!.length,1);
  const reborn=applyFantasyAction(result.profile,{type:'create',name:'New visitor',gender:'male',source:'human'},()=>.5);
  assert.equal(reborn.error,undefined); assert.equal(reborn.profile.character!.job,'unassigned');
  assert.equal(reborn.profile.generation,2); assert.equal(validFantasyLifeProfile(reborn.profile),true);
});

test('test tools require both an explicit server flag and a local connection', () => {
  for(const address of ['127.0.0.1','::1','::ffff:127.0.0.1']) assert.equal(fantasyTestToolsAllowed('1',address),true);
  for(const address of ['192.168.0.2','203.0.113.9',undefined]) assert.equal(fantasyTestToolsAllowed('1',address),false);
  for(const flag of [undefined,'0','true']) assert.equal(fantasyTestToolsAllowed(flag,'127.0.0.1'),false);
});
