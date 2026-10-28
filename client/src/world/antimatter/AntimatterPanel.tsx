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
import { LabBanner } from './LabArt.tsx';
import { emitAdFeedback } from '../../ad/feedback.ts';
import { AdPurchaseParticles } from './AdPurchaseParticles.tsx';
import { t, useLanguage } from '../../i18n/index.ts';

type TabId = 'dimensions' | 'actions' | 'stats' | 'profiles' | 'layers';

const TABS: { id: TabId; label: string }[] = [
  { id: 'dimensions', label: '次元' },
  { id: 'actions', label: 'Boost / 銀河 / Sacrifice / Crunch' },
  { id: 'stats', label: '統計・実績・ランキング' },
  { id: 'profiles', label: 'adSaveTab' },
  { id: 'layers', label: 'レイヤー' },
];

export function AntimatterPanel({ ad }: AntimatterPanelProps) {
  useLanguage();
  const root = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<TabId>('dimensions');
  const [notice, setNotice] = useState<string | null>(null);
  const showNotice = (msg: string) => setNotice(msg);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(id);
  }, [notice]);

  const { game, derived } = ad;
  const offline = ad.offlineNotice;
  const offlineGained = offline && (offline.antimatterGained.mantissa ?? 0) !== 0 && offline.elapsedMs >= 5000;

  return (
    <div ref={root} className="ad-lab-panel" style={s.root} role="region" aria-label="AD 研究所" tabIndex={0}>
      <div data-ad-core><LabBanner kind="reactor" eyebrow="ANTIMATTER LAB" title="回せ、次元リアクター！" description="次元を買って反物質を増産。10個ごとに倍率アップ、Boost で次の次元へ！" /></div>
      <div style={s.header}>
        <span className="ad-resource-label">ANTIMATTER / 反物質</span>
        <span className="ad-resource-value" style={s.big}>{formatNumber(game.antimatter)}</span>
        <span style={s.muted}>{formatNumber(derived.antimatterPerSecond)} /秒</span>
        <span style={s.muted}>IP: {formatNumber(game.infinityPoints)}</span>
        <span style={s.muted}>Boost: {game.dimensionalBoosts} · 銀河: {game.galaxies}</span>
        <span style={{ flex: 1 }} />
        {ad.activeProfile && <span style={s.muted}>{ad.activeProfile.name}</span>}
      </div>
      <div style={s.tabs} aria-label="研究メニュー">
        {TABS.map((item) => (
          <button key={item.id} aria-pressed={item.id === tab} style={item.id === tab ? s.tabActive : s.tab} onClick={() => {
            if (item.id === tab) return;
            setTab(item.id);
            emitAdFeedback({ kind: 'navigate' });
          }}>{item.id === 'profiles' ? t('adSaveTab') : item.label}</button>
        ))}
      </div>
      {notice && <div style={s.notice}>{notice}</div>}
      {ad.serverStatus && <div role="status" style={s.notice}>{ad.serverStatus}</div>}
      {ad.migration && <div style={s.notice}><h3>{t('adUseProgress')}</h3><ProgressPicker ad={ad} migration notice={showNotice} /></div>}
      {!ad.migration && ad.syncState === 'choice' && <div style={s.row}>
        {(['local', 'remote'] as const).map(source => <div key={source}>
          {ad.syncSources && <ProgressSummary save={ad.syncSources[source]} />}
          <button style={s.btn} onClick={() => {
            try { ad.chooseSave(source); } catch { showNotice(t('adProfileFailed')); }
          }}>{t(source === 'local' ? 'adChooseLocal' : 'adChooseRemote')}</button>
        </div>)}
      </div>}
      {tab === 'dimensions' && <DimensionList ad={ad} />}
      {tab === 'actions' && <ActionBar ad={ad} notice={showNotice} />}
      {tab === 'stats' && <StatsPanel ad={ad} notice={showNotice} />}
      {tab === 'profiles' && <ProfilePanel ad={ad} notice={showNotice} />}
      {tab === 'layers' && <LayerTabs ad={ad} />}
      <AdPurchaseParticles root={root} />
      {offlineGained && createPortal(
        <div style={s.modal} data-xr-surface="ad-offline" data-xr-title="ADオフライン報酬" onClick={() => ad.dismissOffline()}>
          <div style={s.modalBox} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0 }}>おかえりなさい</h3>
            <p style={{ margin: 0 }}>
              {formatDurationMs(offline.simulatedMs)} の離席中に、反物質が {formatNumber(offline.antimatterGained)} 増えました！（現在 {formatNumber(game.antimatter)}）
              {offline.simulatedMs < offline.elapsedMs ? ' ※オフライン進行は最大8時間まで計算されます。' : ''}
            </p>
            <button style={s.btn} onClick={() => ad.dismissOffline()}>閉じる</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
