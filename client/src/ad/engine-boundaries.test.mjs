import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createNewGame, bigFromNumber, bigFromLog10, bigNormalize, bigCompare, bigAdd, bigSub, bigMulNumber,
  serialize, deserialize, sacrifice, canSacrifice, rescueIfStuck, tick, getSacrificeCandidate, bigZero, bigLog10,
  getDimensionProductionPerSecond,
  buyDimension, buyMaxDimension, buyMax, getDimensionCost, formatNumber,
  getDimensionalBoostRequirement, getGalaxyRequirement,
  canDimensionalBoost, canAntimatterGalaxy, dimensionalBoost, antimatterGalaxy,
  getInfinityGain, prestigeInfinity, offlineProgress, runAutobuyers, unlockAutobuyer, setAutobuyerEnabled,
  upgradeAutobuyerInterval, getAutobuyerInterval, getAutobuyerUpgradeCost, createAutobuyers,
  INFINITY_UPGRADES, INFINITY_UPGRADE_IDS, hasInfinityUpgrade, isInfinityUpgradeAvailable, canBuyInfinityUpgrade,
  buyInfinityUpgrade, getInfinityUpgradeEffect, getStartingState, getTickspeedPerPurchase, getDimensionMultiplierBig,
  getIpGenerationInterval, canInfinity, bigToNumber,
  AUTOBUYER_IDS, AUTOBUYER_RUN_ORDER, AUTOBUYER_UNLOCK_COST, AUTOBUYER_MAX_LEVEL, getMaxUnlockedTier, buyTickspeed,
} from './engine.mjs';
import { validateSave } from './sync.mjs';

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

function sacrificeReady() {
  const game = createNewGame(0);
  game.dimensionalBoosts = 5;
  game.dimensions[7].amount = bigFromNumber(1);
  game.dimensions[0].amount = bigFromLog10(100);
  return game;
}

test('第8次元が0のSacrificeは押せない', () => {
  const game = sacrificeReady();
  assert.equal(canSacrifice(game), true);
  game.dimensions[7].amount = bigZero();
  const before = structuredClone(game);
  assert.equal(canSacrifice(game), false);
  assert.equal(sacrifice(game), false);
  assert.deepEqual(game, before);
});

test('Sacrificeは倍率が2倍以上に伸びるときだけ押せる', () => {
  const game = sacrificeReady();
  const candidate = getSacrificeCandidate(game);
  game.sacrificeBoost = bigMulNumber(candidate, 1 / 2.01);
  assert.equal(canSacrifice(game), true);
  game.sacrificeBoost = bigMulNumber(candidate, 1 / 1.9);
  assert.equal(canSacrifice(game), false);
});

test('Boost5回・第8次元なしでMax All後にSacrificeしても詰まない', () => {
  const game = createNewGame(0);
  game.dimensionalBoosts = 5;
  game.antimatter = bigFromLog10(20);
  buyMax(game);
  game.dimensions[7].amount = bigZero();
  game.dimensions[0].amount = bigFromLog10(100);
  assert.equal(sacrifice(game), false);
  assert.ok(bigCompare(game.dimensions[0].amount, 1) > 0);
});

function stuckGame() {
  const game = createNewGame(0);
  game.dimensionalBoosts = 5;
  game.dimensions[7].bought = 3;
  game.antimatter = bigFromNumber(5);
  return game;
}

test('詰んだ状態では第8次元が1つ渡され生産が戻る', () => {
  const game = stuckGame();
  tick(game, 1000);
  assert.equal(bigCompare(game.antimatter, 5), 0);
  assert.equal(rescueIfStuck(game), true);
  assert.equal(bigCompare(game.dimensions[7].amount, 1), 0);
  assert.equal(game.dimensions[7].bought, 3);
  assert.equal(rescueIfStuck(game), false);
  tick(game, 1000);
  assert.ok(bigCompare(game.dimensions[6].amount, 0) > 0);
});

test('次元が残っている、または買えるときは救済しない', () => {
  const remaining = stuckGame();
  remaining.dimensions[2].amount = bigFromNumber(1);
  const affordable = stuckGame();
  affordable.antimatter = bigFromNumber(10);
  for (const game of [remaining, affordable]) {
    const before = structuredClone(game);
    assert.equal(rescueIfStuck(game), false);
    assert.deepEqual(game, before);
  }
});

test('Galaxy30・Tickspeed3000回でもtickは例外なく反物質が有限で増える', () => {
  const game = createNewGame(0);
  game.galaxies = 30;
  game.tickspeedBought = 3000;
  game.dimensions[0].amount = bigFromNumber(10);
  const before = bigLog10(game.antimatter);
  assert.doesNotThrow(() => tick(game, 100));
  assert.ok(Number.isFinite(game.antimatter.exponent) && Number.isFinite(game.antimatter.mantissa));
  assert.ok(Number.isFinite(game.tickspeed));
  assert.ok(bigLog10(game.antimatter) > before);
  assert.ok(Number.isFinite(bigLog10(getDimensionProductionPerSecond(game, 1))));
  assert.doesNotThrow(() => JSON.parse(serialize(game)));
});

const withIp = (n) => { const g = createNewGame(0); g.infinityPoints = bigFromNumber(n); return g; };
const ipNumber = (g) => g.infinityPoints.mantissa * 10 ** g.infinityPoints.exponent;

test('IP の獲得量は桁数に比例し、1.79e308 未満では 0', () => {
  const gainAt = (log10) => { const g = createNewGame(0); g.antimatter = bigFromLog10(log10); return getInfinityGain(g); };
  assert.equal(gainAt(308.2), 0);
  assert.equal(gainAt(Math.log10(1.79e308)), 1);
  assert.equal(gainAt(500), 1);
  assert.equal(gainAt(617), 2);
  assert.equal(gainAt(925), 3);
  const g = createNewGame(0);
  g.antimatter = bigFromLog10(617);
  assert.equal(prestigeInfinity(g), 2);
  assert.equal(ipNumber(g), 2);
});

test('自動購入の解放・短縮の費用と IP の減り方', () => {
  const g = withIp(100);
  for (const id of AUTOBUYER_IDS) {
    const before = ipNumber(g);
    assert.equal(unlockAutobuyer(g, id), true);
    assert.equal(ipNumber(g), before - AUTOBUYER_UNLOCK_COST[id]);
    assert.equal(g.autobuyers[id].enabled, true);
    assert.equal(unlockAutobuyer(g, id), false);
  }
  assert.deepEqual(AUTOBUYER_IDS.map((id) => AUTOBUYER_UNLOCK_COST[id]), [1, 1, 1, 2, 2, 3]);
  const intervals = [];
  for (let level = 0; level <= AUTOBUYER_MAX_LEVEL; level++) {
    intervals.push(getAutobuyerInterval(level));
    if (level < AUTOBUYER_MAX_LEVEL) {
      const before = ipNumber(g);
      assert.equal(getAutobuyerUpgradeCost(g, 'tickspeed'), level + 1);
      assert.equal(upgradeAutobuyerInterval(g, 'tickspeed'), true);
      assert.equal(ipNumber(g), before - (level + 1));
    }
  }
  assert.deepEqual(intervals.map(Math.round), [5000, 3000, 1800, 1080, 648, 500]);
  const before = ipNumber(g);
  assert.equal(getAutobuyerUpgradeCost(g, 'tickspeed'), null);
  assert.equal(upgradeAutobuyerInterval(g, 'tickspeed'), false);
  assert.equal(ipNumber(g), before);
});

test('IP が足りないと解放も短縮も何も変わらない', () => {
  const g = withIp(2);
  const snapshot = structuredClone(g);
  assert.equal(unlockAutobuyer(g, 'crunch'), false);
  assert.equal(upgradeAutobuyerInterval(g, 'lowDims'), false);
  assert.equal(setAutobuyerEnabled(g, 'lowDims', true), false);
  assert.deepEqual(g, snapshot);
  assert.equal(unlockAutobuyer(g, 'lowDims'), true);
  assert.equal(upgradeAutobuyerInterval(g, 'lowDims'), true);
  assert.equal(upgradeAutobuyerInterval(g, 'lowDims'), false);
});

test('自動購入は間隔どおりに動き、オフでは動かない', () => {
  const g = withIp(5);
  g.antimatter = bigFromNumber(1e6);
  unlockAutobuyer(g, 'tickspeed');
  runAutobuyers(g, 4900);
  assert.equal(g.tickspeedBought, 0);
  runAutobuyers(g, 100);
  assert.ok(g.tickspeedBought > 0);
  const bought = g.tickspeedBought;
  g.antimatter = bigFromNumber(1e12);
  setAutobuyerEnabled(g, 'tickspeed', false);
  runAutobuyers(g, 60_000);
  assert.equal(g.tickspeedBought, bought);
  setAutobuyerEnabled(g, 'tickspeed', true);
  runAutobuyers(g, 5000);
  assert.ok(g.tickspeedBought > bought);
});

test('自動購入の次元は解放済みの階層だけを高い順に買う', () => {
  const g = withIp(5);
  g.antimatter = bigFromNumber(1e30);
  unlockAutobuyer(g, 'lowDims');
  unlockAutobuyer(g, 'highDims');
  assert.equal(getMaxUnlockedTier(g), 4);
  runAutobuyers(g, 5000);
  assert.ok(g.dimensions.slice(0, 4).every((d) => d.bought > 0));
  assert.ok(g.dimensions.slice(4).every((d) => d.bought === 0));
  g.dimensionalBoosts = 4;
  g.antimatter = bigFromNumber(1e60);
  runAutobuyers(g, 5000);
  assert.ok(g.dimensions.slice(4).every((d) => d.bought > 0));
});

test('同時に動くときは Galaxy が Boost より先、リセット系が購入より先', () => {
  assert.deepEqual(AUTOBUYER_RUN_ORDER, ['crunch', 'galaxy', 'boost', 'highDims', 'lowDims', 'tickspeed']);
  const g = withIp(10);
  for (const id of ['galaxy', 'boost']) unlockAutobuyer(g, id);
  g.dimensionalBoosts = 10;
  g.dimensions[7].amount = bigFromNumber(1000);
  runAutobuyers(g, 5000);
  assert.equal(g.galaxies, 1);
  assert.equal(g.dimensionalBoosts, 0);
  const h = withIp(10);
  for (const id of ['crunch', 'lowDims']) unlockAutobuyer(h, id);
  h.antimatter = bigFromLog10(400);
  runAutobuyers(h, 5000);
  assert.equal(h.infinities, 1);
  assert.equal(h.dimensions[0].bought, 1);
  assert.equal(ipNumber(h), 10 - 1 - 3 + 1);
});

test('Big Crunch・Galaxy・Boost の後も自動購入の設定は残る', () => {
  const g = withIp(10);
  for (const id of AUTOBUYER_IDS) unlockAutobuyer(g, id);
  upgradeAutobuyerInterval(g, 'crunch');
  setAutobuyerEnabled(g, 'boost', false);
  const before = structuredClone(g.autobuyers);
  g.antimatter = bigFromLog10(400);
  g.dimensions[7].amount = bigFromNumber(1000);
  prestigeInfinity(g);
  antimatterGalaxy(g);
  dimensionalBoost(g);
  assert.deepEqual(g.autobuyers, before);
});

test('オフライン進行でも自動購入が動く', () => {
  const g = withIp(5);
  g.antimatter = bigFromNumber(1e6);
  unlockAutobuyer(g, 'tickspeed');
  g.lastTick = 1;
  offlineProgress(g, 60_000);
  assert.ok(g.tickspeedBought > 0);
  const off = withIp(5);
  off.antimatter = bigFromNumber(1e6);
  off.lastTick = 1;
  offlineProgress(off, 60_000);
  assert.equal(off.tickspeedBought, 0);
});

test('autobuyers のないセーブ・壊れた値のセーブを読み込める', () => {
  const g = withIp(5);
  unlockAutobuyer(g, 'galaxy');
  upgradeAutobuyerInterval(g, 'galaxy');
  const saved = JSON.parse(serialize(g));
  validateSave(saved);
  assert.deepEqual(deserialize(saved).autobuyers, g.autobuyers);

  const legacy = { ...saved };
  delete legacy.autobuyers;
  validateSave(legacy);
  assert.deepEqual(deserialize(legacy).autobuyers, createAutobuyers());

  for (const broken of [null, 'x', 5, [], { galaxy: 1 }, { galaxy: { unlocked: 'yes', level: -3 } },
    { galaxy: { unlocked: true, enabled: 'x', level: 99, elapsedMs: 'NaN' } }]) {
    const state = deserialize({ ...saved, autobuyers: broken });
    for (const id of AUTOBUYER_IDS) {
      const ab = state.autobuyers[id];
      assert.equal(typeof ab.unlocked, 'boolean');
      assert.ok(ab.level >= 0 && ab.level <= AUTOBUYER_MAX_LEVEL);
      assert.ok(Number.isFinite(ab.elapsedMs) && ab.elapsedMs >= 0);
    }
  }
  assert.equal(deserialize({ ...saved, autobuyers: { galaxy: { unlocked: true, level: 99 } } }).autobuyers.galaxy.level, AUTOBUYER_MAX_LEVEL);
  assert.throws(() => validateSave({ ...saved, autobuyers: { galaxy: 1 } }));
  assert.throws(() => validateSave({ ...saved, autobuyers: 'x' }));
});

test('全部オンの新規ゲームが例外なく自動で Big Crunch まで進む', () => {
  const g = createNewGame(0);
  g.infinityPoints = bigFromNumber(100);
  for (const id of AUTOBUYER_IDS) {
    unlockAutobuyer(g, id);
    while (upgradeAutobuyerInterval(g, id));
  }
  g.infinityPoints = bigZero();
  const capSec = 48 * 3600;
  let sec = 0;
  while (g.infinities === 0 && sec < capSec) {
    tick(g, 1000);
    runAutobuyers(g, 1000);
    rescueIfStuck(g);
    sec += 1;
  }
  console.log(`auto crunch after ${(sec / 3600).toFixed(2)} simulated hours`);
  assert.ok(g.infinities >= 1, 'auto crunch never happened');
  assert.ok(ipNumber(g) >= 1);
});

const MIN = 60_000;
const log = (g, tier) => bigLog10(getDimensionMultiplierBig(g, tier));
const withUpgrades = (g, ...ids) => { g.infinityUpgrades = ids; return g; };

test('Infinity 強化の表は16種・合計67 IP・4列×4段', () => {
  assert.equal(INFINITY_UPGRADES.length, 16);
  assert.equal(INFINITY_UPGRADES.reduce((sum, u) => sum + u.cost, 0), 67);
  assert.equal(new Set(INFINITY_UPGRADE_IDS).size, 16);
  for (let column = 1; column <= 4; column++) {
    assert.deepEqual(INFINITY_UPGRADES.filter(u => u.column === column).map(u => u.row), [1, 2, 3, 4]);
  }
  assert.deepEqual(INFINITY_UPGRADES.filter(u => u.column === 4).map(u => u.cost), [6, 8, 10, 20]);
});

test('強化は列の上の段から順にしか買えず、IP が足りないと何も変わらない', () => {
  const g = createNewGame(0);
  g.infinityPoints = bigFromNumber(1);
  assert.equal(buyInfinityUpgrade(g, 'dims18'), false);
  assert.equal(isInfinityUpgradeAvailable(g, 'dims18'), false);
  assert.equal(buyInfinityUpgrade(g, 'unknown'), false);
  assert.equal(buyInfinityUpgrade(g, 'galaxyBoost'), false);
  assert.equal(buyInfinityUpgrade(g, 'startBoost1'), false);
  assert.equal(ipNumber(g), 1);
  assert.deepEqual(g.infinityUpgrades, []);
  assert.equal(buyInfinityUpgrade(g, 'totalTime'), true);
  assert.equal(ipNumber(g), 0);
  assert.equal(canBuyInfinityUpgrade(g, 'dims18'), false);
  assert.equal(buyInfinityUpgrade(g, 'dims18'), false);
  g.infinityPoints = bigFromNumber(10);
  assert.equal(buyInfinityUpgrade(g, 'totalTime'), false);
  assert.equal(buyInfinityUpgrade(g, 'dims18'), true);
  assert.equal(buyInfinityUpgrade(g, 'dims27'), false);
  assert.equal(buyInfinityUpgrade(g, 'buy10'), true);
  assert.equal(buyInfinityUpgrade(g, 'dims27'), true);
  assert.equal(ipNumber(g), 7);
});

test('倍率の強化: 経過時間・周回時間・Infinity 回数・蓄えた IP・まとめ買い・Boost', () => {
  const g = createNewGame(0);
  g.lastTick = 10 * MIN;
  const base = [1, 2, 3, 4, 5, 6, 7, 8].map(tier => log(g, tier));
  assert.deepEqual(base, [0, 0, 0, 0, 0, 0, 0, 0]);
  withUpgrades(g, 'totalTime');
  for (let tier = 1; tier <= 8; tier++) assert.ok(Math.abs(log(g, tier) - 0.15 * Math.log10(10 / 2)) < 1e-9);
  g.lastTick = MIN;
  assert.equal(log(g, 1), 0);

  const run = createNewGame(0);
  run.lastTick = 32 * MIN;
  run.runStartedAt = 16 * MIN;
  withUpgrades(run, 'runTime');
  assert.ok(Math.abs(log(run, 4) - 0.25 * Math.log10(16 / 4)) < 1e-9);
  run.runStartedAt = 32 * MIN;
  assert.equal(log(run, 4), 0);

  const inf = createNewGame(0);
  inf.infinities = 4;
  withUpgrades(inf, 'dims18', 'dims27', 'dims36', 'dims45');
  for (let tier = 1; tier <= 8; tier++) assert.ok(Math.abs(log(inf, tier) - Math.log10(3)) < 1e-9, `tier ${tier}`);
  withUpgrades(inf, 'dims18', 'dims36');
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(tier => log(inf, tier) > 0), [true, false, true, false, false, true, false, true]);

  const ip = createNewGame(0);
  ip.infinityPoints = bigFromNumber(6);
  withUpgrades(ip, 'unspentIp');
  assert.ok(Math.abs(log(ip, 1) - Math.log10(8)) < 1e-9);
  assert.equal(log(ip, 2), 0);

  const b = createNewGame(0);
  b.dimensions[0].bought = 20;
  b.dimensionalBoosts = 3;
  assert.ok(Math.abs(log(b, 1) - 5 * Math.log10(2)) < 1e-9);
  withUpgrades(b, 'buy10', 'boostMult');
  assert.ok(Math.abs(log(b, 1) - (2 * Math.log10(2.2) + 3 * Math.log10(2.5))) < 1e-9);
  assert.ok(Math.abs(log(b, 3) - Math.log10(2.5)) < 1e-9);
  assert.deepEqual(getInfinityUpgradeEffect(b, 'buy10'), { kind: 'mult', value: bigFromNumber(2.2) });
});

test('銀河の増幅と必要数の削減', () => {
  const g = createNewGame(0);
  g.galaxies = 3;
  assert.ok(Math.abs(getTickspeedPerPurchase(g) - (1.1245 + 0.02 * 3)) < 1e-12);
  withUpgrades(g, 'galaxyBoost');
  assert.ok(Math.abs(getTickspeedPerPurchase(g) - (1.1245 + 0.04 * 3)) < 1e-12);

  const h = createNewGame(0);
  assert.deepEqual(getDimensionalBoostRequirement(h), { tier: 4, amount: 20 });
  assert.equal(getGalaxyRequirement(h).amount, 80);
  withUpgrades(h, 'resetReq');
  assert.deepEqual(getDimensionalBoostRequirement(h), { tier: 4, amount: 11 });
  h.dimensionalBoosts = 4;
  assert.deepEqual(getDimensionalBoostRequirement(h), { tier: 8, amount: 26 });
  h.dimensionalBoosts = 9;
  assert.equal(getDimensionalBoostRequirement(h).amount, 101);
  h.galaxies = 2;
  assert.equal(getGalaxyRequirement(h).amount, 191);
  h.dimensions[3].amount = bigFromNumber(11);
  h.dimensionalBoosts = 0;
  assert.equal(canDimensionalBoost(h), true);
  assert.ok(INFINITY_UPGRADES.length && getInfinityUpgradeEffect(h, 'resetReq').value === 9);
});

const crunchReady = (g) => { g.antimatter = bigFromLog10(310); };

test('開始時の Boost・Galaxy は Galaxy の後と Big Crunch の後で変わる', () => {
  const galaxyReady = (g) => { g.dimensions[7].amount = bigFromNumber(80 + 60 * g.galaxies); };
  const plain = createNewGame(0);
  galaxyReady(plain);
  assert.equal(antimatterGalaxy(plain), true);
  assert.deepEqual([plain.dimensionalBoosts, plain.galaxies], [0, 1]);

  for (const [ids, boosts] of [[['startBoost1'], 1], [['startBoost1', 'startBoost2'], 2], [['startBoost1', 'startBoost2', 'startBoost3'], 3], [['startBoost1', 'startBoost2', 'startBoost3', 'startGalaxy'], 4]]) {
    const g = withUpgrades(createNewGame(0), ...ids);
    g.dimensionalBoosts = 6;
    galaxyReady(g);
    assert.equal(antimatterGalaxy(g), true);
    assert.deepEqual([g.dimensionalBoosts, g.galaxies], [boosts, 1], `Galaxy 後 ${ids.at(-1)}`);
    assert.equal(getMaxUnlockedTier(g), Math.min(8, 4 + boosts));

    const c = withUpgrades(createNewGame(0), ...ids);
    c.dimensionalBoosts = 6;
    c.galaxies = 3;
    crunchReady(c);
    assert.ok(prestigeInfinity(c) > 0);
    assert.deepEqual([c.dimensionalBoosts, c.galaxies], [boosts, ids.includes('startGalaxy') ? 1 : 0], `Crunch 後 ${ids.at(-1)}`);
  }
  const dimBoost = withUpgrades(createNewGame(0), 'startBoost1');
  dimBoost.dimensions[3].amount = bigFromNumber(20);
  assert.equal(dimensionalBoost(dimBoost), true);
  assert.equal(dimBoost.dimensionalBoosts, 1);
  assert.deepEqual(getStartingState(createNewGame(0)), { boosts: 0, galaxies: 0 });
});

test('Big Crunch で最速の周回時間と周回の開始時刻が更新される', () => {
  const g = createNewGame(1000);
  g.lastTick = 1000 + 50 * MIN;
  crunchReady(g);
  prestigeInfinity(g);
  assert.equal(g.bestInfinityMs, 50 * MIN);
  assert.equal(g.runStartedAt, g.lastTick);
  g.lastTick += 80 * MIN;
  crunchReady(g);
  prestigeInfinity(g);
  assert.equal(g.bestInfinityMs, 50 * MIN);
  g.lastTick += 20 * MIN;
  crunchReady(g);
  prestigeInfinity(g);
  assert.equal(g.bestInfinityMs, 20 * MIN);
});

test('IP の自然生成: 最速周回の10倍ごと（最短10分）に +1、オフライン中も進む', () => {
  const g = withUpgrades(createNewGame(0), 'ipGen');
  assert.equal(getIpGenerationInterval(g), null);
  tick(g, 3_600_000);
  assert.equal(ipNumber(g), 0);

  g.bestInfinityMs = 30_000;
  assert.equal(getIpGenerationInterval(g), 10 * MIN);
  tick(g, 9 * MIN);
  assert.equal(ipNumber(g), 0);
  tick(g, 1 * MIN);
  assert.equal(ipNumber(g), 1);
  tick(g, 25 * MIN);
  assert.equal(ipNumber(g), 3);

  const slow = withUpgrades(createNewGame(1), 'ipGen');
  slow.bestInfinityMs = 60 * MIN;
  assert.equal(getIpGenerationInterval(slow), 600 * MIN);
  const result = offlineProgress(slow, 1 + 8 * 60 * MIN);
  assert.equal(result.simulatedMs, 8 * 60 * MIN);
  assert.equal(ipNumber(slow), 0);
  offlineProgress(slow, 1 + 9 * 60 * MIN);
  assert.equal(ipNumber(slow), 0);
  offlineProgress(slow, 1 + 18 * 60 * MIN);
  assert.equal(ipNumber(slow), 1);

  const quick = withUpgrades(createNewGame(1), 'ipGen');
  quick.bestInfinityMs = MIN;
  offlineProgress(quick, 1 + 8 * 60 * MIN);
  assert.equal(ipNumber(quick), 48);
  assert.ok(Number.isFinite(quick.ipGenElapsedMs) && quick.ipGenElapsedMs < 10 * MIN);
});

test('Infinity 強化の項目がないセーブ・壊れた値・未知の ID を読み込める', () => {
  const g = createNewGame(5000);
  g.lastTick = 9000;
  const saved = JSON.parse(serialize(g));
  for (const key of ['infinityUpgrades', 'runStartedAt', 'bestInfinityMs', 'ipGenElapsedMs']) delete saved[key];
  validateSave(saved);
  const legacy = deserialize(saved);
  assert.deepEqual(legacy.infinityUpgrades, []);
  assert.equal(legacy.runStartedAt, legacy.createdAt);
  assert.equal(legacy.bestInfinityMs, null);
  assert.equal(legacy.ipGenElapsedMs, 0);

  for (const broken of [null, 'x', 5, {}, [1, null, {}], ['nope', 'dims18'], ['dims18', 'dims36'], ['startGalaxy', 'startBoost2']]) {
    assert.deepEqual(deserialize({ ...saved, infinityUpgrades: broken }).infinityUpgrades, [], JSON.stringify(broken));
  }
  assert.deepEqual(deserialize({ ...saved, infinityUpgrades: ['dims18', 'totalTime', 'dims36', 'bogus', 'totalTime'] }).infinityUpgrades, ['totalTime', 'dims18', 'dims36']);
  assert.deepEqual(deserialize({ ...saved, infinityUpgrades: ['buy10', 'dims27', 'galaxyBoost'] }).infinityUpgrades, ['buy10', 'dims27']);
  for (const bad of ['x', null, NaN, Infinity, 1e999, 'late']) {
    const state = deserialize({ ...saved, runStartedAt: bad === 'late' ? 99999 : bad, bestInfinityMs: bad, ipGenElapsedMs: bad });
    assert.equal(state.runStartedAt, state.createdAt);
    assert.equal(state.bestInfinityMs, null);
    assert.equal(state.ipGenElapsedMs, 0);
  }
  assert.equal(deserialize({ ...saved, bestInfinityMs: -5 }).bestInfinityMs, null);
  assert.equal(deserialize({ ...saved, bestInfinityMs: 1234, ipGenElapsedMs: 77, runStartedAt: 6000 }).bestInfinityMs, 1234);

  const round = deserialize(serialize(Object.assign(createNewGame(0), { infinityUpgrades: ['totalTime', 'dims18'], bestInfinityMs: 4000, runStartedAt: 0 })));
  assert.deepEqual(round.infinityUpgrades, ['totalTime', 'dims18']);
  assert.equal(round.bestInfinityMs, 4000);
  validateSave(JSON.parse(serialize(round)));
  validateSave({ ...saved, infinityUpgrades: ['whatever'], bestInfinityMs: null });
  for (const patch of [{ infinityUpgrades: 'x' }, { infinityUpgrades: [1] }, { runStartedAt: 'x' }, { bestInfinityMs: -1 }, { bestInfinityMs: 'x' }, { ipGenElapsedMs: -1 }]) {
    assert.throws(() => validateSave({ ...saved, ...patch }), JSON.stringify(patch));
  }
});

test('手で上手に遊ぶと周回ごとに速くなる（毎秒 Max All・Galaxy > Boost > Sacrifice・IP は安い強化から）', () => {
  const g = createNewGame(0);
  const runs = [];
  let seconds = 0;
  let last = 0;
  const spend = () => {
    for (;;) {
      const next = INFINITY_UPGRADES.filter(u => canBuyInfinityUpgrade(g, u.id)).sort((a, b) => a.cost - b.cost)[0];
      if (!next) return;
      buyInfinityUpgrade(g, next.id);
    }
  };
  while (g.infinities < 10 && seconds < 200 * 3600) {
    if (canInfinity(g)) {
      prestigeInfinity(g);
      runs.push((seconds - last) / 3600);
      last = seconds;
      spend();
    }
    buyMax(g);
    if (!antimatterGalaxy(g) && !dimensionalBoost(g)) sacrifice(g);
    tick(g, 1000);
    seconds += 1;
    rescueIfStuck(g);
    if (hasInfinityUpgrade(g, 'ipGen')) spend();
  }
  console.log(`manual play run hours: ${runs.map(h => h.toFixed(2)).join(', ')}`);
  assert.equal(runs.length, 10);
  assert.ok(runs[0] > 15 && runs[0] < 30, `1st run ${runs[0]}`);
  assert.ok(runs[1] < runs[0] / 2, '2nd run is much shorter than the 1st');
  assert.ok(runs[9] < 2, `10th run ${runs[9]}h`);
  assert.ok(g.infinityUpgrades.length >= 6);
});

test('強化を持ったまま8時間のオフライン進行が例外なく終わり、有限の値のままになる', () => {
  const g = createNewGame(1);
  g.infinities = 5;
  g.createdAt = -50 * 3600_000;
  g.bestInfinityMs = 20 * MIN;
  g.infinityPoints = bigFromNumber(30);
  g.infinityUpgrades = [...INFINITY_UPGRADE_IDS];
  g.dimensionalBoosts = 4;
  g.galaxies = 3;
  for (const dim of g.dimensions) { dim.amount = bigFromNumber(1e6); dim.bought = 50; }
  g.tickspeedBought = 200;
  for (const id of AUTOBUYER_IDS) unlockAutobuyer(g, id);
  const result = offlineProgress(g, 1 + 9 * 3600_000);
  assert.equal(result.simulatedMs, 8 * 3600_000);
  assert.ok(Number.isFinite(bigLog10(g.antimatter)));
  assert.ok(Number.isFinite(g.tickspeed));
  assert.ok(g.infinityPoints.exponent >= 0 || bigToNumber(g.infinityPoints) >= 0);
});
