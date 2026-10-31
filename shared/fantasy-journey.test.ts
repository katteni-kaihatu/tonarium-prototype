import test from 'node:test';
import assert from 'node:assert/strict';
import { fantasyJourneyPoint } from './fantasy-journey.ts';

test('a reverse partial-edge journey starts at the on-road point instead of the far endpoint',()=>{
 const journey={path:['greenwood','hearth'],startedAt:9,endsAt:10,hour:9,name:'Return',travel:{paid:0,ambushChecked:0,legs:[{from:'greenwood',to:'hearth',transport:'foot',hours:1,cost:0,startFraction:.5}]}};
 const start=fantasyJourneyPoint(journey)!;assert.deepEqual(start.point,{x:245,y:297.5});assert.deepEqual(start.points[0],start.point);
 assert.deepEqual(fantasyJourneyPoint({...journey,hour:9.5})!.point,{x:265,y:318.75});
});
test('mixed-leg animation reaches the transfer node at its scheduled time instead of using geometric distance',()=>{
 const journey={path:['sunmeadow','hearth','emberhall'],startedAt:8,endsAt:10.5,hour:9,name:'Transfer',travel:{paid:9,ambushChecked:0,legs:[{from:'sunmeadow',to:'hearth',transport:'foot',hours:1,cost:0},{from:'hearth',to:'emberhall',transport:'carriage',hours:1.5,cost:9}]}};
 assert.deepEqual(fantasyJourneyPoint(journey)!.point,{x:285,y:340});
 assert.deepEqual(fantasyJourneyPoint({...journey,hour:9.75})!.point,{x:320,y:282.5});
});
