/**
 * engine.mjs — Antimatter Dimensions (pure logic layer / game engine)
 *
 * UI-independent. No DOM, no fetch, no timers: the caller owns the loop
 * and calls `tick(state, dtMs)` (e.g. every 50-100 ms from requestAnimationFrame
 * or setInterval in the UI, or from a server / offline simulation).
 *
 * ---------------------------------------------------------------------------
 * Number representation ("BigNum", exponent-separated)
 * ---------------------------------------------------------------------------
 * Every quantity that can grow past ~1e308 is a plain, JSON-serializable
 * object:
 *
 *     { mantissa: number, exponent: number }   // value = mantissa * 10^exponent
 *
 * Invariants (enforced by `bigNormalize`):
 *   - zero is exactly `{ mantissa: 0, exponent: 0 }`
 *   - non-zero values have `1 <= |mantissa| < 10` and an integer exponent
 *   - exponent is an ordinary JS number, so values up to ~1e(2^53) are
 *     representable — 1e308 is nowhere near a ceiling.
 *
 * Because the state only contains plain objects / numbers / strings /
 * arrays, `serialize` is just JSON and the same state shape can be sent
 * to a backend, stored in localStorage, or kept in a database verbatim.
 */

// ---------------------------------------------------------------------------
// Constants (balancing — single source of truth, tunable in one place)
// ---------------------------------------------------------------------------

export const VERSION = 1;

/** Initial cost of each dimension tier (tier 1 .. tier 8). */
export const INITIAL_COSTS = [10, 100, 1e4, 1e6, 1e9, 1e13, 1e18, 1e24];

/** log10(INITIAL_COSTS), precomputed. */
export const INITIAL_COST_LOG10 = INITIAL_COSTS.map((c) => Math.log10(c));

/**
 * Cost growth (spec §2): 10-purchase BLOCK system. The unit cost is constant
 * inside a block of 10 purchases and jumps at each block boundary:
 *   cost(tier, bought) = INITIAL_COSTS[tier-1]
 *                        * 10^(COST_MULT_LOG10_PER10[tier-1] * floor(bought/10))
 * i.e. costMultPer10 = 10^COST_MULT_LOG10_PER10 = [1e3,1e4,1e5,1e6,1e8,1e10,1e12,1e15].
 */
export const COST_MULT_LOG10_PER10 = [3, 4, 5, 6, 8, 10, 12, 15];

/**
 * @deprecated Legacy name. Previously held per-purchase log increments;
 * it now aliases COST_MULT_LOG10_PER10 (per-10-block log multipliers).
 * Prefer COST_MULT_LOG10_PER10.
 */
export const COST_LOG_INCREMENTS = COST_MULT_LOG10_PER10;

/** Base production rate per dimension (spec §1.3/§2.1): 1st = 1.0/s, others 0.1/s. */
export const DIMENSION_BASE_RATES = [1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1];

export const TICKSPEED_INITIAL_COST_LOG10 = 3; // 1,000 antimatter
export const TICKSPEED_COST_LOG_INCREMENT = 1; // x10 per purchase
/** Tickspeed effect per purchase (spec §3, Reality formula): base 1.1245. */
export const TICKSPEED_BASE_PER_PURCHASE = 1.1245;
/** Each galaxy adds +0.02 to the per-purchase tickspeed effect (spec §3/§5). */
export const TICKSPEED_GALAXY_BONUS = 0.02;
/** Legacy alias: the base per-purchase multiplier at 0 galaxies. */
export const TICKSPEED_MULTIPLIER_PER_PURCHASE = TICKSPEED_BASE_PER_PURCHASE;

/** Sacrifice は倍率が現在の何倍以上に伸びるときだけ押せる。 */
export const SACRIFICE_MIN_GAIN = 2;

export const INFINITY_THRESHOLD_LOG10 = Math.log10(1.79e308); // ≈ 308.2529
// IP は桁数に比例（floor(log10 / この値)）。指数的にすると上限なく伸び続けるため線形にする。
export const INFINITY_IP_STEP_LOG10 = INFINITY_THRESHOLD_LOG10;

/** 自動購入の定数表。表示順は AUTOBUYER_IDS、同時に動くときの実行順は AUTOBUYER_RUN_ORDER。 */
export const AUTOBUYER_IDS = ['lowDims', 'highDims', 'tickspeed', 'boost', 'galaxy', 'crunch'];
export const AUTOBUYER_RUN_ORDER = ['crunch', 'galaxy', 'boost', 'highDims', 'lowDims', 'tickspeed'];
export const AUTOBUYER_UNLOCK_COST = { lowDims: 1, highDims: 1, tickspeed: 1, boost: 2, galaxy: 2, crunch: 3 };
export const AUTOBUYER_BASE_INTERVAL_MS = 5000;
export const AUTOBUYER_INTERVAL_FACTOR = 0.6;
export const AUTOBUYER_MIN_INTERVAL_MS = 500;
// 5000 * 0.6^5 = 389ms で最短を下回る最初の段階
export const AUTOBUYER_MAX_LEVEL = 5;
export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000; // 8 hours

/**
 * Infinity 強化の定数表。列は上から順にしか買えず、列どうしは独立。
 * 費用・効果の数値はここだけで調整する。
 */
export const INFINITY_UPGRADES = [
  { id: 'totalTime', column: 1, row: 1, cost: 1 },
  { id: 'dims18', column: 1, row: 2, cost: 1 },
  { id: 'dims36', column: 1, row: 3, cost: 1 },
  { id: 'resetReq', column: 1, row: 4, cost: 1 },
  { id: 'buy10', column: 2, row: 1, cost: 1 },
  { id: 'dims27', column: 2, row: 2, cost: 1 },
  { id: 'dims45', column: 2, row: 3, cost: 1 },
  { id: 'galaxyBoost', column: 2, row: 4, cost: 2 },
  { id: 'runTime', column: 3, row: 1, cost: 2 },
  { id: 'unspentIp', column: 3, row: 2, cost: 3 },
  { id: 'boostMult', column: 3, row: 3, cost: 4 },
  { id: 'ipGen', column: 3, row: 4, cost: 5 },
  { id: 'startBoost1', column: 4, row: 1, cost: 6 },
  { id: 'startBoost2', column: 4, row: 2, cost: 8 },
  { id: 'startBoost3', column: 4, row: 3, cost: 10 },
  { id: 'startGalaxy', column: 4, row: 4, cost: 20 },
];
export const INFINITY_UPGRADE_IDS = INFINITY_UPGRADES.map((u) => u.id);
export const INFINITY_UPGRADE_PARAMS = {
  totalTimeDivMin: 2, totalTimeExp: 0.15,
  runTimeDivMin: 4, runTimeExp: 0.25,
  infinityPerCount: 0.5,
  unspentIpDiv: 2, unspentIpExp: 1.5,
  buy10Mult: 2.2, boostMult: 2.5,
  baseBuy10Mult: 2, baseBoostMult: 2,
  galaxyBoostFactor: 2,
  resetReduction: 9,
  ipGenFactor: 10, ipGenMinIntervalMs: 10 * 60 * 1000,
  startBoosts: { startBoost1: 1, startBoost2: 2, startBoost3: 3, startGalaxy: 4 },
  startGalaxies: 1,
};
const INFINITY_UPGRADE_PAIRS = { dims18: [1, 8], dims27: [2, 7], dims36: [3, 6], dims45: [4, 5] };

// ---------------------------------------------------------------------------
// BigNum helpers
// ---------------------------------------------------------------------------

/** Normalize a mantissa/exponent pair into the canonical form. */
export function bigNormalize(mantissa, exponent = 0) {
  if (mantissa === 0 || !Number.isFinite(mantissa)) {
    return { mantissa: 0, exponent: 0 };
  }
  const shift = Math.floor(Math.log10(Math.abs(mantissa)));
  if (shift !== 0) {
    mantissa /= 10 ** shift;
    exponent += shift;
  }
  // Guard against floating point drift pushing mantissa to exactly 10.
  if (Math.abs(mantissa) >= 10) { mantissa /= 10; exponent += 1; }
  if (Math.abs(mantissa) < 1 && mantissa !== 0) { mantissa *= 10; exponent -= 1; }
  return { mantissa, exponent: Math.trunc(exponent) };
}

/**
 * Coerce number | string | {mantissa,exponent} | {m,e} into a BigNum.
 * Throws TypeError on unusable input.
 */
export function toBig(value) {
  if (typeof value === 'number') return bigFromNumber(value);
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return bigFromNumber(n);
    const m = /^([+-]?[\d.]+)e([+-]?\d+)$/i.exec(value.trim());
    if (m) return bigNormalize(Number(m[1]), Number(m[2]));
    throw new TypeError(`toBig: cannot parse "${value}"`);
  }
  if (value && typeof value === 'object') {
    if ('mantissa' in value || 'exponent' in value) {
      return bigNormalize(Number(value.mantissa ?? 0), Number(value.exponent ?? 0));
    }
    if ('m' in value || 'e' in value) {
      return bigNormalize(Number(value.m ?? 0), Number(value.e ?? 0));
    }
  }
  throw new TypeError(`toBig: unsupported value ${String(value)}`);
}

/** Alias kept for readability at call sites. */
export const big = toBig;

export function bigFromNumber(n) {
  if (n === 0) return { mantissa: 0, exponent: 0 };
  if (!Number.isFinite(n)) throw new TypeError('bigFromNumber: non-finite input');
  return bigNormalize(n, 0);
}

export function bigFromLog10(log10) {
  if (!Number.isFinite(log10)) throw new TypeError('bigFromLog10: non-finite input');
  const exponent = Math.floor(log10);
  return { mantissa: 10 ** (log10 - exponent), exponent };
}

export function bigZero() { return { mantissa: 0, exponent: 0 }; }
export function bigOne() { return { mantissa: 1, exponent: 0 }; }
export function bigClone(b) { const x = toBig(b); return { mantissa: x.mantissa, exponent: x.exponent }; }

export function bigLog10(b) {
  const x = toBig(b);
  return x.mantissa === 0 ? -Infinity : x.exponent + Math.log10(Math.abs(x.mantissa));
}

export function bigCompare(a, b) {
  const x = toBig(a); const y = toBig(b);
  if (x.mantissa === 0 && y.mantissa === 0) return 0;
  if (x.mantissa === 0) return y.mantissa > 0 ? -1 : 1;
  if (y.mantissa === 0) return x.mantissa > 0 ? 1 : -1;
  const sx = Math.sign(x.mantissa); const sy = Math.sign(y.mantissa);
  if (sx !== sy) return sx < sy ? -1 : 1;
  if (x.exponent !== y.exponent) return (x.exponent < y.exponent ? -1 : 1) * sx;
  if (x.mantissa === y.mantissa) return 0;
  return (x.mantissa < y.mantissa ? -1 : 1) * sx;
}
export const bigGte = (a, b) => bigCompare(a, b) >= 0;
export const bigGt = (a, b) => bigCompare(a, b) > 0;
export const bigLte = (a, b) => bigCompare(a, b) <= 0;
export const bigLt = (a, b) => bigCompare(a, b) < 0;
export const bigEq = (a, b) => bigCompare(a, b) === 0;

function exactSafeInteger(value) {
  if (value.exponent < 0 || value.exponent > 15) return null;
  const integer = Math.round(bigToNumber(value));
  if (!Number.isSafeInteger(integer)) return null;
  const canonical = bigFromNumber(integer);
  return canonical.mantissa === value.mantissa && canonical.exponent === value.exponent ? integer : null;
}

export function bigAdd(a, b) {
  const x = toBig(a); const y = toBig(b);
  if (x.mantissa === 0) return bigClone(y);
  if (y.mantissa === 0) return bigClone(x);
  // 正確に表せる整数同士は整数で加算し、購入のたびに仮数へ誤差が蓄積するのを防ぐ。
  const ix = exactSafeInteger(x); const iy = exactSafeInteger(y);
  if (ix !== null && iy !== null && Number.isSafeInteger(ix + iy)) return bigFromNumber(ix + iy);
  const [big_, small] = x.exponent >= y.exponent ? [x, y] : [y, x];
  const diff = big_.exponent - small.exponent;
  if (diff > 15) return bigClone(big_); // smaller term is below double precision
  return bigNormalize(big_.mantissa + small.mantissa / 10 ** diff, big_.exponent);
}

export function bigSub(a, b) {
  const y = toBig(b);
  return bigAdd(a, { mantissa: -y.mantissa, exponent: y.exponent });
}

export function bigMul(a, b) {
  const x = toBig(a); const y = toBig(b);
  if (x.mantissa === 0 || y.mantissa === 0) return bigZero();
  return bigNormalize(x.mantissa * y.mantissa, x.exponent + y.exponent);
}

export function bigDiv(a, b) {
  const x = toBig(a); const y = toBig(b);
  if (y.mantissa === 0) throw new TypeError('bigDiv: division by zero');
  if (x.mantissa === 0) return bigZero();
  return bigNormalize(x.mantissa / y.mantissa, x.exponent - y.exponent);
}

/** Multiply a BigNum by a plain finite number (may exceed 1e308 via BigNum side). */
export function bigMulNumber(a, scalar) {
  if (scalar === 0) return bigZero();
  if (!Number.isFinite(scalar)) throw new TypeError('bigMulNumber: non-finite scalar');
  // Route extreme scalars through log space so precision survives.
  if (Math.abs(scalar) >= 1e15 || Math.abs(scalar) < 1e-15) {
    const x = toBig(a);
    if (x.mantissa === 0) return bigZero();
    const result = bigFromLog10(bigLog10(x) + Math.log10(Math.abs(scalar)));
    if (scalar < 0) result.mantissa = -result.mantissa;
    return result;
  }
  const x = toBig(a);
  return bigNormalize(x.mantissa * scalar, x.exponent);
}

/** Raise a BigNum to a plain-number power: a^p, computed in log space. */
export function bigPow(a, p) {
  const x = toBig(a);
  if (x.mantissa === 0) return bigZero();
  if (p === 0) return bigOne();
  return bigFromLog10(bigLog10(x) * p);
}

/** Best-effort plain number (Infinity if the value overflows a double). */
export function bigToNumber(b) {
  const x = toBig(b);
  return x.mantissa * 10 ** x.exponent;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const SMALL_SUFFIXES = ['', 'K', 'M', 'B', 'T'];

/** Two-letter suffix for suffix-group >= 5: 5->aa, 6->ab, ..., 30->az, 31->ba */
function aaSuffix(group) {
  const idx = group - SMALL_SUFFIXES.length;
  const first = Math.floor(idx / 26);
  const second = idx % 26;
  if (first > 25) return null; // out of aa..zz range -> caller uses exponential
  return String.fromCharCode(97 + first, 97 + second);
}

/**
 * formatNumber(value, decimals = 2)
 *   value: number | BigNum
 *   < 1,000            -> plain ("0", "42", "999.5")
 *   1e3 .. 1e12        -> K / M / B / T  ("1.50K")
 *   1e15 ..            -> aa / ab / ...  ("1.00aa", "2.50ab")
 *   exponent >= 1000 or suffix range exhausted -> exponential ("1.23e4567")
 */
export function formatNumber(value, decimals = 2) {
  let x;
  try { x = toBig(value); } catch { return String(value); }
  if (x.mantissa === 0) return '0';
  const sign = x.mantissa < 0 ? '-' : '';
  const abs = { mantissa: Math.abs(x.mantissa), exponent: x.exponent };
  const log10 = bigLog10(abs);

  if (log10 < 3) {
    const n = bigToNumber(abs);
    const s = Number.isInteger(n) ? String(n) : n.toFixed(Math.min(decimals, 2)).replace(/\.?0+$/, '');
    return sign + s;
  }
  if (abs.exponent >= 1000) {
    // Mantissa is normalized to [1,10), so exponent is already exact.
    return `${sign}${abs.mantissa.toFixed(decimals)}e${abs.exponent}`;
  }
  const group = Math.floor(log10 / 3);
  const suffix = group < SMALL_SUFFIXES.length ? SMALL_SUFFIXES[group] : aaSuffix(group);
  if (suffix === null) return `${sign}${abs.mantissa.toFixed(decimals)}e${abs.exponent}`;
  const scaledMantissa = abs.mantissa * 10 ** (abs.exponent - group * 3);
  return `${sign}${scaledMantissa.toFixed(decimals)}${suffix}`;
}
export const formatBig = formatNumber;

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

function emptyDimension(tier) {
  return { amount: bigZero(), bought: 0, tier };
}

/**
 * createNewGame(now = Date.now()) -> GameState
 * Plain object; safe to JSON.stringify / structuredClone.
 */
export function createNewGame(now = Date.now()) {
  return {
    version: VERSION,
    antimatter: bigFromNumber(10),
    dimensions: Array.from({ length: 8 }, (_, i) => emptyDimension(i + 1)),
    tickspeed: 1,          // derived cache: (1.1245 + 0.02*galaxies)^tickspeedBought
    tickspeedBought: 0,
    dimensionalBoosts: 0,
    galaxies: 0,
    sacrificeBoost: bigOne(), // multiplier applied to the 8th dimension only
    sacrificeTotalFirst: bigZero(), // cumulative 1st-dim amount ever sacrificed
    achievements: [],
    infinityPoints: bigZero(),
    infinities: 0,
    autobuyers: createAutobuyers(),
    infinityUpgrades: [],
    runStartedAt: now,
    bestInfinityMs: null, // 最速の周回時間（Big Crunch したことがなければ null）
    ipGenElapsedMs: 0,
    totalAntimatter: bigZero(), // lifetime, never reset by boosts/galaxies
    lastTick: now,
    createdAt: now,
  };
}

// ---------------------------------------------------------------------------
// Derived values / costs
// ---------------------------------------------------------------------------

function checkTier(tier) {
  if (!Number.isInteger(tier) || tier < 1 || tier > 8) {
    throw new RangeError(`tier must be an integer 1..8, got ${tier}`);
  }
}

export function getDimensionCost(state, tier) {
  checkTier(tier);
  const dim = state.dimensions[tier - 1];
  const block = Math.floor(dim.bought / 10);
  return bigFromLog10(INITIAL_COST_LOG10[tier - 1] + COST_MULT_LOG10_PER10[tier - 1] * block);
}

export function getDimensionCostForBulk(state, tier, count) {
  // Cost of `count` purchases starting from current bought. The unit cost is
  // constant inside each 10-purchase block and jumps at block boundaries, so
  // sum block-by-block (loop is exact at the small counts callers walk).
  checkTier(tier);
  let total = bigZero();
  const dim = state.dimensions[tier - 1];
  for (let i = 0; i < count; i++) {
    const block = Math.floor((dim.bought + i) / 10);
    total = bigAdd(total, bigFromLog10(INITIAL_COST_LOG10[tier - 1] + COST_MULT_LOG10_PER10[tier - 1] * block));
  }
  return total;
}

export function getTickspeedCost(state) {
  return bigFromLog10(TICKSPEED_INITIAL_COST_LOG10 + TICKSPEED_COST_LOG_INCREMENT * state.tickspeedBought);
}

export function hasInfinityUpgrade(state, id) {
  return Array.isArray(state.infinityUpgrades) && state.infinityUpgrades.includes(id);
}

/** Per-purchase tickspeed effect: 1.1245 + 0.02 per galaxy (spec §3). */
export function getTickspeedPerPurchase(state) {
  const factor = hasInfinityUpgrade(state, 'galaxyBoost') ? INFINITY_UPGRADE_PARAMS.galaxyBoostFactor : 1;
  return TICKSPEED_BASE_PER_PURCHASE + TICKSPEED_GALAXY_BONUS * factor * (state.galaxies || 0);
}

/**
 * Effective tickspeed multiplier (spec §3):
 *   (1.1245 + 0.02 * galaxies) ^ tickspeedBought
 * This is a pure derived value; `state.tickspeed` is kept in sync with it
 * for backward compatibility but is never the source of truth.
 */
export function getEffectiveTickspeed(state) {
  return getTickspeedPerPurchase(state) ** (state.tickspeedBought || 0);
}

/** log10 of the effective tickspeed; stays finite where the plain number overflows. */
export function getEffectiveTickspeedLog10(state) {
  return Math.log10(getTickspeedPerPurchase(state)) * (state.tickspeedBought || 0);
}

/** Effective tickspeed as a BigNum. Use this for any calculation. */
export function getEffectiveTickspeedBig(state) {
  return bigFromLog10(getEffectiveTickspeedLog10(state));
}

/** Re-sync the legacy `state.tickspeed` cache with the derived value. */
function syncTickspeed(state) {
  // Infinity は JSON で null になりセーブが壊れるため、キャッシュは有限値に丸める
  state.tickspeed = Math.min(getEffectiveTickspeed(state), Number.MAX_VALUE);
  return state.tickspeed;
}

/**
 * Highest purchasable tier (spec §2.3/§4): tiers 1-4 are unlocked from the
 * start; each of the first 4 boosts/shifts unlocks one more tier.
 * After a galaxy reset boosts return to 0, so this returns to 4.
 */
export function getMaxUnlockedTier(state) {
  const boosts = Math.max(0, Math.trunc(state.dimensionalBoosts || 0));
  return Math.min(8, 4 + Math.min(boosts, 4));
}

function log10Min(ms, divMin, exp) {
  const minutes = Math.max(0, ms) / 60000;
  return minutes > divMin ? exp * Math.log10(minutes / divMin) : 0;
}

/** Infinity 強化の倍率（log10）。tier を渡すと、その次元にだけ効くものも含める。 */
function getUpgradeMultiplierLog10(state, tier) {
  const p = INFINITY_UPGRADE_PARAMS;
  let log = 0;
  if (hasInfinityUpgrade(state, 'totalTime')) {
    log += log10Min(state.lastTick - state.createdAt, p.totalTimeDivMin, p.totalTimeExp);
  }
  if (hasInfinityUpgrade(state, 'runTime')) {
    log += log10Min(state.lastTick - (state.runStartedAt ?? state.createdAt), p.runTimeDivMin, p.runTimeExp);
  }
  for (const [id, tiers] of Object.entries(INFINITY_UPGRADE_PAIRS)) {
    if (tiers.includes(tier) && hasInfinityUpgrade(state, id)) log += getInfinityCountMultiplierLog10(state);
  }
  if (tier === 1 && hasInfinityUpgrade(state, 'unspentIp')) log += getUnspentIpMultiplierLog10(state);
  return log;
}

function getInfinityCountMultiplierLog10(state) {
  return Math.log10(1 + INFINITY_UPGRADE_PARAMS.infinityPerCount * (state.infinities || 0));
}

function getUnspentIpMultiplierLog10(state) {
  const p = INFINITY_UPGRADE_PARAMS;
  return p.unspentIpExp * bigLog10(bigAdd(bigMulNumber(state.infinityPoints, 1 / p.unspentIpDiv), 1));
}

/**
 * A dimension's production multiplier (spec §2.2/§4.1) as a BigNum:
 * - every 10 bought: x2 (x2.2 with buy10)
 * - dimensional boosts fall off by tier:
 *     2^max(dimensionalBoosts - (tier-1), 0) (x2.5 per boost with boostMult)
 * - Infinity upgrades, and the 8th dimension's sacrificeBoost.
 */
export function getDimensionMultiplierBig(state, tier) {
  checkTier(tier);
  const p = INFINITY_UPGRADE_PARAMS;
  const dim = state.dimensions[tier - 1];
  const log = Math.floor(dim.bought / 10) * Math.log10(hasInfinityUpgrade(state, 'buy10') ? p.buy10Mult : p.baseBuy10Mult)
    + Math.max(state.dimensionalBoosts - (tier - 1), 0) * Math.log10(hasInfinityUpgrade(state, 'boostMult') ? p.boostMult : p.baseBoostMult)
    + getUpgradeMultiplierLog10(state, tier);
  const mult = bigFromLog10(log);
  if (tier === 8) return bigMul(mult, state.sacrificeBoost);
  return mult;
}

/** Production per (real) second of a tier, as a BigNum (spec §1.3). */
export function getDimensionProductionPerSecond(state, tier) {
  checkTier(tier);
  const dim = state.dimensions[tier - 1];
  const mult = getDimensionMultiplierBig(state, tier);
  const base = bigMul(bigMul(dim.amount, mult), getEffectiveTickspeedBig(state));
  return bigMulNumber(base, DIMENSION_BASE_RATES[tier - 1]);
}

export function getAntimatterPerSecond(state) {
  return getDimensionProductionPerSecond(state, 1);
}

export const ANTIMATTER_ETA_MAX_SECONDS = 9999 * 86400;

/** 現在の状態を固定した、複数の目標額で共有できる到達時間（秒）の計算。 */
export function createAntimatterEta(state) {
  // totalTime・runTime と ipGen による unspentIp の変化も開始時に固定する。
  // 将来の購入・自動購入・リセットは含めず、実際の状態更新時に作り直す。
  const antimatter = bigClone(state.antimatter);
  const speed = getEffectiveTickspeedBig(state);
  let product = bigOne();
  const coefficients = state.dimensions.map((dim, i) => {
    product = bigMul(product, bigMulNumber(bigMul(getDimensionMultiplierBig(state, i + 1), speed), DIMENSION_BASE_RATES[i] * 0.1));
    return bigMul(dim.amount, product);
  });
  const perSecond = getAntimatterPerSecond(state);
  const linear = coefficients.slice(1).every(c => c.mantissa === 0);
  // (I + A)^n の反物質の成分。A は100ms開始時数量だけを使う更新で、A^9 = 0。
  const gain = (ticks) => {
    let sum = bigZero();
    let choose = 1;
    for (let k = 1; k <= 8 && k <= ticks; k++) {
      choose *= (ticks - k + 1) / k;
      sum = bigAdd(sum, bigMulNumber(coefficients[k - 1], choose));
    }
    return sum;
  };
  return (target) => {
    if (bigGte(antimatter, target)) return 0;
    const missing = bigSub(target, antimatter);
    if (linear) {
      // 第一次元だけの場合は、従来の表示と丸め境界までそろえる。
      const seconds = 10 ** (bigLog10(missing) - bigLog10(perSecond));
      return seconds <= ANTIMATTER_ETA_MAX_SECONDS ? seconds : Infinity;
    }
    let low = 0;
    let high = ANTIMATTER_ETA_MAX_SECONDS * 10;
    if (!bigGte(gain(high), missing)) return Infinity;
    // 表示範囲内なら最大34回。隣接する刻みの間は直線で補間するため、
    // 固定係数の100ms反復で最初に到達する時刻との差は最大0.1秒（数値丸めを除く）。
    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2);
      if (bigGte(gain(mid), missing)) high = mid;
      else low = mid;
    }
    const before = gain(low);
    const fraction = bigToNumber(bigDiv(bigSub(missing, before), bigSub(gain(high), before)));
    return (low + Math.max(0, Math.min(1, fraction))) / 10;
  };
}

/**
 * Next boost/shift requirement (spec §4.1/§4.2). `boosts` = boosts already owned:
 * - boosts < 4 (Dimension Shift): 20 of tier (boosts + 4) — unlocks the next tier
 * - boosts >= 4 (Dimension Boost): 20 + 15 * (boosts - 3) of tier 8
 *   (boosts=4 -> 35, 5 -> 50, ..., 9 -> 110, ...)
 */
function reduceRequirement(state, amount) {
  const reduction = hasInfinityUpgrade(state, 'resetReq') ? INFINITY_UPGRADE_PARAMS.resetReduction : 0;
  return Math.max(1, amount - reduction);
}

export function getDimensionalBoostRequirement(state) {
  const boosts = Math.max(0, Math.trunc(state.dimensionalBoosts || 0));
  if (boosts < 4) return { tier: boosts + 4, amount: reduceRequirement(state, 20) };
  return { tier: 8, amount: reduceRequirement(state, 20 + 15 * (boosts - 3)) };
}

export function getGalaxyRequirement(state) {
  return { tier: 8, amount: reduceRequirement(state, 80 + state.galaxies * 60) };
}

export function canDimensionalBoost(state) {
  const req = getDimensionalBoostRequirement(state);
  return bigGte(state.dimensions[req.tier - 1].amount, req.amount);
}

export function canAntimatterGalaxy(state) {
  const req = getGalaxyRequirement(state);
  return bigGte(state.dimensions[7].amount, req.amount);
}

export function getInfinityGain(state) {
  const log10 = bigLog10(state.antimatter);
  if (!(log10 >= INFINITY_THRESHOLD_LOG10)) return 0;
  return Math.max(1, Math.floor(log10 / INFINITY_IP_STEP_LOG10));
}
export const canInfinity = (state) => getInfinityGain(state) > 0;

// ---------------------------------------------------------------------------
// Achievements (ids only; UI maps ids -> name/description/icon)
// ---------------------------------------------------------------------------

function unlock(state, id) {
  if (!state.achievements.includes(id)) state.achievements.push(id);
}

export function checkAchievements(state) {
  if (state.dimensions.some((d) => d.bought > 0)) unlock(state, 'first-dimension');
  if (state.dimensions[7].bought > 0) unlock(state, 'eighth-dimension');
  if (bigLog10(state.antimatter) >= 100) unlock(state, 'antimatter-1e100');
  if (state.dimensionalBoosts > 0) unlock(state, 'first-boost');
  if (state.galaxies > 0) unlock(state, 'first-galaxy');
  if (bigGt(state.sacrificeBoost, 1)) unlock(state, 'first-sacrifice');
  if (state.infinities > 0) unlock(state, 'first-infinity');
  return state.achievements;
}

// ---------------------------------------------------------------------------
// Core loop
// ---------------------------------------------------------------------------

/**
 * tick(state, dtMs) -> state (mutated)
 * Production chain, using a snapshot of amounts at tick start so a single
 * tick never double-counts production created inside the same tick:
 *   8th -> 7th -> ... -> 2nd -> 1st -> antimatter
 * Per-second production of a tier (spec §1.3):
 *   amount * dimensionMultiplier * effectiveTickspeed * baseRate
 * with baseRate = 1.0 for tier 1 and 0.1 for tiers 2-8. tick() integrates
 * that rate over dtMs/1000 real seconds.
 */
export function tick(state, dtMs) {
  if (!(dtMs > 0)) return state;
  syncTickspeed(state);
  const dtSec = dtMs / 1000;
  const tickspeedMult = getEffectiveTickspeedBig(state);
  const snapshot = state.dimensions.map((d) => bigClone(d.amount));

  const produced = snapshot.map((amount, i) => {
    const mult = getDimensionMultiplierBig(state, i + 1);
    const scalar = DIMENSION_BASE_RATES[i] * dtSec;
    return bigMulNumber(bigMul(bigMul(amount, mult), tickspeedMult), scalar);
  });

  for (let i = 7; i >= 1; i--) {
    state.dimensions[i - 1].amount = bigAdd(state.dimensions[i - 1].amount, produced[i]);
  }
  state.antimatter = bigAdd(state.antimatter, produced[0]);
  state.totalAntimatter = bigAdd(state.totalAntimatter, produced[0]);
  state.lastTick += dtMs;
  runIpGeneration(state, dtMs);
  checkAchievements(state);
  return state;
}

export function getIpGenerationInterval(state) {
  const p = INFINITY_UPGRADE_PARAMS;
  if (!Number.isFinite(state.bestInfinityMs)) return null;
  return Math.max(p.ipGenMinIntervalMs, state.bestInfinityMs * p.ipGenFactor);
}

function runIpGeneration(state, dtMs) {
  const interval = hasInfinityUpgrade(state, 'ipGen') ? getIpGenerationInterval(state) : null;
  if (interval === null) return;
  state.ipGenElapsedMs += dtMs;
  const count = Math.floor(state.ipGenElapsedMs / interval);
  if (count < 1) return;
  state.ipGenElapsedMs -= count * interval;
  state.infinityPoints = bigAdd(state.infinityPoints, count);
}

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------

export function buyDimension(state, tier) {
  checkTier(tier);
  // Locked tiers (spec §2.3) refuse the purchase quietly — no exception.
  if (tier > getMaxUnlockedTier(state)) return false;
  const cost = getDimensionCost(state, tier);
  if (bigLt(state.antimatter, cost)) return false;
  state.antimatter = bigSub(state.antimatter, cost);
  const dim = state.dimensions[tier - 1];
  dim.amount = bigAdd(dim.amount, 1);
  dim.bought += 1;
  // 第8次元は生産・Sacrificeで増減しないため、購入回数で旧セーブの加算誤差を補える。
  if (tier === 8 && Number.isSafeInteger(dim.bought) && bigLt(dim.amount, dim.bought)) {
    dim.amount = bigFromNumber(dim.bought);
  }
  checkAchievements(state);
  return true;
}

/** Buy one dimension as many times as affordable. Returns count bought. */
export function buyMaxDimension(state, tier, maxIterations = 100_000) {
  checkTier(tier);
  let count = 0;
  while (count < maxIterations && buyDimension(state, tier)) count++;
  return count;
}

/**
 * buyMax(state) -> { dimensions: number[8], tickspeed: number }
 * Buys tickspeed, then dimensions from highest tier to lowest (higher tiers
 * raise the production chain fastest), repeating until nothing is affordable.
 */
export function buyMax(state) {
  const boughtDims = Array(8).fill(0);
  let boughtTickspeed = 0;
  let progressed = true;
  let guard = 0;
  while (progressed && guard++ < 1000) {
    progressed = false;
    while (buyTickspeed(state)) { boughtTickspeed++; progressed = true; }
    for (let tier = 8; tier >= 1; tier--) {
      const n = buyMaxDimension(state, tier);
      if (n > 0) { boughtDims[tier - 1] += n; progressed = true; }
    }
  }
  return { dimensions: boughtDims, tickspeed: boughtTickspeed };
}

export function buyTickspeed(state) {
  const cost = getTickspeedCost(state);
  if (bigLt(state.antimatter, cost)) return false;
  state.antimatter = bigSub(state.antimatter, cost);
  state.tickspeedBought += 1;
  syncTickspeed(state); // tickspeed is derived: (1.1245 + 0.02*galaxies)^bought
  return true;
}

export function buyMaxTickspeed(state, maxIterations = 100_000) {
  let count = 0;
  while (count < maxIterations && buyTickspeed(state)) count++;
  return count;
}

// ---------------------------------------------------------------------------
// Resets / prestige layers
// ---------------------------------------------------------------------------

/** 持っている中で一番上の「開始時の Boost・Galaxy」だけが効く。 */
export function getStartingState(state) {
  const p = INFINITY_UPGRADE_PARAMS;
  let boosts = 0;
  for (const [id, n] of Object.entries(p.startBoosts)) if (hasInfinityUpgrade(state, id)) boosts = Math.max(boosts, n);
  return { boosts, galaxies: hasInfinityUpgrade(state, 'startGalaxy') ? p.startGalaxies : 0 };
}

function softReset(state, { keepBoosts = true, keepGalaxies = true, keepSacrifice = false } = {}) {
  state.antimatter = bigFromNumber(10);
  state.dimensions = Array.from({ length: 8 }, (_, i) => emptyDimension(i + 1));
  state.tickspeedBought = 0;
  if (!keepSacrifice) {
    state.sacrificeBoost = bigOne();
    state.sacrificeTotalFirst = bigZero();
  }
  const start = getStartingState(state);
  if (!keepBoosts) state.dimensionalBoosts = start.boosts;
  if (!keepGalaxies) state.galaxies = start.galaxies;
  syncTickspeed(state);
}

/**
 * dimensionalBoost(state) -> boolean
 * Requirement comes from getDimensionalBoostRequirement: the first 4 boosts
 * are Dimension Shifts (20 of the highest unlocked tier, unlocking the next
 * tier); later boosts need a growing amount of the 8th dimension.
 * Resets antimatter, dimensions and tickspeed purchases; boosts +1.
 * The sacrifice boost/total are KEPT (spec §4.3 MVP decision) — they are
 * only reset by a galaxy or a Big Crunch.
 */
export function dimensionalBoost(state) {
  if (!canDimensionalBoost(state)) return false;
  state.dimensionalBoosts += 1;
  softReset(state, { keepBoosts: true, keepGalaxies: true, keepSacrifice: true });
  checkAchievements(state);
  return true;
}

/**
 * antimatterGalaxy(state) -> boolean
 * Requires 8th-dimension amount >= 80 + 60 * current galaxies.
 * Resets antimatter, dimensions, tickspeed purchases, dimensional boosts
 * (so unlocked tiers fall back to 1-4) and sacrifice; galaxies +1 (galaxies
 * strengthen tickspeed — see getEffectiveTickspeed).
 */
export function antimatterGalaxy(state) {
  if (!canAntimatterGalaxy(state)) return false;
  state.galaxies += 1;
  softReset(state, { keepBoosts: false, keepGalaxies: true, keepSacrifice: false });
  checkAchievements(state);
  return true;
}

/**
 * Candidate sacrifice multiplier for a sacrifice performed right now
 * (spec §6.2): with n = cumulative sacrificed 1st-dimension amount
 * (previous total + the 1st dimensions currently held),
 *   candidate = max(log10(n) / 10, 1) ^ 2
 * Computed in log space: log10(candidate) = 2 * (log10(log10(n)) - 1).
 */
export function getSacrificeCandidate(state) {
  const total = bigAdd(state.sacrificeTotalFirst ?? bigZero(), state.dimensions[0].amount);
  const logN = bigLog10(total);
  if (!Number.isFinite(logN) || logN <= 10) return bigOne();
  return bigFromLog10(2 * (Math.log10(logN) - 1));
}

/**
 * canSacrifice(state) -> boolean
 * Sacrifice unlocks after 5 total dimensional boosts (spec §6.1). It also
 * needs an 8th dimension (otherwise production never restarts) and a
 * candidate at least SACRIFICE_MIN_GAIN times the current sacrificeBoost.
 */
export function canSacrifice(state) {
  if ((state.dimensionalBoosts || 0) < 5) return false;
  if (!bigGt(state.dimensions[7].amount, bigZero())) return false;
  const needed = bigMulNumber(state.sacrificeBoost, SACRIFICE_MIN_GAIN);
  return bigGte(getSacrificeCandidate(state), needed);
}

/**
 * rescueIfStuck(state) -> boolean
 * 全次元が 0 で、解放済みのどの次元も買えない詰み状態のとき、第8次元を
 * 1つ（amount のみ。bought は値段と倍率のため据え置き）渡す。
 */
export function rescueIfStuck(state) {
  if (state.dimensions.some((d) => bigGt(d.amount, bigZero()))) return false;
  const maxTier = getMaxUnlockedTier(state);
  for (let tier = 1; tier <= maxTier; tier++) {
    if (bigGte(state.antimatter, getDimensionCost(state, tier))) return false;
  }
  const dim = state.dimensions[7];
  dim.amount = bigAdd(dim.amount, 1);
  return true;
}

/**
 * sacrifice(state) -> boolean
 * Sacrifices dimensions 1-7 (amounts -> 0, bought kept) to raise the
 * 8th dimension's multiplier to the candidate from getSacrificeCandidate.
 * Only applies if the candidate strictly exceeds the current sacrificeBoost;
 * on success the current 1st-dimension amount is folded into
 * sacrificeTotalFirst (the cumulative total the formula is based on).
 */
export function sacrifice(state) {
  if (!canSacrifice(state)) return false;
  const candidate = getSacrificeCandidate(state);
  state.sacrificeTotalFirst = bigAdd(state.sacrificeTotalFirst ?? bigZero(), state.dimensions[0].amount);
  for (let i = 0; i <= 6; i++) state.dimensions[i].amount = bigZero();
  state.sacrificeBoost = candidate;
  checkAchievements(state);
  return true;
}

/**
 * prestigeInfinity(state) -> number (IP gained, 0 if not eligible)
 * Requires antimatter >= 1.79e308. Resets antimatter, dimensions, tickspeed,
 * sacrifice, boosts and galaxies; keeps achievements / infinities / IP.
 * IP gain is getInfinityGain (floor(log10(antimatter) / 308.25), min 1).
 */
export function prestigeInfinity(state) {
  const gain = getInfinityGain(state);
  if (gain === 0) return 0;
  state.infinityPoints = bigAdd(state.infinityPoints, gain);
  state.infinities += 1;
  const runMs = Math.max(0, state.lastTick - (state.runStartedAt ?? state.createdAt));
  state.bestInfinityMs = Number.isFinite(state.bestInfinityMs) ? Math.min(state.bestInfinityMs, runMs) : runMs;
  state.runStartedAt = state.lastTick;
  softReset(state, { keepBoosts: false, keepGalaxies: false, keepSacrifice: false });
  checkAchievements(state);
  return gain;
}

// ---------------------------------------------------------------------------
// Infinity upgrades
// ---------------------------------------------------------------------------

function spendIp(state, cost) {
  if (bigLt(state.infinityPoints, cost)) return false;
  state.infinityPoints = bigSub(state.infinityPoints, cost);
  return true;
}

/** 列の1つ上の段を持っている（または1段目）なら買える段。 */
export function isInfinityUpgradeAvailable(state, id) {
  const def = INFINITY_UPGRADES.find((u) => u.id === id);
  if (!def) return false;
  if (def.row === 1) return true;
  const above = INFINITY_UPGRADES.find((u) => u.column === def.column && u.row === def.row - 1);
  return hasInfinityUpgrade(state, above.id);
}

export function canBuyInfinityUpgrade(state, id) {
  const def = INFINITY_UPGRADES.find((u) => u.id === id);
  return state.infinities > 0 && !!def && !hasInfinityUpgrade(state, id) && isInfinityUpgradeAvailable(state, id)
    && bigGte(state.infinityPoints, def.cost);
}

export function buyInfinityUpgrade(state, id) {
  if (!canBuyInfinityUpgrade(state, id)) return false;
  spendIp(state, INFINITY_UPGRADES.find((u) => u.id === id).cost);
  state.infinityUpgrades.push(id);
  return true;
}

/**
 * 強化の効果の値（買う前でも、買ったときの値を返す）。
 * kind: mult は BigNum の倍率、reduce は必要数の減少、ms は間隔、
 * start は開始時の Boost と Galaxy。
 */
export function getInfinityUpgradeEffect(state, id) {
  const p = INFINITY_UPGRADE_PARAMS;
  switch (id) {
    case 'totalTime':
      return { kind: 'mult', value: bigFromLog10(log10Min(state.lastTick - state.createdAt, p.totalTimeDivMin, p.totalTimeExp)) };
    case 'runTime':
      return { kind: 'mult', value: bigFromLog10(log10Min(state.lastTick - (state.runStartedAt ?? state.createdAt), p.runTimeDivMin, p.runTimeExp)) };
    case 'dims18': case 'dims27': case 'dims36': case 'dims45':
      return { kind: 'mult', value: bigFromLog10(getInfinityCountMultiplierLog10(state)) };
    case 'unspentIp':
      return { kind: 'mult', value: bigFromLog10(getUnspentIpMultiplierLog10(state)) };
    case 'buy10': return { kind: 'mult', value: bigFromNumber(p.buy10Mult) };
    case 'boostMult': return { kind: 'mult', value: bigFromNumber(p.boostMult) };
    case 'galaxyBoost': return { kind: 'mult', value: bigFromNumber(p.galaxyBoostFactor) };
    case 'resetReq': return { kind: 'reduce', value: p.resetReduction };
    case 'ipGen': return { kind: 'ms', value: getIpGenerationInterval(state) ?? p.ipGenMinIntervalMs };
    case 'startGalaxy': return { kind: 'start', boosts: p.startBoosts[id], galaxies: p.startGalaxies };
    default: return { kind: 'start', boosts: p.startBoosts[id] ?? 0, galaxies: 0 };
  }
}

// ---------------------------------------------------------------------------
// Autobuyers
// ---------------------------------------------------------------------------

function emptyAutobuyer() {
  return { unlocked: false, enabled: false, level: 0, elapsedMs: 0 };
}

export function createAutobuyers() {
  return Object.fromEntries(AUTOBUYER_IDS.map((id) => [id, emptyAutobuyer()]));
}

export function getAutobuyerInterval(level) {
  const l = Math.min(AUTOBUYER_MAX_LEVEL, Math.max(0, Math.trunc(level) || 0));
  return Math.max(AUTOBUYER_MIN_INTERVAL_MS, AUTOBUYER_BASE_INTERVAL_MS * AUTOBUYER_INTERVAL_FACTOR ** l);
}

/** 次の短縮の IP 費用（今の段階 + 1）。最短なら null。 */
export function getAutobuyerUpgradeCost(state, id) {
  const level = state.autobuyers[id].level;
  return level >= AUTOBUYER_MAX_LEVEL ? null : level + 1;
}

export function unlockAutobuyer(state, id) {
  if (!(state.infinities > 0)) return false;
  const ab = state.autobuyers[id];
  if (!ab || ab.unlocked || !spendIp(state, AUTOBUYER_UNLOCK_COST[id])) return false;
  ab.unlocked = true;
  ab.enabled = true;
  ab.elapsedMs = 0;
  return true;
}

export function setAutobuyerEnabled(state, id, enabled) {
  if (!(state.infinities > 0)) return false;
  const ab = state.autobuyers[id];
  if (!ab || !ab.unlocked) return false;
  ab.enabled = !!enabled;
  return true;
}

export function upgradeAutobuyerInterval(state, id) {
  if (!(state.infinities > 0)) return false;
  const ab = state.autobuyers[id];
  if (!ab || !ab.unlocked) return false;
  const cost = getAutobuyerUpgradeCost(state, id);
  if (cost === null || !spendIp(state, cost)) return false;
  ab.level += 1;
  return true;
}

function buyTiers(state, tiers) {
  const max = getMaxUnlockedTier(state);
  for (const tier of tiers) if (tier <= max) buyMaxDimension(state, tier);
}

const AUTOBUYER_ACTIONS = {
  crunch: (state) => { prestigeInfinity(state); },
  galaxy: (state) => { antimatterGalaxy(state); },
  boost: (state) => { dimensionalBoost(state); },
  highDims: (state) => buyTiers(state, [8, 7, 6, 5]),
  lowDims: (state) => buyTiers(state, [4, 3, 2, 1]),
  tickspeed: (state) => { buyMaxTickspeed(state); },
};

/** 経過時間を足し、間隔を超えた自動購入を1回ずつ動かす。長い dt でも1回だけ。 */
export function runAutobuyers(state, dtMs) {
  if (!(dtMs > 0)) return;
  for (const id of AUTOBUYER_RUN_ORDER) {
    const ab = state.autobuyers[id];
    if (!ab.unlocked || !ab.enabled) continue;
    const interval = getAutobuyerInterval(ab.level);
    ab.elapsedMs += dtMs;
    if (ab.elapsedMs < interval) continue;
    ab.elapsedMs %= interval;
    AUTOBUYER_ACTIONS[id](state);
  }
}

// ---------------------------------------------------------------------------
// Offline progress
// ---------------------------------------------------------------------------

/**
 * offlineProgress(state, now = Date.now()) ->
 *   { elapsedMs, simulatedMs, antimatterBefore, antimatterAfter, antimatterGained }
 * Elapsed time is capped at OFFLINE_CAP_MS. Simulation runs in adaptive
 * chunks (target <= 1,000 ticks) so a long absence stays cheap and stable.
 */
export function offlineProgress(state, now = Date.now()) {
  const before = bigClone(state.antimatter);
  const rawElapsed = Math.max(0, now - (state.lastTick || now));
  const simulatedMs = Math.min(rawElapsed, OFFLINE_CAP_MS);
  if (simulatedMs > 0) {
    const chunks = Math.min(1000, Math.max(1, Math.ceil(simulatedMs / 50)));
    const chunkMs = simulatedMs / chunks;
    for (let i = 0; i < chunks; i++) {
      tick(state, chunkMs);
      runAutobuyers(state, chunkMs);
    }
  }
  state.lastTick = now;
  return {
    elapsedMs: rawElapsed,
    simulatedMs,
    antimatterBefore: before,
    antimatterAfter: bigClone(state.antimatter),
    antimatterGained: bigSub(state.antimatter, before),
  };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export function serialize(state) {
  return JSON.stringify(state);
}

function sanitizeBig(value, fallback) {
  try { return toBig(value); } catch { return bigClone(fallback); }
}
const sanitizeInt = (v, fallback = 0) =>
  Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : fallback;

function sanitizeAutobuyers(raw) {
  const result = createAutobuyers();
  if (!raw || typeof raw !== 'object') return result;
  for (const id of AUTOBUYER_IDS) {
    const r = raw[id];
    if (!r || typeof r !== 'object' || r.unlocked !== true) continue;
    const level = Math.min(AUTOBUYER_MAX_LEVEL, sanitizeInt(r.level));
    const elapsed = Number(r.elapsedMs);
    result[id] = {
      unlocked: true,
      enabled: r.enabled !== false,
      level,
      elapsedMs: Number.isFinite(elapsed) && elapsed > 0 ? Math.min(elapsed, getAutobuyerInterval(level)) : 0,
    };
  }
  return result;
}

function sanitizeInfinityUpgrades(raw) {
  const owned = Array.isArray(raw) ? new Set(raw.filter((id) => typeof id === 'string')) : new Set();
  const result = [];
  for (let column = 1; column <= 4; column++) {
    for (const def of INFINITY_UPGRADES.filter((u) => u.column === column).sort((a, b) => a.row - b.row)) {
      if (!owned.has(def.id)) break;
      result.push(def.id);
    }
  }
  return result;
}

/**
 * deserialize(jsonOrObject) -> GameState
 * Accepts a JSON string or an already-parsed object. Missing / invalid
 * fields fall back to new-game defaults (forward/backward compatible).
 * Throws SyntaxError only when a string argument is not valid JSON.
 */
export function deserialize(input, now = Date.now()) {
  const raw = typeof input === 'string' ? JSON.parse(input) : input;
  if (!raw || typeof raw !== 'object') throw new TypeError('deserialize: expected object or JSON string');
  const state = createNewGame(now);
  state.version = sanitizeInt(raw.version, VERSION);
  state.antimatter = sanitizeBig(raw.antimatter, state.antimatter);
  if (Array.isArray(raw.dimensions)) {
    for (let i = 0; i < 8; i++) {
      const d = raw.dimensions[i];
      if (!d) continue;
      state.dimensions[i] = {
        amount: sanitizeBig(d.amount, bigZero()),
        bought: sanitizeInt(d.bought),
        tier: i + 1,
      };
    }
  }
  state.tickspeedBought = sanitizeInt(raw.tickspeedBought);
  state.dimensionalBoosts = sanitizeInt(raw.dimensionalBoosts);
  state.galaxies = sanitizeInt(raw.galaxies);
  // tickspeed is a derived value — recompute it from bought/galaxies and
  // ignore any stored cache (old saves may hold the legacy 1.11-based value).
  state.tickspeed = getEffectiveTickspeed(state);
  state.sacrificeBoost = sanitizeBig(raw.sacrificeBoost, bigOne());
  // Old saves predate sacrificeTotalFirst: keep the new-game default (0).
  if (raw.sacrificeTotalFirst !== undefined) {
    state.sacrificeTotalFirst = sanitizeBig(raw.sacrificeTotalFirst, bigZero());
  }
  state.achievements = Array.isArray(raw.achievements) ? raw.achievements.filter((a) => typeof a === 'string') : [];
  state.infinityPoints = sanitizeBig(raw.infinityPoints, bigZero());
  state.infinities = sanitizeInt(raw.infinities);
  state.autobuyers = sanitizeAutobuyers(raw.autobuyers);
  state.totalAntimatter = sanitizeBig(raw.totalAntimatter, bigZero());
  state.lastTick = Number.isFinite(Number(raw.lastTick)) ? Number(raw.lastTick) : now;
  state.createdAt = Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : now;
  state.infinityUpgrades = sanitizeInfinityUpgrades(raw.infinityUpgrades);
  const runStartedAt = raw.runStartedAt === null || raw.runStartedAt === undefined ? NaN : Number(raw.runStartedAt);
  state.runStartedAt = Number.isFinite(runStartedAt) && runStartedAt <= state.lastTick ? runStartedAt : state.createdAt;
  const best = raw.bestInfinityMs === null || raw.bestInfinityMs === undefined ? NaN : Number(raw.bestInfinityMs);
  state.bestInfinityMs = Number.isFinite(best) && best >= 0 ? best : null;
  const genElapsed = Number(raw.ipGenElapsedMs);
  state.ipGenElapsedMs = Number.isFinite(genElapsed) && genElapsed > 0 ? genElapsed : 0;
  return state;
}

export default {
  createNewGame, tick, buyDimension, buyMaxDimension, buyMax,
  buyTickspeed, buyMaxTickspeed, dimensionalBoost, antimatterGalaxy,
  sacrifice, prestigeInfinity, offlineProgress, serialize, deserialize,
  formatNumber, getDimensionCost, getDimensionCostForBulk, getTickspeedCost,
  getEffectiveTickspeed, getEffectiveTickspeedBig, getEffectiveTickspeedLog10, getTickspeedPerPurchase,
  rescueIfStuck, getMaxUnlockedTier,
  runAutobuyers, createAutobuyers, unlockAutobuyer, setAutobuyerEnabled,
  upgradeAutobuyerInterval, getAutobuyerInterval, getAutobuyerUpgradeCost,
  getDimensionMultiplierBig, hasInfinityUpgrade, isInfinityUpgradeAvailable, canBuyInfinityUpgrade,
  buyInfinityUpgrade, getInfinityUpgradeEffect, getStartingState, getIpGenerationInterval,
  getDimensionProductionPerSecond, getAntimatterPerSecond,
  getDimensionalBoostRequirement, getGalaxyRequirement,
  canDimensionalBoost, canAntimatterGalaxy, canInfinity, canSacrifice,
  getInfinityGain, getSacrificeCandidate, checkAchievements,
  toBig, bigFromNumber, bigFromLog10, bigAdd, bigSub, bigMul, bigDiv,
  bigPow, bigLog10, bigCompare, bigGte, bigLt, bigClone, bigZero, bigOne,
};
