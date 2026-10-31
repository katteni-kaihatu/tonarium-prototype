import test from 'node:test';
import assert from 'node:assert/strict';
import {fantasyCombatPower} from './fantasy-adventurer.ts';
const stats={hp:100,mp:0,attack:30,defense:10,agility:0,intelligence:0,accuracy:80,magicResist:10};
test('modern ordinary physical offense does not invent intelligence damage absent from combat',()=>{
 assert.equal(fantasyCombatPower(stats,{range:'melee',skills:[]}),fantasyCombatPower({...stats,intelligence:100},{range:'melee',skills:[]}));
 assert.ok(fantasyCombatPower({...stats,intelligence:100},{range:'magic',skills:[]})>fantasyCombatPower(stats,{range:'magic',skills:[]}));
 assert.ok(fantasyCombatPower({...stats,intelligence:100})>fantasyCombatPower(stats));
});
test('modern range valuation includes bounded re-approaches after locked attacks',()=>{
 const melee=fantasyCombatPower(stats,{range:'melee',skills:[]}),ranged=fantasyCombatPower(stats,{range:'ranged',skills:[]});
 assert.ok(ranged>melee);assert.ok(ranged/melee<=1.16);
});
