import test from 'node:test';
import assert from 'node:assert/strict';
import { newFantasyProfile, applyFantasyAction } from './fantasy-engine.ts';
import { FANTASY_LOCATIONS } from './fantasy-data.ts';
import { fantasyEnvironment, fantasyEnvironmentActionError, fantasyEnvironmentPenalty } from './fantasy-environment.ts';
import { fantasyJourneyPoint } from './fantasy-journey.ts';
import { parseFantasyRoll } from './fantasy-roll.ts';
import { fantasyGmKnowledge } from './fantasy-gm-knowledge.ts';
import { FANTASY_MAIN_REVEALS } from './fantasy-second-content.ts';
import { FANTASY_CANON_FACTS } from './fantasy-lore.ts';
import { FANTASY_FINAL_ISLE_ID } from './fantasy-isle-access.ts';

const character=()=>applyFantasyAction(newFantasyProfile(),{type:'create',name:'World test',gender:'female',source:'human'},()=>.5).profile.character!;
test('seasons roll over every fifteen shared days and the year after sixty',()=>{
  for(const [day,season,seasonDay,year] of [[0,'spring',1,312],[14,'spring',15,312],[15,'summer',1,312],[30,'autumn',1,312],[45,'winter',1,312],[60,'spring',1,313]] as const){
    const e=fantasyEnvironment({location:'hearth',hour:day*24+12});
    assert.equal(e.season,season);assert.equal(e.seasonDay,seasonDay);assert.equal(e.year,year);
  }
});
test('darkness blocks field actions but a light, adapted senses or a settlement allows them',()=>{
  const c=character();c.location='greenwood';c.hour=23;c.inventory={};
  assert.ok(fantasyEnvironmentActionError(c,{type:'explore'}));
  assert.equal(fantasyEnvironmentActionError(c,{type:'rest'}),undefined);
  c.inventory.lantern=1;assert.equal(fantasyEnvironmentActionError(c,{type:'gather',resource:'wood'}),undefined);
  c.inventory={};c.race='batkin';assert.equal(fantasyEnvironmentActionError(c,{type:'explore'}),undefined);
  c.race='human';c.location='hearth';assert.equal(fantasyEnvironmentActionError(c,{type:'explore'}),undefined);
});
test('a winter outfit lowers an actual cold environment penalty',()=>{
  const c=character();c.location='greenwood';c.hour=45*24+12;c.inventory={'fur-parka':1,lantern:1};
  const before=fantasyEnvironmentPenalty(c);c.outfit='fur-parka';assert.ok(fantasyEnvironmentPenalty(c)<before);
});
test('travel progress interpolates a route and clamps start and arrival',()=>{
  const from=FANTASY_LOCATIONS.find(p=>p.id==='hearth')!,to=FANTASY_LOCATIONS.find(p=>p.id==='greenwood')!;
  const journey={path:[from.id,to.id],startedAt:10,endsAt:12,hour:9,name:'Traveler'};
  assert.deepEqual(fantasyJourneyPoint(journey)?.point,{x:from.x,y:from.y});
  const midpoint=fantasyJourneyPoint({...journey,hour:11})!;
  assert.equal(midpoint.progress,.5);assert.equal(midpoint.point.x,(from.x+to.x)/2);assert.equal(midpoint.point.y,(from.y+to.y)/2);
  assert.deepEqual(fantasyJourneyPoint({...journey,hour:13})?.point,{x:to.x,y:to.y});
  assert.equal(fantasyJourneyPoint({...journey,path:[]}),undefined);
});
test('dice presentation reads real single rolls and temporary highest or lowest pools',()=>{
  const single=parseFantasyRoll('採集：d6=4、補正+2、合計6 / DC4 → 成功')!;
  assert.equal(single.sides,6);assert.deepEqual(single.dice,[4]);assert.equal(single.success,true);
  const high=parseFantasyRoll('探索：2d20=[3,16]、採用16（最高）、補正-1、合計15 / DC18 → 失敗')!;
  assert.equal(high.kept,16);assert.equal(high.rule,'highest');assert.equal(high.success,false);
  const low=parseFantasyRoll('仕事：2d8=[2,7]、採用2（最低）、補正+1、合計3 / DC5 → 失敗')!;
  assert.equal(low.rule,'lowest');
  assert.equal(parseFantasyRoll('仕事：2d8=[2]、採用7（最低）、補正+1、合計8 / DC5 → 成功'),undefined);
});
test('GM only knows the island ending after a real journal record and replaces the superseded rumor',()=>{
  let p=newFantasyProfile();p.character=character();
  const rumor=FANTASY_CANON_FACTS.find(fact=>fact.id==='uncharted-isle-rumor')!.text.ko;
  const fresh=fantasyGmKnowledge(p,'ko');
  assert.ok(fresh.includes(rumor));
  for(const reveal of FANTASY_MAIN_REVEALS)assert.equal(fresh.includes(reveal.text.ko),false);
  p.character.completed=FANTASY_MAIN_REVEALS.map(r=>r.questId);p.character.visited=FANTASY_LOCATIONS.map(l=>l.id);p.character.location=FANTASY_FINAL_ISLE_ID;
  assert.ok(!fantasyGmKnowledge(p,'ko').includes(FANTASY_MAIN_REVEALS.at(-1)!.text.ko),'legacy chapter completion alone cannot disclose the unplayed ending');
  const recorded=applyFantasyAction(p,{type:'finishVoyage'});assert.equal(recorded.error,undefined);assert.equal(recorded.changed,true);p=recorded.profile;
  const learned=fantasyGmKnowledge(p,'ko');assert.ok(learned.includes(FANTASY_MAIN_REVEALS.at(-1)!.text.ko));
  assert.ok(!learned.includes(rumor));
});
