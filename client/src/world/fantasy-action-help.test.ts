import test from 'node:test';
import assert from 'node:assert/strict';
import { actionHelp, itemDisplayName, itemUseEffectText, skillDescriptionText, skillEffectText } from './fantasy-action-help.ts';
import { applyFantasyAction, fantasySkills, newFantasyProfile } from '../../../shared/fantasy-engine.ts';
import { FANTASY_ITEMS } from '../../../shared/fantasy-data.ts';
import { fantasyLogText } from './fantasy-copy.ts';
import { fantasyMainStage } from '../../../shared/fantasy-main-trials.ts';
import type { FantasyProfile } from '../../../shared/fantasy.ts';

const player=()=>applyFantasyAction(newFantasyProfile(),{type:'create',name:'Help test',source:'human',gender:'female'},()=>.9).profile.character!;

test('main investigation buttons explain wrong locations and missing night lighting in all languages',()=>{
  let p:FantasyProfile={...newFantasyProfile(),character:player()};p.character!.hour=12;
  p=applyFantasyAction(p,{type:'accept',quest:'main-night-01'}).profile;
  for(const locale of ['ko','en','ja'] as const){
    const c=structuredClone(p.character!),action={type:'investigate' as const,quest:'main-night-01',approach:'observe' as const};
    const wrong=actionHelp(c,action,locale)!;assert.ok(wrong);
    if(locale!=='ja')assert.doesNotMatch(wrong,/[ぁ-んァ-ヶ]/);
    c.location='oldwatch';c.hour=23;c.inventory={};
    const dark=actionHelp(c,action,locale)!;assert.ok(dark);
    if(locale!=='ja')assert.doesNotMatch(dark,/[ぁ-んァ-ヶ]/);
    c.inventory.lantern=1;assert.equal(actionHelp(c,action,locale),undefined);
  }
});

test('actual investigation roll and outcome logs use the chosen language without exposing an ID',()=>{
  let p:FantasyProfile={...newFantasyProfile(),character:player()};p.character!.hour=12;
  p=applyFantasyAction(p,{type:'accept',quest:'main-night-01'}).profile;
  p.character!.location='oldwatch';p.character!.visited.push('oldwatch');p.character!.level=20;
  const stage=fantasyMainStage(p.character!,'main-night-01')!;
  p=applyFantasyAction(p,{type:'investigate',quest:'main-night-01',approach:'analyze'},()=>.999).profile;
  const outcome=p.log.find(log=>log.text.startsWith('主調査'))!,roll=p.log.find(log=>log.text.startsWith(stage.labels.ja))!;
  assert.ok(outcome);assert.ok(roll);
  for(const locale of ['ko','en','ja'] as const){
    const summary=fantasyLogText(outcome.text,locale,p.character),check=fantasyLogText(roll.text,locale,p.character);
    assert.match(summary,/1\/2/);assert.ok(!summary.includes('main-night-01'));
    assert.ok(check.includes(stage.labels[locale]));
    if(locale!=='ja'){assert.doesNotMatch(summary,/[ぁ-んァ-ヶ]/);assert.doesNotMatch(check,/[ぁ-んァ-ヶ]/);}
  }
});
test('disabled skill explanations distinguish missing MP, existing effects and full health in all locales',()=>{
  for(const locale of ['ko','en','ja'] as const){
    const c=player(),skill=fantasySkills(c).find(skill=>skill.kind==='active'&&skill.effect!=='heal')!;
    c.mp=0;assert.match(actionHelp(c,{type:'skill',skill:skill.id},locale)!,/MP/);
    c.mp=100;c.buff={effect:'guard',power:2};assert.ok(actionHelp(c,{type:'skill',skill:skill.id},locale));
    c.buff=null;assert.equal(actionHelp(c,{type:'skill',skill:skill.id},locale),undefined);
    assert.ok(actionHelp(c,{type:'skill',skill:'not-learned'},locale));
  }
});
test('sale and profession explanations follow current place and equipped inventory instead of generic disabled text',()=>{
  const c=player();c.job='cook';
  assert.match(actionHelp(c,{type:'job',job:'cook'},'ko')!,/이미/);
  c.location='greenwood';assert.match(actionHelp(c,{type:'sell',item:'bread'},'ko')!,/상인/);
  c.location='hearth';c.inventory.blade=1;c.equipment={weapon:'blade'};
  assert.match(actionHelp(c,{type:'sell',item:'blade'},'en')!,/Unequip/);
});
test('item and skill details expose their actual restorative and passive effects',()=>{
  const potion=FANTASY_ITEMS.find(item=>item.id==='potion')!,bread=FANTASY_ITEMS.find(item=>item.id==='bread')!;
  assert.ok(itemUseEffectText(potion,'ko').some(text=>/HP \+35/.test(text)));
  assert.ok(itemUseEffectText(potion,'en').some(text=>/MP \+20/.test(text)));
  assert.ok(itemUseEffectText(bread,'ja').some(text=>/空腹 -22/.test(text)));
  const skill=fantasySkills(player()).find(skill=>skill.kind==='passive')!;
  for(const locale of ['ko','en','ja'] as const)assert.ok(skillEffectText(skill,locale).includes(String(skill.power)));
  const c=player(),before=JSON.stringify(c);assert.ok(actionHelp(c,{type:'use',item:'potion'},'ko'));assert.equal(JSON.stringify(c),before);
});

test('displayed skilled power matches the actual prepared effect without applying proficiency twice',()=>{
  const c=player(),base=fantasySkills(c).find(skill=>skill.kind==='active'&&skill.effect==='check')!;
  c.skillXp={[base.id]:150};
  const skilled=fantasySkills(c).find(skill=>skill.id===base.id)!;
  assert.equal(skilled.power,base.power+3);
  for(const locale of ['ko','en','ja'] as const){
    assert.match(skillEffectText(skilled,locale,c),new RegExp(`\\+${skilled.power}(?: ·|$)`));
    assert.doesNotMatch(skillEffectText(skilled,locale,c),new RegExp(`\\+${skilled.power+3}(?: ·|$)`));
  }
  const profile={...newFantasyProfile(),character:c};
  const result=applyFantasyAction(profile,{type:'skill',skill:skilled.id},()=>.9);
  assert.equal(result.profile.character!.buff!.power,skilled.power);
  assert.match(skillEffectText(skilled,'ko',c),/판정/);
});

test('legacy skill descriptions and sale names follow the selected language',()=>{
  const skill=fantasySkills(player()).find(skill=>skill.kind==='active')!;
  for(const locale of ['ko','en'] as const)assert.doesNotMatch(skillDescriptionText(skill,locale),/[\u3040-\u30ff]/);
  assert.match(skillDescriptionText(skill,'ko'),/다음/);assert.match(skillDescriptionText(skill,'en'),/next/);
  assert.equal(itemDisplayName('bread','ko'),'빵');assert.equal(itemDisplayName('bread','en'),'Bread');assert.notEqual(itemDisplayName('bread','ja'),'bread');
});

test('equipment reasons distinguish the worn copy from an available upgrade',()=>{
  const c=player();c.inventory.blade=2;c.equipment={weapon:'blade'};
  c.gear=[{id:'old',item:'blade',quality:1,bonuses:{},guard:0,check:0,createdAt:0},{id:'better',item:'blade',quality:3,bonuses:{},guard:0,check:0,createdAt:0}];c.equippedGear={weapon:'old'};
  assert.match(actionHelp(c,{type:'equip',item:'blade',instance:'old'},'ko')!,/이미/);
  assert.equal(actionHelp(c,{type:'equip',item:'blade'},'ko'),undefined);
  assert.equal(actionHelp(c,{type:'equip',item:'blade',instance:'better'},'ko'),undefined);
  assert.match(actionHelp(c,{type:'sell',item:'blade',instance:'old'},'en')!,/Unequip/);
  c.location='greenwood';
  assert.match(actionHelp(c,{type:'job',job:'priest'},'ko')!,/배울 수 없는/);
});
