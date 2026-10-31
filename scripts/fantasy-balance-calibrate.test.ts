import test from 'node:test';
import assert from 'node:assert/strict';
import { calibrationDistance, validateCalibrationVariants } from './fantasy-balance-calibrate.ts';
import { validateCalibrationLoadouts } from './fantasy-balance-calibrate.ts';
import { createBenchmarkProfile } from './fantasy-balance-fixtures.ts';
import { fantasyCombatPlayer } from '../server/fantasy-combat-adapter.ts';
import { fantasyCombatPower, fantasyAdventurerGrade } from '../shared/fantasy-adventurer.ts';

test('calibration targets use actual win rates and never count invalid battles as successes', () => {
 assert.equal(calibrationDistance(7, 7, .4, 0),0);
 assert.ok(calibrationDistance(7,7,.8,0)>calibrationDistance(7,7,.5,0));
 assert.ok(calibrationDistance(7,7,.4,1)>100);
 assert.ok(calibrationDistance(6,7,.08,0)>calibrationDistance(6,7,.04,0));
});
test('calibration variants remain fixed integer species patches, not per-challenger adjustments', () => {
 assert.deepEqual(validateCalibrationVariants([{id:'stable',hp:600,attack:100}]),[{id:'stable',hp:600,attack:100}]);
 for(const values of [[],[{id:'x',hp:0}],[{id:'x',accuracy:101}],[{id:'x',attack:1.5}],[{id:'x',grade:7}],[{id:'x'},{id:'x'}]])assert.throws(()=>validateCalibrationVariants(values));
});

function loadout() {
 const player=fantasyCombatPlayer(createBenchmarkProfile('human','warrior','basic',1,0,'starter'),'reference');
 return {id:'warrior-reference',grade:fantasyAdventurerGrade(player.stats,player),score:fantasyCombatPower(player.stats,player),profileHash:'verified-profile',job:'warrior',player};
}
test('calibration verifies complete rested player payload against its reference', () => {
 const expected=loadout();
 assert.equal(validateCalibrationLoadouts([structuredClone(expected)],[expected],1).length,1);
 for(const change of [(row:typeof expected)=>row.player.hp=1,(row:typeof expected)=>row.player.mp=0,(row:typeof expected)=>Object.assign(row.player,{body:['tampered']})]) {
  const changed=structuredClone(expected);change(changed);
  assert.equal(fantasyCombatPower(changed.player.stats,changed.player),expected.score);
  assert.throws(()=>validateCalibrationLoadouts([changed],[expected],1));
 }
 const unrested=structuredClone(expected);unrested.player.hp=1;
 assert.throws(()=>validateCalibrationLoadouts([unrested],[unrested],1));
});
test('calibration requires unique and complete eligible reference identities', () => {
 const first=loadout(),second={...structuredClone(first),id:'second'};
 assert.throws(()=>validateCalibrationLoadouts([first],[first,second],1));
 assert.throws(()=>validateCalibrationLoadouts([first,first],[first,second],1));
 assert.throws(()=>validateCalibrationLoadouts([first,second],[first,first],1));
 assert.equal(validateCalibrationLoadouts([second,first],[first,second],1).length,2);
});
