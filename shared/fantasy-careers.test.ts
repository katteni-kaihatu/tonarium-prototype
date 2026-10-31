import test from 'node:test';
import assert from 'node:assert/strict';
import {applyFantasyAction,newFantasyProfile,fantasySkills} from './fantasy-engine.ts';
import {FANTASY_ITEMS,FANTASY_RECIPES} from './fantasy-data.ts';
import {fantasyLifeJob} from './fantasy-careers.ts';
import {FANTASY_LIFE_JOBS} from './fantasy-careers.ts';
import {createFantasyGear} from './fantasy-equipment.ts';

const created=()=>applyFantasyAction(newFantasyProfile(),{type:'create',source:'human',name:'Careers',gender:'female'},()=>.5).profile;
test('one combat and one life career coexist; replacing either retains the other and all practice',()=>{
 let p=applyFantasyAction(created(),{type:'job',job:'warrior'},()=>.99).profile;
 p=applyFantasyAction(p,{type:'job',job:'cook'},()=>.99).profile;
 assert.equal(p.character!.job,'warrior');assert.equal(fantasyLifeJob(p.character!),'cook');
 p.character!.jobXp.cook=120;
 p=applyFantasyAction(p,{type:'job',job:'blacksmith'},()=>.99).profile;
 assert.equal(p.character!.job,'warrior');assert.equal(p.character!.lifeJob,'blacksmith');assert.equal(p.character!.jobXp.cook,120);
 p=applyFantasyAction(p,{type:'job',job:'archer'},()=>.99).profile;
 assert.equal(p.character!.job,'archer');assert.equal(p.character!.lifeJob,'blacksmith');
});
test('life crafting uses its own career and practice without changing combat profession',()=>{
 const p=created(),c=p.character!;c.job='warrior';c.lifeJob='blacksmith';c.jobXp={unassigned:0,warrior:0,blacksmith:0};c.inventory=Object.fromEntries(FANTASY_ITEMS.map(item=>[item.id,100]));
 const recipe=FANTASY_RECIPES.find(r=>r.id==='smith-blade')!;
 const made=applyFantasyAction(p,{type:'craft',recipe:recipe.id},()=>.99);
 assert.equal(made.error,undefined);assert.equal(made.profile.character!.job,'warrior');
 assert.ok(made.profile.character!.jobXp.blacksmith>0);assert.equal(made.profile.character!.jobXp.warrior,0);
});
test('life skills use the selected profession XP and hide again after switching life career',()=>{
 const p=created(),c=p.character!;c.job='warrior';c.lifeJob='cook';c.jobXp={unassigned:0,warrior:0,cook:1000};
 const ids=fantasySkills(c).map(s=>s.id);assert.ok(ids.some(id=>id.includes('cook')));
 c.lifeJob='blacksmith';c.jobXp.blacksmith=0;
 assert.ok(!fantasySkills(c).some(s=>s.id.startsWith('job-cook-')));assert.equal(c.jobXp.cook,1000);
});
test('all sixteen life disciplines occupy one independent slot',()=>{
 let p=created();p.character!.job='warrior';p.character!.jobXp.warrior=100;
 for(const job of FANTASY_LIFE_JOBS){const result=applyFantasyAction(p,{type:'job',job},()=>.99);assert.equal(result.error,undefined);p=result.profile;assert.equal(p.character!.job,'warrior');assert.equal(p.character!.lifeJob,job);assert.equal(p.character!.jobXp.warrior,100);}
});
test('crafted quality follows life profession mastery rather than combat mastery',()=>{
 const p=created(),c=p.character!;c.job='warrior';c.lifeJob='blacksmith';c.jobXp={unassigned:0,warrior:1000,blacksmith:0};
 const low=createFantasyGear(c,'blade',()=>.99)!;c.jobXp.warrior=0;c.jobXp.blacksmith=1000;
 const high=createFantasyGear(c,'blade',()=>.99)!;
 assert.ok(high.quality>low.quality);assert.equal(c.job,'warrior');assert.equal(c.lifeJob,'blacksmith');
});
