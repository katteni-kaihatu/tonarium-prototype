import { t, useLanguage } from '../../i18n/index.ts';
import type { AutobuyerDerived, AutobuyerId, AntimatterSlice } from './types.ts';
import { s } from './styles.ts';

const NAMES: Record<AutobuyerId, string> = {
  lowDims: 'adAutoLow',
  highDims: 'adAutoHigh',
  tickspeed: '',
  boost: '',
  galaxy: '',
  crunch: '',
};
const LITERAL_NAMES: Partial<Record<AutobuyerId, string>> = {
  tickspeed: 'Tickspeed',
  boost: 'Dimension Boost',
  galaxy: 'Antimatter Galaxy',
  crunch: 'Big Crunch',
};

function AutobuyerCard({ ad, item }: { ad: AntimatterSlice; item: AutobuyerDerived }) {
  const name = NAMES[item.id] ? t(NAMES[item.id]) : LITERAL_NAMES[item.id];
  const seconds = Number((item.intervalMs / 1000).toFixed(2));
  return (
    <div className={`ad-card ad-auto-card${item.unlocked ? ' is-unlocked' : ''}${item.unlocked && item.enabled ? ' is-on' : ''}`}>
      <div className="ad-card-head"><b>{name}</b></div>
      {item.unlocked ? (
        <>
          <button
            type="button"
            className="ad-auto-toggle"
            style={s.btn}
            role="switch"
            aria-checked={item.enabled}
            onClick={() => ad.setAutobuyer(item.id, !item.enabled)}
          >{t(item.enabled ? 'adAutoOn' : 'adAutoOff')}</button>
          <div className="ad-card-body"><span className="ad-number ad-card-value">{t('adAutoInterval', seconds)}</span></div>
          {item.upgradeCost === null
            ? <button type="button" style={s.btn} disabled>{t('adAutoShortest')}</button>
            : <button type="button" style={s.btn} disabled={!item.canUpgrade} onClick={() => ad.upgradeAutobuyer(item.id)}>{t('adAutoShorten', item.upgradeCost)}</button>}
        </>
      ) : (
        <>
          <div className="ad-card-body" />
          <button type="button" style={s.btn} disabled={!item.canUnlock} onClick={() => ad.unlockAutobuyer(item.id)}>{t('adAutoUnlock', item.unlockCost)}</button>
        </>
      )}
    </div>
  );
}

export function AutomationPanel({ ad }: { ad: AntimatterSlice }) {
  useLanguage();
  return (
    <div className="ad-cards">
      {ad.derived.autobuyers.map(item => <AutobuyerCard key={item.id} ad={ad} item={item} />)}
    </div>
  );
}
