import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createNewGame, bigFromNumber, bigFromLog10, bigNormalize, bigCompare, bigAdd, bigSub, bigMulNumber,
  serialize, deserialize, sacrifice,
  buyDimension, buyMaxDimension, buyMax, getDimensionCost, formatNumber,
  getDimensionalBoostRequirement, getGalaxyRequirement,
  canDimensionalBoost, canAntimatterGalaxy, dimensionalBoost, antimatterGalaxy,
} from './engine.mjs';

const operations = {
  boost: { requirement: getDimensionalBoostRequirement, can: canDimensionalBoost, run: dimensionalBoost },
  galaxy: { requirement: getGalaxyRequirement, can: canAntimatterGalaxy, run: antimatterGalaxy },
};

function purchase(game, tier, count, mode) {
  if (mode === 'max' || mode === 'all') {
    // 次の購入を含まない資金にして、反復上限ではなく所持金で Max を止める。
    const budget = structuredClone(game);
    let cost = bigFromNumber(0);
    for (let i = 0; i < count; i++) {
      cost = bigAdd(cost, getDimensionCost(budget, tier));
      budget.dimensions[tier - 1].bought++;
    }
    game.antimatter = bigMulNumber(cost, 1.001);
    if (mode === 'all') {
      game.tickspeedBought = 2000;
      assert.equal(buyMax(game).dimensions[tier - 1], count);
    } else assert.equal(buyMaxDimension(game, tier), count);
    return;
  }
  game.antimatter = bigFromLog10(1000);
  while (count > 0) {
    const batch = mode === 'ten' ? Math.min(10 - game.dimensions[tier - 1].bought % 10, count) : 1;
    for (let i = 0; i < batch; i++) assert.equal(buyDimension(game, tier), true);
    count -= batch;
  }
}

for (const mode of ['single', 'ten', 'max', 'all']) {
  for (const [kind, boosts, galaxies] of [
    ['boost', 0, 0], ['boost', 4, 0], ['boost', 6, 0], ['boost', 7, 0],
    ['galaxy', 4, 0], ['galaxy', 4, 1],
  ]) {
    test(`${kind} boosts=${boosts} galaxies=${galaxies}: ${mode} 購入の境界とリセット後`, () => {
      const op = operations[kind];
      const game = createNewGame(0);
      game.dimensionalBoosts = boosts;
      game.galaxies = galaxies;
      for (let reset = 0; reset < 2; reset++) {
        // 銀河で Boost がリセットされた後も、第8次元だけ購入可能にする。
        if (kind === 'galaxy') game.dimensionalBoosts = 4;
        const req = op.requirement(game);
        purchase(game, req.tier, req.amount - 1, mode);
        for (const offset of [-1, 0, 1]) {
          if (offset !== -1) purchase(game, req.tier, 1, mode);
          const amount = game.dimensions[req.tier - 1].amount;
          assert.equal(formatNumber(amount), formatNumber(req.amount + offset));
          assert.equal(bigCompare(amount, bigFromNumber(req.amount + offset)), 0,
            `内部値 ${JSON.stringify(amount)} が ${req.amount + offset} と一致する`);
          assert.equal(op.can(game), offset >= 0);
          const copy = structuredClone(game);
          const before = structuredClone(copy);
          assert.equal(op.run(copy), offset >= 0);
          if (offset < 0) assert.deepEqual(copy, before);
        }
        assert.equal(op.run(game), true);
        assert.equal(op.can(game), false);
      }
    });
  }
}

test('整数加算を保ち、実際の不足や小数を切り上げない', () => {
  for (let n = 0; n <= 10000; n++) {
    assert.equal(bigCompare(bigAdd(bigFromNumber(n), 1), bigFromNumber(n + 1)), 0);
  }
  for (const required of [20, 35, 65, 80, 95, 140]) {
    for (const shortage of [1, 0.1, 0.001, 1e-10]) {
      const amount = bigSub(bigFromNumber(required), shortage);
      assert.equal(bigCompare(amount, required), -1);
      assert.equal(bigCompare(bigAdd(amount, 1), required + 1), -1);
    }
  }
});

// 修正前の bigAdd による購入を再現し、丸めた初期値で回帰を隠さない。
function legacyPurchase(game, tier, count) {
  for (let i = 0; i < count; i++) {
    const dim = game.dimensions[tier - 1];
    const cost = getDimensionCost(game, tier);
    assert.equal(bigCompare(game.antimatter, cost) >= 0, true);
    game.antimatter = bigSub(game.antimatter, cost);
    const amount = dim.amount;
    dim.amount = amount.mantissa === 0 ? bigFromNumber(1)
      : bigNormalize(amount.mantissa + 1 / 10 ** amount.exponent, amount.exponent);
    dim.bought++;
  }
}

for (const [kind, boosts] of [['boost', 6], ['boost', 7], ['galaxy', 4]]) {
  for (const mode of ['single', 'ten', 'max', 'all']) {
    test(`${kind} boosts=${boosts}: 旧セーブを復元して ${mode} 購入を続ける`, () => {
      const op = operations[kind];
      const original = createNewGame(0);
      original.dimensionalBoosts = boosts;
      original.antimatter = bigFromLog10(1000);
      const req = op.requirement(original);
      legacyPurchase(original, req.tier, req.amount - 1);
      assert.equal(bigCompare(original.dimensions[7].amount, req.amount - 1), -1);
      const game = deserialize(serialize(original), 0);
      assert.deepEqual(game.dimensions, original.dimensions);
      const before = structuredClone(game);
      assert.equal(op.can(game), false);
      assert.equal(op.run(game), false);
      assert.deepEqual(game, before);
      for (const offset of [0, 1]) {
        purchase(game, req.tier, 1, mode);
        assert.equal(bigCompare(game.dimensions[7].amount, req.amount + offset), 0);
        assert.equal(formatNumber(game.dimensions[7].amount), formatNumber(req.amount + offset));
        assert.equal(op.can(game), true);
        assert.equal(op.run(structuredClone(game)), true);
      }
    });
  }
}

test('保存済みの実際の小数不足は購入しても切り上げない', () => {
  for (const [kind, boosts] of [['boost', 6], ['boost', 7], ['galaxy', 4]]) {
    const op = operations[kind];
    for (const shortage of [0.1, 0.001, 1e-10]) {
      const original = createNewGame(0);
      original.dimensionalBoosts = boosts;
      const req = op.requirement(original);
      purchase(original, req.tier, req.amount - 2, 'single');
      original.dimensions[7].amount = bigSub(bigFromNumber(req.amount - 1), shortage);
      const game = deserialize(serialize(original), 0);
      purchase(game, req.tier, 1, 'single');
      assert.equal(bigCompare(game.dimensions[7].amount, req.amount), -1);
      const before = structuredClone(game);
      assert.equal(op.can(game), false);
      assert.equal(op.run(game), false);
      assert.deepEqual(game, before);
    }
  }
});

test('Sacrificeで失った第1〜7次元を購入回数から復元しない', () => {
  const game = createNewGame(0);
  game.dimensionalBoosts = 5;
  for (let tier = 1; tier <= 8; tier++) purchase(game, tier, 20, 'single');
  game.dimensions[0].amount = bigFromLog10(20);
  assert.equal(sacrifice(game), true);
  for (let tier = 1; tier <= 7; tier++) {
    purchase(game, tier, 1, 'single');
    assert.equal(game.dimensions[tier - 1].bought, 21);
    assert.equal(bigCompare(game.dimensions[tier - 1].amount, 1), 0);
  }
});
