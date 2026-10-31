import{addFantasyEffect}from'../shared/fantasy-effects.ts';
import{FANTASY_ITEMS}from'../shared/fantasy-data.ts';
import type{FantasyProfile}from'../shared/fantasy.ts';
import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {FantasyStore,isFantasyAction} from './fantasy-store.ts';
import {applyFantasyAction,newFantasyProfile} from '../shared/fantasy-engine.ts';
import {beginFantasyDowned} from '../shared/fantasy-downed.ts';
function fixture(t:TestContext,configure?:(patient:FantasyProfile)=>void){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tonarium-downed-'));t.after(()=>{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});});const file=path.join(dir,'fantasy.json');let hour=12,fail=false;
const make=(name:string)=>{const p=applyFantasyAction(newFantasyProfile(),{type:'create',source:'human',gender:'female',name},()=>.5).profile;p.character!.hour=hour;p.character!.inventory.potion=2;p.character!.gold=500;return p;};const a=make('Helper'),b=make('Patient');b.character!.hp=0;beginFantasyDowned(b,hour);configure?.(b);fs.writeFileSync(file,JSON.stringify({a,b}));const options={worldHour:()=>hour,onError:()=>{},save:(file:string,text:string)=>{if(fail)throw Error('Expected save failure');fs.writeFileSync(file,text);}};const store=new FantasyStore(file,options);assert.equal(store.loadError,undefined);return{store,file,options,time:(v:number)=>hour=v,fail:(v:boolean)=>fail=v};}
test('downed aid is same-place/session constrained and potion supply plus stabilization save atomically',t=>{const f=fixture(t),before=f.store.profile('a'),patient=f.store.profile('b'),context={session:'same',publicSession:false,peers:['a','b'],allies:['a','b']};
  assert.equal(f.store.aidDowned('a','b','potion',{...context,peers:['a']}).error,'unavailable');
  assert.equal(f.store.aidDowned('a','b','potion',{...context,allies:[]}).error,'unavailable');
  f.fail(true);assert.equal(f.store.aidDowned('a','b','potion',context).error,'save-failed');assert.deepEqual(f.store.profile('a'),before);assert.deepEqual(f.store.profile('b'),patient);
  f.fail(false);assert.equal(f.store.aidDowned('a','b','potion',context).error,undefined);assert.equal(f.store.profile('a').character!.inventory.potion,1);assert.equal(f.store.profile('b').character!.downed?.wakesAt,14);
  assert.ok(f.store.aidDowned('a','b','potion',context).error);const reloaded=new FantasyStore(f.file,f.options);assert.equal(reloaded.loadError,undefined);f.time(14);assert.ok(reloaded.synchronize('b').profile.character!.hp>0);assert.equal(reloaded.profile('b').character!.downed,undefined);
});
test('paid temple aid wakes a patient immediately and exact envelopes reject forged revival data',t=>{const f=fixture(t),context={session:'same',publicSession:false,peers:['a','b'],allies:['a','b']};assert.equal(f.store.aidDowned('a','b','temple',context).error,undefined);assert.ok(f.store.profile('b').character!.hp>0);assert.ok(f.store.profile('a').character!.gold<500);
  assert.ok(isFantasyAction({type:'downedCare',method:'potion'}));assert.equal(isFantasyAction({type:'downedCare',method:'potion',hp:100}),false);
  assert.equal(isFantasyAction({type:'magicCompose',slot:1,core:'flame',runes:['focus'],power:999}),false);
});


test('party temple aid preserves an existing beneficial effect instead of erasing it',t=>{
  const effect=FANTASY_ITEMS.find(item=>item.use?.effect&&item.use.effect.id==='well-fed')!.use!.effect!;
  const f=fixture(t,patient=>{assert.equal(addFantasyEffect(patient.character!,effect),true);});
  const before=f.store.profile('b').character!.effects;assert.ok(before?.length);
  assert.equal(f.store.aidDowned('a','b','temple',{session:'same',publicSession:false,peers:['a','b'],allies:['a','b']}).error,undefined);
  assert.deepEqual(f.store.profile('b').character!.effects,before);
});
