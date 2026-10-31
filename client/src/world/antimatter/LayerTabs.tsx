import { t, useLanguage } from '../../i18n/index.ts';
import { Icon } from '../Icon.tsx';
import { useState } from 'react';
import type { AntimatterSlice } from './types.ts';
import {
  CELESTIALS_OVERVIEW, CHALLENGES, ETERNITY_UPGRADES, getLayerTabs, GLYPH_TYPES,
  INFINITY_DIMENSIONS, INFINITY_UPGRADES, REALITY_UPGRADES, TIME_DIMENSIONS, TIME_STUDIES,
} from './layersData.ts';
import { s } from './styles.ts';
import { LabBanner, type LabArtKind } from './LabArt.tsx';
import { emitAdFeedback } from '../../ad/feedback.ts';

function MockButton({ children }: { children: React.ReactNode }) {
  return <button style={s.btn} disabled>{children}</button>;
}

function MockList({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 style={s.sectionTitle}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  );
}

function LayerBody({ layerId, ad }: { layerId: string; ad: AntimatterSlice }) {
  useLanguage();
  if (layerId === 'dimensions') {
    return <p style={s.muted}>{t('adLabText60')}</p>;
  }
  if (layerId === 'infinity') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={s.muted}>{t('adLabText61')}</p>
        <MockList title={t('adLabText71')}>
          {INFINITY_UPGRADES.map((u) => (
            <div key={u.id} style={s.row}><span><b>{u.name}</b> <span style={s.badgeMock}>{t('ui1154')}</span></span><span style={s.muted}>{t('adEffect', u.description, u.effect)}</span><span style={{ flex: 1 }} /><MockButton>{t('adLabText62', u.costIP)}</MockButton></div>
          ))}
        </MockList>
        <MockList title={t('adLabText72')}>
          {INFINITY_DIMENSIONS.map((d) => (
            <div key={d.tier} style={s.row}><span><b>{d.name}</b> <span style={s.badgeMock}>{t('ui1154')}</span></span><span style={s.muted}>{t('adBaseCost', d.produces, d.baseCostIP, 'IP')}</span><span style={{ flex: 1 }} /><MockButton>{t('adLabText63')}</MockButton></div>
          ))}
        </MockList>
        <MockList title={t('adLabText73')}>
          {CHALLENGES.map((c) => (
            <div key={c.id} style={s.row}><span><b>{c.name}</b> <span style={s.badgeMock}>{t('ui1154')}</span></span><span style={s.muted}>{t('adLabText64', c.goal, c.reward, c.restriction)}</span><span style={{ flex: 1 }} /><MockButton>{t('adLabText65')}</MockButton></div>
          ))}
        </MockList>
      </div>
    );
  }
  if (layerId === 'eternity') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <MockList title={t('adLabText74')}>
          {TIME_DIMENSIONS.map((d) => (
            <div key={d.tier} style={s.row}><span><b>{d.name}</b> <span style={s.badgeMock}>{t('ui1154')}</span></span><span style={s.muted}>{t('adBaseCost', d.produces, String(d.baseCostEP), 'EP')}</span><span style={{ flex: 1 }} /><MockButton>{t('adLabText63')}</MockButton></div>
          ))}
        </MockList>
        <MockList title={t('adLabText75')}>
          {TIME_STUDIES.map((entry) => (
            <div key={entry.id} style={s.row}><span><b>#{entry.id}</b> <span style={s.badgeMock}>{t('ui1154')}</span></span><span style={s.muted}>{t('adLabText66', entry.col, entry.row, entry.costTT, entry.requires.length ? t('adLabText76', entry.requires.join(', ')) : '', entry.description)}</span><span style={{ flex: 1 }} /><MockButton>{t('adLabText67')}</MockButton></div>
          ))}
        </MockList>
        <MockList title={t('adLabText77')}>
          {ETERNITY_UPGRADES.map((u) => (
            <div key={u.id} style={s.row}><span><b>{u.name}</b> <span style={s.badgeMock}>{t('ui1154')}</span></span><span style={s.muted}>{u.description}</span><span style={{ flex: 1 }} /><MockButton>{t('adLabText68', String(u.costEP))}</MockButton></div>
          ))}
        </MockList>
      </div>
    );
  }
  if (layerId === 'reality') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <MockList title={t('adLabText78')}>
          {GLYPH_TYPES.map((g) => (
            <div key={g.id} style={s.row}><span><b>{g.nameJa}</b> ({g.nameEn}) <span style={s.badgeMock}>{t('ui1154')}</span></span><span style={s.muted}>{g.effectExample}</span><span style={{ flex: 1 }} /><MockButton>{t('adLabText69')}</MockButton></div>
          ))}
        </MockList>
        <MockList title={t('adLabText79')}>
          {REALITY_UPGRADES.map((u) => (
            <div key={u.id} style={s.row}><span><b>{u.name}</b> <span style={s.badgeMock}>{t('ui1154')}</span></span><span style={s.muted}>{u.description}</span><span style={{ flex: 1 }} /><MockButton>{t('adLabText70', u.costRM)}</MockButton></div>
          ))}
        </MockList>
      </div>
    );
  }
  return (
    <MockList title={t('adLabText80')}>
      {CELESTIALS_OVERVIEW.map((c) => (
        <div key={c.id} style={s.row}><span><b>{c.name}</b> <span style={s.badgeMock}>{t('ui1154')}</span></span><span style={s.muted}>{c.role}</span></div>
      ))}
    </MockList>
  );
}

export function LayerTabs({ ad }: { ad: AntimatterSlice }) {
  useLanguage();
  const tabs = getLayerTabs(ad.game.infinities);
  const [layerId, setLayerId] = useState('dimensions');
  const tab = tabs.find((entry) => entry.id === layerId) ?? tabs[0];
  const layerArt: Record<string, LabArtKind> = { dimensions: 'reactor', infinity: 'singularity', eternity: 'galaxy', reality: 'explorer', celestials: 'galaxy' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={s.tabs}>
        {tabs.map((entry) => (
          <button key={entry.id} style={entry.id === layerId ? s.tabActive : s.tab} onClick={() => { if (entry.id !== layerId) { setLayerId(entry.id); emitAdFeedback({ kind: 'navigate' }); } }}>
            {entry.nameJa}<span style={entry.status === 'mock' ? s.badgeMock : s.badge}>{entry.badge}</span>{!entry.unlocked && entry.id !== 'dimensions' ? <span style={s.muted}><Icon name="lock" size={14} /> {t('adLocked')}</span> : null}
          </button>
        ))}
      </div>
      <LabBanner kind={layerArt[tab.id] ?? 'galaxy'} eyebrow={tab.nameEn.toUpperCase()} title={tab.nameJa} description={t('adLabText81', tab.tagline, tab.currencyName)} />
      <LayerBody layerId={tab.id} ad={ad} />
    </div>
  );
}
