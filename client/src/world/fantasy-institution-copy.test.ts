import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fantasyErrorText, fantasyLogText } from './fantasy-copy.ts';

test('party contract errors display readable copy in every locale instead of internal tags', () => {
  for (const source of ['party-contract:owner-only', 'party-contract:unavailable']) for (const locale of ['ko', 'en', 'ja'] as const) {
    const error = fantasyErrorText(source, locale), log = fantasyLogText(source, locale, null);
    assert.notEqual(error, source); assert.equal(log, error); assert.doesNotMatch(error, /party-contract:/);
  }
});

test('the institution request guidance and underworld domain errors reach Korean and English readers', () => {
  const source = '一般依頼は担当施設か依頼人の掲示から受注してください。';
  assert.equal(fantasyErrorText(source, 'ko'), '일반 의뢰는 담당 시설이나 의뢰인의 게시에서 수락해 주세요.');
  assert.equal(fantasyErrorText(source, 'en'), 'Accept ordinary contracts from the responsible facility or issuer’s postings.');
  assert.equal(fantasyErrorText(source, 'ja'), source);
  for (const locale of ['ko', 'en'] as const) for (const translator of [(value: string) => fantasyErrorText(value, locale), (value: string) => fantasyLogText(value, locale, null)]) {
    assert.doesNotMatch(translator('組織の記録と要求を確かめてください。'), /[ぁ-んァ-ヶ]/);
  }
  for (const locale of ['ko', 'en'] as const) assert.doesNotMatch(fantasyErrorText('この依頼を受ける所属資格がありません。', locale), /[ぁ-んァ-ヶ]/);
});
