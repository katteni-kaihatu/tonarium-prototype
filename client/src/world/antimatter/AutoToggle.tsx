import { t } from '../../i18n/index.ts';
import { Icon } from '../Icon.tsx';
import type { AntimatterSlice, AutobuyerId } from './types.ts';

const NAMES: Record<AutobuyerId, () => string> = {
  lowDims: () => t('adAutoLow'),
  highDims: () => t('adAutoHigh'),
  tickspeed: () => 'Tickspeed',
  boost: () => 'Dimension Boost',
  galaxy: () => 'Antimatter Galaxy',
  crunch: () => 'Big Crunch',
};

/**
 * 次元タブから自動購入をオン・オフするだけのトグル。解放と間隔の短縮は「無限」タブに任せ、
 * 未解放のときは押せない鍵で解放の場所と費用を伝える。押せる条件は自動化パネルのトグルと同じ。
 */
export function AutoToggle({ ad, id, vertical = false, range }: { ad: AntimatterSlice; id: AutobuyerId; vertical?: boolean; range?: [number, number] }) {
  const item = ad.derived.autobuyers.find(entry => entry.id === id);
  if (!item) return null;
  const name = NAMES[id]();
  const className = `adlab-auto-toggle-mini${vertical ? ' is-vertical' : ''}`;
  const text = range ? <span className="adlab-auto-toggle-text">{t('adUiAutoRange', range[0], range[1])}</span> : null;
  if (!item.unlocked) {
    const hint = t(ad.game.infinities > 0 ? 'adUiAutoLocked' : 'adUiAutoLockedPre', name, item.unlockCost);
    return (
      <button type="button" className={`${className} is-locked`} disabled title={hint} aria-label={hint}>
        <Icon name="lock" size={13} />{text}
      </button>
    );
  }
  const state = t(item.enabled ? 'adAutoOn' : 'adAutoOff');
  return (
    <button
      type="button"
      className={`${className}${item.enabled ? ' is-on' : ''}`}
      role="switch"
      aria-checked={item.enabled}
      aria-label={t('adUiAutoLabel', name)}
      title={t('adUiAutoState', name, state)}
      disabled={!(ad.game.infinities > 0)}
      onClick={() => ad.setAutobuyer(id, !item.enabled)}
    >
      {vertical ? <span className="adlab-auto-knob" aria-hidden="true" /> : <Icon name="repeat" size={14} />}{text}
    </button>
  );
}
