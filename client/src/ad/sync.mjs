import { AUTOBUYER_IDS, AUTOBUYER_MAX_LEVEL, bigCompare, deserialize } from './engine.mjs';

export function saveIdentity(save) {
  const value = typeof save === 'string' ? JSON.parse(save) : save;
  const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
  return JSON.stringify(canonical(value));
}

export function sameSave(a, b) { return saveIdentity(a) === saveIdentity(b); }

export function compareProgress(local, remote) {
  const a = deserialize(local), b = deserialize(remote);
  return Math.sign(a.infinities - b.infinities) || bigCompare(a.totalAntimatter, b.totalAntimatter);
}

function validAutobuyers(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v) && AUTOBUYER_IDS.every(id => {
    const a = v[id];
    return a && typeof a === 'object' && typeof a.unlocked === 'boolean' && typeof a.enabled === 'boolean'
      && Number.isSafeInteger(a.level) && a.level >= 0 && a.level <= AUTOBUYER_MAX_LEVEL
      && Number.isFinite(a.elapsedMs) && a.elapsedMs >= 0;
  });
}

export function validateSave(save) {
  const big = v => v && typeof v === 'object' && Number.isFinite(v.mantissa) && v.mantissa >= 0 && Number.isSafeInteger(v.exponent);
  const count = v => Number.isSafeInteger(v) && v >= 0;
  if (!save || typeof save !== 'object' || Array.isArray(save)
    || !count(save.version) || !big(save.antimatter) || !big(save.totalAntimatter)
    || !big(save.infinityPoints) || !big(save.sacrificeBoost)
    || (save.sacrificeTotalFirst !== undefined && !big(save.sacrificeTotalFirst))
    || !Array.isArray(save.dimensions) || save.dimensions.length !== 8
    || !save.dimensions.every((d, i) => d && d.tier === i + 1 && big(d.amount) && count(d.bought))
    || !['infinities', 'tickspeedBought', 'dimensionalBoosts', 'galaxies'].every(k => count(save[k]))
    || (save.autobuyers !== undefined && !validAutobuyers(save.autobuyers))
    || !Number.isFinite(save.lastTick) || !Number.isFinite(save.createdAt)
    || !Array.isArray(save.achievements) || !save.achievements.every(v => typeof v === 'string')) {
    throw new Error('Invalid AD save');
  }
}
