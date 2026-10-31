import test from 'node:test';
import assert from 'node:assert/strict';
import { fantasyCharacterJobNames, fantasyPriestTitle } from './fantasy-job-display.ts';

test('saint title follows gender without changing vocation IDs or growth',()=>{
  assert.deepEqual(fantasyPriestTitle('saint','female'),{ko:'성녀',en:'Saintess',ja:'聖女'});
  assert.deepEqual(fantasyPriestTitle('saint','male'),{ko:'성자',en:'Saint',ja:'聖者'});
  assert.deepEqual(fantasyPriestTitle('saint','none'),{ko:'성인',en:'Saint',ja:'聖人'});
  const female={job:'priest',gender:'female' as const,priestGrowth:{branch:'saint'}};
  assert.deepEqual(fantasyCharacterJobNames(female as Parameters<typeof fantasyCharacterJobNames>[0]),fantasyPriestTitle('saint','female'));
  assert.equal(female.priestGrowth.branch,'saint');
  assert.equal(fantasyCharacterJobNames({job:'warrior',gender:'female'}).ko,'전사');
});
