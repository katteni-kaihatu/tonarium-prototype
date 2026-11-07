import { t, useLanguage } from '../../i18n/index.ts';
import { Icon } from '../Icon.tsx';
import type { AntimatterSlice, InfinityUpgradeDerived } from './types.ts';
import { formatNumber } from './format.ts';
import { s } from './styles.ts';

const NAME_KEYS: Record<InfinityUpgradeDerived['id'], string> = {
  totalTime: 'adIuTotalTime', dims18: 'adIuDims18', dims36: 'adIuDims36', resetReq: 'adIuResetReq',
  buy10: 'adIuBuy10', dims27: 'adIuDims27', dims45: 'adIuDims45', galaxyBoost: 'adIuGalaxyBoost',
  runTime: 'adIuRunTime', unspentIp: 'adIuUnspentIp', boostMult: 'adIuBoostMult', ipGen: 'adIuIpGen',
  startBoost1: 'adIuStartBoost1', startBoost2: 'adIuStartBoost2', startBoost3: 'adIuStartBoost3', startGalaxy: 'adIuStartGalaxy',
};

function intervalText(ms: number): string {
  const minutes = Math.round(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours > 0 ? t('adHours', hours) : '', rest > 0 || hours === 0 ? t('adMinutes', rest) : ''].filter(Boolean).join(' ');
}

function effectText(effect: InfinityUpgradeDerived['effect']): string {
  switch (effect.kind) {
    case 'mult': return `×${formatNumber(effect.value)}`;
    case 'reduce': return `−${effect.value}`;
    case 'ms': return intervalText(effect.value);
    default: return effect.galaxies > 0
      ? `${t('adChipBoost', effect.boosts)} · ${t('adChipGalaxy', effect.galaxies)}`
      : t('adChipBoost', effect.boosts);
  }
}

function UpgradeCard({ ad, item }: { ad: AntimatterSlice; item: InfinityUpgradeDerived }) {
  const locked = !item.owned && !item.available;
  const state = item.owned ? ' is-owned' : locked ? ' is-locked' : item.canBuy ? ' is-affordable' : '';
  return (
    <div className={`adlab-card adlab-iu-card${state}`} data-iu={item.id}>
      <div className="adlab-card-head"><b>{t(NAME_KEYS[item.id])}</b></div>
      <div className="adlab-card-body"><span className="adlab-number adlab-card-value">{effectText(item.effect)}</span></div>
      {item.owned
        ? <div className="adlab-iu-owned"><Icon name="check" size={16} /> {t('adIuOwned')}</div>
        : locked
          ? <div className="adlab-iu-lock" role="img" aria-label={t('adLocked')}><Icon name="lock" size={18} /></div>
          : <button type="button" style={s.btn} disabled={!item.canBuy} onClick={() => ad.buyInfinityUpgrade(item.id)}>{t('adLabText62', item.cost)}</button>}
    </div>
  );
}

export function InfinityUpgradesPanel({ ad }: { ad: AntimatterSlice }) {
  useLanguage();
  const columns = [1, 2, 3, 4].map(column => ad.derived.infinityUpgrades.filter(item => item.column === column));
  return (
    <div className="adlab-iu-grid">
      {columns.map((items, i) => (
        <div key={i} className="adlab-iu-col">
          {items.map(item => <UpgradeCard key={item.id} ad={ad} item={item} />)}
        </div>
      ))}
    </div>
  );
}
