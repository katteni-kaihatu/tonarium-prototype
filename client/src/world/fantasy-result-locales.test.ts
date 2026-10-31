import test from 'node:test';
import assert from 'node:assert/strict';
import { fantasyLogText } from './fantasy-copy.ts';
import { FANTASY_ALCHEMY_FORMULAS } from '../../../shared/fantasy-specializations.ts';
import { FANTASY_EVENTS, FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_RECIPES } from '../../../shared/fantasy-data.ts';
import { FANTASY_MAIN_TRIALS } from '../../../shared/fantasy-main-trials.ts';
import { FANTASY_CONTEXT_NAMES } from '../../../shared/fantasy-physiology.ts';
import { applyFantasyAction, newFantasyProfile } from '../../../shared/fantasy-engine.ts';

// 次の一括検証で未発見の薬名が出ないことを確かめる。
test('unidentified alchemy headings keep generic numbers in every language', () => {
  for (const number of [1, 2, 3, 4]) for (const [locale, expected] of [['ko', `미확인 조합 ${number}`], ['en', `Unidentified mixture ${number}`], ['ja', `未確認の配合 ${number}`]] as const) {
    const label = `未確認の配合 ${number}`;
    assert.equal(fantasyLogText(label, locale, null), expected);
    assert.ok(fantasyLogText(`${label}：d20=14、補正+3、合計17 / DC12 → 成功`, locale, null).startsWith(expected));
  }
});

test('result headings and full dice records localize common checks in all three languages', () => {
  for(const [ja,ko,en] of [['部屋の痕跡と仕掛けを調べる','방의 흔적과 장치 조사','Inspect room traces and mechanisms'],['罠の仕掛けを解除する','함정 장치 해제','Disarm the trap'],['罠から身をかわす','함정 회피','Avoid the trap']]){
    assert.equal(fantasyLogText(ja,'ko',null),ko);assert.equal(fantasyLogText(ja,'en',null),en);
    for(const locale of ['ko','en'] as const)for(const dice of ['d20=14','2d20=[8,14]、採用14（最高）'])assert.doesNotMatch(fantasyLogText(`${ja}：${dice}、補正+3、合計17 / DC12 → 成功`,locale,null),/[ぁ-んァ-ヶ]/);
  }
  const labels = [ ['調査','조사','Investigation'], ['発見運','발견운','Discovery'], ['獲物の追跡','사냥감 추적','Tracking'], ['獲物の解体','가죽 채집','Skinning'], ['海釣り','바다낚시','Sea fishing'], ['桟橋釣り','부두 낚시','Pier fishing'], ['危険からの回避','위험 회피','Avoid danger'], ['仲間との現地任務','동료와 현장 임무','Field mission with companions'] ];
  for (const [ja,ko,en] of labels) for (const [locale,expected] of [['ko',ko],['en',en],['ja',ja]] as const) {
    assert.equal(fantasyLogText(ja,locale,null),expected);
    assert.ok(fantasyLogText(`${ja}：d20=14、補正+3、合計17 / DC12 → 成功`,locale,null).startsWith(expected),`${locale} ${ja}`);
  }
  for (const formula of FANTASY_ALCHEMY_FORMULAS) for (const locale of ['ko','en','ja'] as const) assert.equal(fantasyLogText(formula.names.ja,locale,null),formula.names[locale]);
  const c=applyFantasyAction(newFantasyProfile(),{type:'create',source:'human',name:'Headings',gender:'female'},()=>.5).profile.character!;
  c.visited=FANTASY_LOCATIONS.map(place=>place.id);
  const headings=[...FANTASY_JOBS.map(job=>`${job.name}の仕事（1/16）`),...FANTASY_LOCATIONS.map(place=>`${place.name}の探索`),...FANTASY_RECIPES.map(recipe=>recipe.name),...FANTASY_MAIN_TRIALS.flatMap(trial=>trial.stages.map(stage=>stage.labels.ja)),...Object.values(FANTASY_CONTEXT_NAMES).map(context=>context.ja),...FANTASY_EVENTS.flatMap(event=>event.choices.map(choice=>`${event.name}：${choice.label}`))];
  for(const locale of ['ko','en'] as const)for(const heading of headings)assert.doesNotMatch(fantasyLogText(heading,locale,c),/[ぁ-んァ-ヶ]/,`${locale}: ${heading}`);
});
