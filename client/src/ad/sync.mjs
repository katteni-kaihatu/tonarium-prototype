import { bigCompare, deserialize } from './engine.mjs';

export function compareProgress(local, remote) {
  const a = deserialize(local), b = deserialize(remote);
  return Math.sign(a.infinities - b.infinities) || bigCompare(a.totalAntimatter, b.totalAntimatter);
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
    || !Number.isFinite(save.lastTick) || !Number.isFinite(save.createdAt)
    || !Array.isArray(save.achievements) || !save.achievements.every(v => typeof v === 'string')) {
    throw new Error('Invalid AD save');
  }
}
