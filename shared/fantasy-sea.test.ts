import test from 'node:test';
import assert from 'node:assert/strict';
import {fantasySeaPosition} from './fantasy-sea.ts';
import type {FantasyTravelPosition} from './fantasy.ts';
test('only actually boarded ship positions on real sea edges enable naval encounters',()=>{
  const p:FantasyTravelPosition={from:'dawnport',to:'frontier-landing',fraction:.4,transport:'ship',remainingHours:10};
  assert.equal(fantasySeaPosition({travelPosition:p}),p);
  assert.ok(fantasySeaPosition({travelPosition:{...p,transport:'working-ship'}}));
  assert.ok(fantasySeaPosition({travelPosition:{from:p.from,to:p.to,fraction:.4}}));
  assert.equal(fantasySeaPosition({travelPosition:undefined}),undefined);
  for(const invalid of [{...p,fraction:0},{...p,fraction:1},{...p,fraction:NaN},{...p,transport:'airship' as const},{...p,from:'hearth',to:'greenwood'},{...p,from:'invented-port'}])assert.equal(fantasySeaPosition({travelPosition:invalid}),undefined);
});
