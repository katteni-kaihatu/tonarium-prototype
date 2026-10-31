import test from 'node:test';
import assert from 'node:assert/strict';
import { fantasyCombatSoundRecipe } from './fantasy-combat-audio.ts';

test('quiet combat cues cover every visual family and remain short and bounded',()=>{
 for(const visual of ['slash','thrust','projectile','impact','fire','frost','storm','poison','alchemy','water','earth','wind','star','miracle','ultimate','last-dawn']){
  const voices=fantasyCombatSoundRecipe({visual,tier:6,event:{kind:'attack',skill:'example'}});
  assert.ok(voices.length>0,visual);assert.ok(voices.length<=6,visual);
  for(const v of voices){assert.ok(v.gain>0&&v.gain<=.06,visual);assert.ok(v.duration>0&&v.at+v.duration<=1.6,visual);assert.ok(v.hz>0&&v.to>0,visual);}
 }
 assert.deepEqual(fantasyCombatSoundRecipe({visual:'impact',tier:1,event:{kind:'move'}}),[]);
});
test('misses avoid impact sound; skills and named miracles receive different short motifs',()=>{
 const base={visual:'slash',tier:1,event:{kind:'attack',skill:'blade-a'}};
 assert.notDeepEqual(fantasyCombatSoundRecipe(base),fantasyCombatSoundRecipe({...base,missed:true}));
 assert.notDeepEqual(fantasyCombatSoundRecipe(base),fantasyCombatSoundRecipe({...base,event:{kind:'attack',skill:'blade-b'}}));
 const holy=(skill:string)=>fantasyCombatSoundRecipe({visual:'miracle',tier:5,event:{kind:'miracle',skill}});
 assert.notDeepEqual(holy('miracle-soul-anchor'),holy('miracle-sacred-severance'));
});

test('support skills use a gentle chime instead of a projectile impact',()=>{
 const base={visual:'projectile',tier:2,event:{kind:'attack',skill:'priest-care'}};
 const support=fantasyCombatSoundRecipe({...base,skill:{kind:'heal'}});
 assert.ok(support.every(voice=>voice.wave==='sine'));assert.notDeepEqual(support,fantasyCombatSoundRecipe(base));
});
