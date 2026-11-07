import { useState } from 'react';
import { t, useLanguage } from '../../i18n/index.ts';
import type { AntimatterSlice } from './types.ts';
import { formatNumber } from './format.ts';
import { AutomationPanel } from './AutomationPanel.tsx';
import { InfinityUpgradesPanel } from './InfinityUpgradesPanel.tsx';
import { emitAdFeedback } from '../../ad/feedback.ts';

type View = 'upgrades' | 'automation';
const VIEWS: { id: View; label: string }[] = [
  { id: 'upgrades', label: 'adIuSegUpgrades' },
  { id: 'automation', label: 'adAutoTab' },
];

export function InfinityPanel({ ad }: { ad: AntimatterSlice }) {
  useLanguage();
  const [view, setView] = useState<View>('upgrades');
  return (
    <>
      <div className="ad-infinity-head">
        <div className="ad-auto-ip"><span className="ad-auto-ip-label">IP</span><span className="ad-number ad-card-value">{formatNumber(ad.game.infinityPoints)}</span></div>
        <div className="ad-segments is-fill" role="group">
          {VIEWS.map(item => (
            <button key={item.id} type="button" className={`ad-segment${item.id === view ? ' is-active' : ''}`} aria-pressed={item.id === view} onClick={() => {
              if (item.id === view) return;
              setView(item.id);
              emitAdFeedback({ kind: 'navigate' });
            }}>{t(item.label)}</button>
          ))}
        </div>
      </div>
      {view === 'upgrades' ? <InfinityUpgradesPanel ad={ad} /> : <AutomationPanel ad={ad} />}
    </>
  );
}
