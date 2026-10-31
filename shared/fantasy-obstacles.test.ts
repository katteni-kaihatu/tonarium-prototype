import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_OBSTACLE_KINDS, fantasyObstacleBreak, fantasyObstacleKind, fantasyObstacleName, fantasyObstaclePassage } from './fantasy-obstacles.ts';

test('every obstacle kind is registered once with three names and consistent rules', () => {
  assert.ok(FANTASY_OBSTACLE_KINDS.length >= 8);
  assert.equal(new Set(FANTASY_OBSTACLE_KINDS.map(kind => kind.id)).size, FANTASY_OBSTACLE_KINDS.length);
  for (const kind of FANTASY_OBSTACLE_KINDS) {
    for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(kind.names[locale].length > 0);
    assert.equal(kind.breakable, kind.hp > 0);
    assert.equal(kind.breakable, kind.vulnerable !== 'none');
    assert.ok(['block', 'under', 'over'].includes(kind.passage));
  }
  for (const id of ['thick-vine', 'boulder', 'great-ice', 'hole', 'low-wall', 'fallen-log', 'rubble', 'barrel']) assert.ok(fantasyObstacleKind(id), id);
  assert.equal(fantasyObstacleName('great-ice', 'ko'), '큰 얼음');
  assert.equal(fantasyObstacleName('unknown', 'ko'), 'unknown');
});

test('breakable obstacles double damage on their weakness and never go below zero', () => {
  const vine = fantasyObstacleKind('thick-vine')!;
  assert.deepEqual(fantasyObstacleBreak(vine, 3, 'fire'), { hp: 0, dealt: 6 });
  assert.deepEqual(fantasyObstacleBreak(vine, 2, 'blunt'), { hp: 4, dealt: 2 });
  assert.equal(fantasyObstacleBreak(fantasyObstacleKind('hole')!, 99, 'blunt'), undefined);
});

test('small, flying and large bodies pass holes and low obstacles differently', () => {
  const hole = fantasyObstacleKind('hole')!, wall = fantasyObstacleKind('low-wall')!, rubble = fantasyObstacleKind('rubble')!, rock = fantasyObstacleKind('boulder')!;
  assert.equal(fantasyObstaclePassage(hole, { small: true }), 'block');
  assert.equal(fantasyObstaclePassage(hole, {}), 'block');
  assert.equal(fantasyObstaclePassage(wall, { flying: true }), 'over');
  assert.equal(fantasyObstaclePassage(rubble, { large: true }), 'over');
  assert.equal(fantasyObstaclePassage(rubble, { flying: true }), 'over');
  assert.equal(fantasyObstaclePassage(rubble, {}), 'block');
  assert.equal(fantasyObstaclePassage(rock, { flying: true, small: true, large: true }), 'block');
});
