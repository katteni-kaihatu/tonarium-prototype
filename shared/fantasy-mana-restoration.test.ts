import test from 'node:test';import assert from 'node:assert/strict';
import {FANTASY_JOBS} from './fantasy-data.ts';
import {applyFantasyAction,newFantasyProfile,fantasyStats} from './fantasy-engine.ts';
test('three fitting learned job skills restore MP and use a shared recovery interval',()=>{
  for(const [job,id] of [['mage','job-mage-advanced-2'],['priest','job-priest-advanced-4'],['bard','job-bard-advanced-6']]){
    const skill=FANTASY_JOBS.find(j=>j.id===job)!.skills.find(s=>s.id===id)!;assert.equal(skill.restore,'mp');
    const p=applyFantasyAction(newFantasyProfile(),{type:'create',source:'human',gender:'female',name:'마나회복'},()=>.5).profile,c=p.character!;
    c.job=job;c.jobXp[job]=300;c.unlockedSkills=[id];c.skillXp={'mage-insight':50,'job-bard-advanced-2':50};c.hour=12;c.mp=10;c.hp=fantasyStats(c).hp;
    const used=applyFantasyAction(p,{type:'skill',skill:id},()=>.5);assert.equal(used.error,undefined);assert.ok(used.profile.character!.mp>10);assert.equal(used.profile.character!.hp,c.hp);assert.equal(used.profile.character!.manaRecoveryAt,13);
    assert.ok(applyFantasyAction(used.profile,{type:'skill',skill:id}).error);assert.equal(p.character!.manaRecoveryAt,undefined);
  }
});
