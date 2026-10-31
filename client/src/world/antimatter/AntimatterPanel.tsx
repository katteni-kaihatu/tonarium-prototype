import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AntimatterPanelProps } from './types.ts';
import { formatDurationMs, formatNumber } from './format.ts';
import { s } from './styles.ts';
import { DimensionList } from './DimensionList.tsx';
import { ActionBar } from './ActionBar.tsx';
import { StatsPanel } from './StatsPanel.tsx';
import { ProfilePanel } from './ProfilePanel.tsx';
import { ProgressPicker, ProgressSummary } from './ProgressPicker.tsx';
import { LayerTabs } from './LayerTabs.tsx';
import './antimatter-panel.css';
import { emitAdFeedback } from '../../ad/feedback.ts';
import { AdPurchaseParticles } from './AdPurchaseParticles.tsx';
import { AdBgmToggle } from '../../ad/AdBgmToggle.tsx';
import { t, useLanguage, msg, systemText, type UiMessage } from '../../i18n/index.ts';

type TabId = 'dimensions' | 'actions' | 'stats' | 'profiles' | 'layers';

const TABS: { id: TabId; label: string }[] = [
  { id: 'dimensions', label: 'adLabText4' },
  { id: 'actions', label: 'adLabText5' },
  { id: 'stats', label: 'adLabText6' },
  { id: 'profiles', label: 'adSaveTab' },
  { id: 'layers', label: 'adLabText7' },
];

export function AntimatterPanel({ ad }: AntimatterPanelProps) {
  useLanguage();
  const root = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<TabId>('dimensions');
  const [notice, setNotice] = useState<UiMessage | null>(null);
  const showNotice = (message: UiMessage) => setNotice(message);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(id);
  }, [notice]);

  const { game, derived } = ad;
  const activeTab = tab === 'layers' && !(game.infinities > 0) ? 'dimensions' : tab;
  if (activeTab !== tab) setTab(activeTab);
  const offline = ad.offlineNotice;
  const offlineGained = offline && (offline.antimatterGained.mantissa ?? 0) !== 0 && offline.elapsedMs >= 5000;

  return (
    <div ref={root} className="ad-lab-panel" style={s.root} role="region" aria-label={t('mergeAdLab')} tabIndex={0}>
      <div className="ad-header" style={s.header}>
        <div className="ad-resource" data-ad-core>
          <span className="ad-resource-label">{t('adLabText1')}</span>
          <span className="ad-resource-value ad-number" style={s.big}>{formatNumber(game.antimatter)}</span>
          <span className="ad-number" style={s.muted}>{t('adPerSecond', formatNumber(derived.antimatterPerSecond))}</span>
        </div>
        <div className="ad-header-progress">
          <span className="ad-number">IP: {formatNumber(game.infinityPoints)}</span>
          <span>{t('adLabText2', game.dimensionalBoosts, game.galaxies)}</span>
        </div>
        <div className="ad-header-profile">
          {ad.activeProfile && <span style={s.muted}>{ad.activeProfile.name}</span>}
          <AdBgmToggle />
        </div>
      </div>
      <div style={s.tabs} aria-label={t('adLabText10')}>
        {TABS.filter(item => item.id !== 'layers' || game.infinities > 0).map((item) => (
          <button key={item.id} aria-pressed={item.id === activeTab} style={item.id === activeTab ? s.tabActive : s.tab} onClick={() => {
            if (item.id === activeTab) return;
            setTab(item.id);
            emitAdFeedback({ kind: 'navigate' });
          }}>{t(item.label)}</button>
        ))}
      </div>
      {notice && <div style={s.notice}>{systemText(notice)}</div>}
      {ad.serverStatus && <div role="status" style={s.notice}>{systemText(ad.serverStatus)}</div>}
      {ad.migration && <div style={s.notice}><h3>{t('adUseProgress')}</h3><ProgressPicker ad={ad} migration notice={showNotice} /></div>}
      {!ad.migration && ad.syncState === 'choice' && <div style={s.row}>
        {(['local', 'remote'] as const).map(source => <div key={source}>
          {ad.syncSources && <ProgressSummary save={ad.syncSources[source]} />}
          <button style={s.btn} onClick={() => {
            try { ad.chooseSave(source); } catch { showNotice(msg('adProfileFailed')); }
          }}>{t(source === 'local' ? 'adChooseLocal' : 'adChooseRemote')}</button>
        </div>)}
      </div>}
      {activeTab === 'dimensions' && <DimensionList ad={ad} />}
      {activeTab === 'actions' && <ActionBar ad={ad} notice={showNotice} />}
      {activeTab === 'stats' && <StatsPanel ad={ad} notice={showNotice} />}
      {activeTab === 'profiles' && <ProfilePanel ad={ad} notice={showNotice} />}
      {activeTab === 'layers' && <LayerTabs ad={ad} />}
      <AdPurchaseParticles root={root} />
      {offlineGained && createPortal(
        <div style={s.modal} data-xr-surface="ad-offline" data-xr-layout="dialog" data-xr-min-width="512" data-xr-title={t('adLabText11')} onClick={() => ad.dismissOffline()}>
          <div style={s.modalBox} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0 }}>{t('adLabText3')}</h3>
            <p style={{ margin: 0 }}>
              {t('adOfflineGained', formatDurationMs(offline.simulatedMs), formatNumber(offline.antimatterGained), formatNumber(game.antimatter))}
              {offline.simulatedMs < offline.elapsedMs ? t('adLabText12') : ''}
            </p>
            <button style={s.btn} onClick={() => ad.dismissOffline()}>{t('tlCloseDetail')}</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
