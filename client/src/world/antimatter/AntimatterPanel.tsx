import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AntimatterPanelProps } from './types.ts';
import { formatDurationMs, formatNumber } from './format.ts';
import { s } from './styles.ts';
import { DimensionList } from './DimensionList.tsx';
import { AchievementsPanel } from './AchievementsPanel.tsx';
import { RankingPanel } from './RankingPanel.tsx';
import { StatsPanel } from './StatsPanel.tsx';
import { ProfilePanel } from './ProfilePanel.tsx';
import { ProgressPicker, ProgressSummary } from './ProgressPicker.tsx';
import { InfinityPanel } from './InfinityPanel.tsx';
import { LayerTabs } from './LayerTabs.tsx';
import { SaveErrorLog } from './SaveErrorLog.tsx';
import './antimatter-panel.css';
import { emitAdFeedback } from '../../ad/feedback.ts';
import { AdPurchaseParticles } from './AdPurchaseParticles.tsx';
import { AdBgmToggle } from '../../ad/AdBgmToggle.tsx';
import { Icon, type IconName } from '../Icon.tsx';
import { t, useLanguage, msg, systemText, type UiMessage } from '../../i18n/index.ts';

type TabId = 'dimensions' | 'infinity' | 'stats' | 'achievements' | 'ranking' | 'profiles' | 'layers' | 'errors';
type Game = AntimatterPanelProps['ad']['game'];

const TABS: { id: TabId; label: string; icon: IconName; visible?: (game: Game) => boolean }[] = [
  { id: 'dimensions', label: 'adLabText4', icon: 'cube' },
  { id: 'infinity', label: 'adInfinityTab', icon: 'infinity' },
  { id: 'stats', label: 'adLabText6', icon: 'chart' },
  { id: 'achievements', label: 'ui819', icon: 'trophy' },
  { id: 'ranking', label: 'adLabText52', icon: 'podium' },
  { id: 'profiles', label: 'adSaveTab', icon: 'cloud' },
  { id: 'layers', label: 'adLabText7', icon: 'layers', visible: game => game.infinities > 0 },
];

export function AntimatterPanel({ ad }: AntimatterPanelProps) {
  useLanguage();
  const root = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<TabId>(ad.saveErrors.length > 0 ? 'errors' : 'dimensions');
  const revealedErrors = useRef(ad.saveErrors.length > 0);
  useEffect(() => {
    if (revealedErrors.current || ad.saveErrors.length === 0) return;
    revealedErrors.current = true;
    setTab('errors');
  }, [ad.saveErrors.length]);
  const [notice, setNotice] = useState<UiMessage | null>(null);
  const showNotice = (message: UiMessage) => setNotice(message);

  const rescueSeen = useRef(ad.rescueCount);
  useEffect(() => {
    if (ad.rescueCount === rescueSeen.current) return;
    rescueSeen.current = ad.rescueCount;
    setNotice(msg('adLabText330'));
  }, [ad.rescueCount]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(id);
  }, [notice]);

  const { game, derived } = ad;
  const tabs = TABS.filter(item => item.visible?.(game) ?? true);
  const activeTab: TabId = (tab === 'errors' && ad.saveErrors.length > 0) || tabs.some(item => item.id === tab) ? tab : 'dimensions';
  if (activeTab !== tab) setTab(activeTab);
  const offline = ad.offlineNotice;
  const offlineGained = offline && (offline.antimatterGained.mantissa ?? 0) !== 0 && offline.elapsedMs >= 5000;

  return (
    <div ref={root} className="adlab-lab-panel" style={s.root} role="region" aria-label={t('mergeAdLab')} tabIndex={0}>
      <div className="adlab-header" style={s.header}>
        <div className="adlab-resource" data-ad-core role="group" aria-label={t('adLabText1')}>
          <Icon name="atom" size={24} stroke={1.8} />
          <span className="adlab-resource-value adlab-number" style={s.big}>{formatNumber(game.antimatter)}</span>
          <span className="adlab-number adlab-resource-rate">{t('adPerSecond', formatNumber(derived.antimatterPerSecond))}</span>
        </div>
        <div className="adlab-chips">
          <span className="adlab-chip adlab-chip-ip adlab-number"><Icon name="infinity" size={13} />IP {formatNumber(game.infinityPoints)}</span>
          <span className="adlab-chip adlab-chip-boost"><Icon name="rocket" size={13} />{t('adChipBoost', game.dimensionalBoosts)}</span>
          <span className="adlab-chip adlab-chip-galaxy"><Icon name="galaxy" size={13} />{t('adChipGalaxy', game.galaxies)}</span>
        </div>
        <div className="adlab-header-tools">
          <AdBgmToggle />
        </div>
      </div>
      <div className="adlab-shell">
        <div className="adlab-tabbar">
          <div className="adlab-tabs" role="group" aria-label={t('adLabText10')}>
            {TABS.map((item) => {
              const shown = item.visible?.(game) ?? true;
              if (!shown) return null;
              return <button key={item.id} type="button" className={`adlab-tab${item.id === activeTab ? ' is-active' : ''}`} aria-pressed={item.id === activeTab} onClick={() => {
                if (item.id === activeTab) return;
                setTab(item.id);
                emitAdFeedback({ kind: 'navigate' });
              }}><Icon name={item.icon} size={15} />{t(item.label)}</button>;
            })}
          </div>
          {ad.saveErrors.length > 0 && (
            <button type="button" className={`adlab-tab adlab-tab-error${activeTab === 'errors' ? ' is-active' : ''}`} aria-pressed={activeTab === 'errors'} onClick={() => {
              if (activeTab === 'errors') return;
              setTab('errors');
              emitAdFeedback({ kind: 'navigate' });
            }}><Icon name="alert" size={15} />{t('adSaveErrorTab')}<span className="adlab-tab-count">{ad.saveErrors.reduce((sum, entry) => sum + entry.count, 0)}</span></button>
          )}
          {activeTab === 'dimensions' && (
            <button type="button" className="adlab-buy-all" title={t('adLabText22')} aria-label={t('adLabText22')} onClick={() => ad.buyMax()}>
              <Icon name="zap" size={15} />{t('adUiBuyAll')}
            </button>
          )}
        </div>
        <div className="adlab-body-frame">
          {notice && <div className={`adlab-toast-layer${ad.serverStatus ? ' has-server-status' : ''}`}>
            <div className="adlab-toast" role="status">{systemText(notice)}</div>
          </div>}
          <div className="adlab-body">
            {ad.serverStatus && <div className="adlab-notices">
              <div role="status" style={s.notice}>{systemText(ad.serverStatus)}</div>
            </div>}
            {ad.migration && <div style={s.notice}><h3>{t('adUseProgress')}</h3><ProgressPicker ad={ad} migration notice={showNotice} /></div>}
            {!ad.migration && ad.syncState === 'choice' && <div style={s.row}>
              {(['local', 'remote'] as const).map(source => <div key={source}>
                {ad.syncSources && <ProgressSummary save={ad.syncSources[source]} />}
                <button style={s.btn} onClick={() => {
                  try { ad.chooseSave(source); } catch { showNotice(msg('adProfileFailed')); }
                }}>{t(source === 'local' ? 'adChooseLocal' : 'adChooseRemote')}</button>
              </div>)}
            </div>}
            {activeTab === 'dimensions' && <DimensionList ad={ad} notice={showNotice} />}
            {activeTab === 'infinity' && <InfinityPanel ad={ad} />}
            {activeTab === 'stats' && <StatsPanel ad={ad} />}
            {activeTab === 'achievements' && <AchievementsPanel ad={ad} />}
            {activeTab === 'ranking' && <RankingPanel ad={ad} notice={showNotice} />}
            {activeTab === 'profiles' && <ProfilePanel ad={ad} notice={showNotice} />}
            {activeTab === 'layers' && <LayerTabs ad={ad} />}
            {activeTab === 'errors' && <SaveErrorLog entries={ad.saveErrors} notice={showNotice} />}
          </div>
        </div>
      </div>
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
