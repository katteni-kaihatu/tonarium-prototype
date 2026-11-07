import { t, useLanguage } from '../../i18n/index.ts';
import { Icon } from '../Icon.tsx';
import type { AntimatterSlice } from './types.ts';
import { formatNumber } from './format.ts';
import { AutomationPanel } from './AutomationPanel.tsx';
import { InfinityUpgradesPanel } from './InfinityUpgradesPanel.tsx';

export function InfinityPanel({ ad }: { ad: AntimatterSlice }) {
  useLanguage();
  const owned = ad.derived.infinityUpgrades.filter(item => item.owned).length;
  return (
    <div className="adlab-infinity">
      <div className="adlab-infinity-head">
        <div className="adlab-auto-ip"><Icon name="infinity" size={16} /><span className="adlab-auto-ip-label">IP</span><span className="adlab-number adlab-card-value">{formatNumber(ad.game.infinityPoints)}</span></div>
        <span className="adlab-infinity-count">{t('adUiInfinityCount', ad.game.infinities)}</span>
      </div>
      <div className="adlab-infinity-columns">
        <section className="adlab-infinity-section">
          <div className="adlab-box-head"><b>{t('adIuSegUpgrades')}</b><span>{t('adIuCount', owned, ad.derived.infinityUpgrades.length)} · {t('adUiIuOrder')}</span></div>
          <InfinityUpgradesPanel ad={ad} />
        </section>
        <section className="adlab-infinity-section">
          <div className="adlab-box-head"><b>{t('adAutoTab')}</b><span>{t('adUiAutoHint')}</span></div>
          <AutomationPanel ad={ad} />
        </section>
      </div>
    </div>
  );
}
