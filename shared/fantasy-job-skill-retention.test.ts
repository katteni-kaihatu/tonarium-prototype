import { learnFantasyMagicBook } from './fantasy-magic-discovery.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, fantasySkills, fantasyStats, newFantasyProfile } from './fantasy-engine.ts';
import { FANTASY_JOBS } from './fantasy-data.ts';
import { FANTASY_READABLE_LIBRARY_BOOKS } from './fantasy-library.ts';
import { fantasyJobPathSkills } from './fantasy-job-paths.ts';
import { fantasyCombatPlayer } from '../server/fantasy-combat-adapter.ts';
import { FantasyStore } from '../server/fantasy-store.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('changing profession hides and disables its skills, saves their practice, and restores access after returning', t => {
  let p=applyFantasyAction(newFantasyProfile(),{type:'create',source:'human',name:'기술 보존',gender:'female'},()=>.5).profile;
  const c=p.character!;c.job='mage';c.jobXp.mage=250;c.location='hearth';c.hour=108;c.readBooks=FANTASY_READABLE_LIBRARY_BOOKS.map(book=>book.id);
  c.practice={explore:100,craft:100,gather:100,hunt:100,fish:100,command:100};
  c.unlockedSkills=FANTASY_JOBS.flatMap(job=>job.skills.filter(skill=>skill.unlock?.kind==='mentor').map(skill=>skill.id));
  c.skillXp=Object.fromEntries(FANTASY_JOBS.flatMap(job=>job.skills.map(skill=>[skill.id,150])));
  c.jobPaths={mage:{path:'mage-flame',hour:90}};
  learnFantasyMagicBook(c,'stone-and-flame');learnFantasyMagicBook(c,'mana-primer');
  c.specialization={spells:[{slot:1,element:'flame',form:'bolt'}]};
  c.mp=fantasyStats(c).mp;c.hp=fantasyStats(c).hp;
  assert.equal(fantasyJobPathSkills(c).length,2);
  const oldSkills=fantasySkills(c).filter(skill=>FANTASY_JOBS.find(job=>job.id==='mage')!.skills.some(old=>old.id===skill.id)||skill.id.startsWith('path-mage-'));
  const xp=structuredClone(c.skillXp),mageXp=c.jobXp.mage,spells=structuredClone(c.specialization.spells);
  assert.ok(oldSkills.some(skill=>skill.kind==='active')&&oldSkills.some(skill=>skill.kind==='passive'));
  const changed=applyFantasyAction(p,{type:'job',job:'warrior',via:'guild'},()=>.5);assert.equal(changed.error,undefined);p=changed.profile;
  assert.equal(p.character!.jobXp.mage,mageXp);assert.deepEqual(p.character!.skillXp,xp);assert.deepEqual(p.character!.specialization!.spells,spells);
  const visible=new Set(fantasySkills(p.character!).map(skill=>skill.id)),battle=new Set(fantasyCombatPlayer(p,'owner').skills.map(skill=>skill.id));
  for(const old of oldSkills){assert.equal(visible.has(old.id),false,old.id);assert.equal(battle.has(old.id),false,old.id);if(old.kind==='active'){const denied=applyFantasyAction(p,{type:'skill',skill:old.id},()=>.5);assert.ok(denied.error,old.id);assert.deepEqual(denied.profile,p);}}
  assert.ok(applyFantasyAction(p,{type:'magicCast',slot:1},()=>.5).error);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fantasy-skill-retention-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'profiles.json');fs.writeFileSync(file,JSON.stringify({owner:p}));const store=new FantasyStore(file,{onError:()=>{}});assert.equal(store.loadError,undefined);p=store.profile('owner');
  assert.deepEqual(p.character!.skillXp,xp);assert.equal(p.character!.jobXp.mage,mageXp);
  const returned=applyFantasyAction(p,{type:'job',job:'mage',via:'guild'},()=>.5);assert.equal(returned.error,undefined);
  const restored=new Set(fantasySkills(returned.profile.character!).map(skill=>skill.id));for(const old of oldSkills)assert.ok(restored.has(old.id),old.id);
  assert.deepEqual(returned.profile.character!.skillXp,xp);assert.ok(fantasyCombatPlayer(returned.profile,'owner').skills.some(skill=>skill.id==='prepared-spell-1'));
});
