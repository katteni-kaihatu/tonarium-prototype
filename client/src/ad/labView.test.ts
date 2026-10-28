import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bigFromLog10, bigFromNumber, bigSub, createNewGame,
  canDimensionalBoost, canAntimatterGalaxy, canSacrifice, canInfinity,
  getDimensionalBoostRequirement, getGalaxyRequirement, getSacrificeCandidate, getDimensionCost,
  type GameState,
} from './engine.mjs';
import { buildAdActions, buildAdLabSnapshot } from './labView.ts';
import { createAdSlice, type AdSlice } from './slice.ts';

function harness(game: GameState) {
  let slice: AdSlice;
  slice = createAdSlice((partial) => { Object.assign(slice, partial); }, () => slice);
  slice.adGame = game;
  return slice;
}

for (const kind of ['boost', 'galaxy'] as const) {
  for (const mode of ['single', 'ten', 'max'] as const) {
    test(`${kind}: ${mode} のスライス購入・リセット直後にスナップショットを更新`, () => {
      const game = createNewGame(0);
      game.dimensionalBoosts = 6;
      const slice = harness(game);
      const actions = buildAdActions(slice);
      for (let reset = 0; reset < 2; reset++) {
        if (kind === 'galaxy') game.dimensionalBoosts = 4;
        const req = kind === 'boost' ? getDimensionalBoostRequirement(game) : getGalaxyRequirement(game);
        const buy = (count: number) => {
          const version = slice.adVersion;
          game.antimatter = bigFromLog10(1000);
          if (mode === 'max') {
            for (let i = 0; i < count; i++) {
              game.antimatter = getDimensionCost(game, req.tier);
              actions.buyDimensionMax(req.tier);
            }
          } else if (mode === 'ten') {
            while (count > 0) {
              const batch = Math.min(count, 10 - game.dimensions[req.tier - 1].bought % 10);
              actions.buyDimensionUpTo(req.tier, batch);
              count -= batch;
            }
          } else {
            for (let i = 0; i < count; i++) actions.buyDimension(req.tier);
          }
          assert.ok(slice.adVersion > version);
        };
        buy(req.amount - 1);
        for (const offset of [-1, 0, 1]) {
          if (offset !== -1) buy(1);
          const snapshot = buildAdLabSnapshot(slice.adGame!);
          assert.equal(snapshot.canBoost, canDimensionalBoost(game));
          assert.equal(snapshot.canGalaxy, canAntimatterGalaxy(game));
          assert.equal(kind === 'boost' ? snapshot.canBoost : snapshot.canGalaxy, offset >= 0);
          assert.equal(kind === 'boost' ? snapshot.boostCurrentAmountText : snapshot.galaxyCurrentAmountText, String(req.amount + offset));
          assert.match(kind === 'boost' ? snapshot.boostRequirementText : snapshot.galaxyRequirementText, new RegExp(`${req.amount}個`));
          const copy = structuredClone(game);
          const clonedSlice = harness(copy);
          const beforeVersion = clonedSlice.adVersion;
          assert.equal(kind === 'boost' ? clonedSlice.adBoost() : clonedSlice.adGalaxy(), offset >= 0);
          if (offset < 0) {
            assert.deepEqual(copy, game);
            assert.equal(clonedSlice.adVersion, beforeVersion);
          }
        }
        const version = slice.adVersion;
        if (kind === 'boost') actions.dimensionalBoost(); else actions.antimatterGalaxy();
        assert.equal(slice.adVersion, version + 1);
        const after = buildAdLabSnapshot(slice.adGame!);
        assert.equal(after.canBoost, false);
        assert.equal(after.canGalaxy, false);
        assert.equal(after.boostCurrentAmountText, '0');
        assert.equal(after.galaxyCurrentAmountText, '0');
      }
      // 古い操作口でも、その時点でスライスが持つ最新のゲームを使う。
      const oldGame = structuredClone(game);
      slice.adGame = createNewGame(1);
      slice.adGame.antimatter = bigFromNumber(10);
      actions.buyDimension(1);
      assert.equal(slice.adGame.dimensions[0].bought, 1);
      assert.deepEqual(game, oldGame);
    });
  }
}

test('実際に不足している小数では Boost・銀河を許可しない', () => {
  for (const shortage of [1, 0.1, 0.001, 1e-10]) {
    const game = createNewGame(0);
    game.dimensionalBoosts = 7;
    game.dimensions[7].amount = bigSub(bigFromNumber(80), bigFromNumber(shortage));
    const snapshot = buildAdLabSnapshot(game);
    assert.equal(snapshot.canBoost, false);
    assert.equal(snapshot.canGalaxy, false);
    const slice = harness(game);
    const before = structuredClone(game);
    assert.equal(slice.adBoost(), false);
    assert.equal(slice.adGalaxy(), false);
    assert.deepEqual(game, before);
  }
});

test('Sacrifice の解放と倍率改善、Crunch の Infinity 閾値を表示と実行で照合', () => {
  for (const boosts of [4, 5]) {
    for (const improved of [false, true]) {
      const game = createNewGame(0);
      game.dimensionalBoosts = boosts;
      game.dimensions[0].amount = bigFromLog10(100);
      if (!improved) game.sacrificeBoost = getSacrificeCandidate(game);
      const before = structuredClone(game);
      const snapshot = buildAdLabSnapshot(game);
      assert.equal(snapshot.sacrificeUnlocked, boosts >= 5);
      assert.equal(snapshot.canSacrifice, canSacrifice(game));
      assert.equal(snapshot.canSacrifice, boosts >= 5 && improved);
      const slice = harness(game);
      assert.equal(slice.adSacrifice(), snapshot.canSacrifice);
      if (!snapshot.canSacrifice) assert.deepEqual(game, before);
      assert.equal(buildAdLabSnapshot(game).canSacrifice, false);
    }
  }
  for (const antimatter of [1.78e308, 1.79e308, 1.795e308]) {
    const game = createNewGame(0);
    game.antimatter = bigFromNumber(antimatter);
    const before = structuredClone(game);
    const snapshot = buildAdLabSnapshot(game);
    assert.equal(snapshot.canCrunch, canInfinity(game));
    assert.equal(snapshot.canCrunch, antimatter >= 1.79e308);
    assert.equal(harness(game).adPrestige(), snapshot.canCrunch);
    if (!snapshot.canCrunch) assert.deepEqual(game, before);
    assert.equal(buildAdLabSnapshot(game).canCrunch, false);
  }
});
