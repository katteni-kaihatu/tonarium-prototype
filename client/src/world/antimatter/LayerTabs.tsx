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
  if (layerId === 'dimensions') {
    return <p style={s.muted}>反物質次元の操作は「次元」タブで行います。ここは層の一覧です。</p>;
  }
  if (layerId === 'infinity') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={s.muted}>Big Crunch で IP を獲得したら、ここから恒久アップグレードを買う層になります。現行は Big Crunch のみ実装済みで、以下はすべてモックです。</p>
        <MockList title="Infinity アップグレード">
          {INFINITY_UPGRADES.map((u) => (
            <div key={u.id} style={s.row}><span><b>{u.name}</b> <span style={s.badgeMock}>モック</span></span><span style={s.muted}>{u.description} · 効果: {u.effect}</span><span style={{ flex: 1 }} /><MockButton>買う（{u.costIP} IP）</MockButton></div>
          ))}
        </MockList>
        <MockList title="Infinity 次元">
          {INFINITY_DIMENSIONS.map((d) => (
            <div key={d.tier} style={s.row}><span><b>{d.name}</b> <span style={s.badgeMock}>モック</span></span><span style={s.muted}>{d.produces} · 基礎コスト: {d.baseCostIP} IP</span><span style={{ flex: 1 }} /><MockButton>買う</MockButton></div>
          ))}
        </MockList>
        <MockList title="チャレンジ">
          {CHALLENGES.map((c) => (
            <div key={c.id} style={s.row}><span><b>{c.name}</b> <span style={s.badgeMock}>モック</span></span><span style={s.muted}>目標: {c.goal} · 報酬: {c.reward} · 制限: {c.restriction}</span><span style={{ flex: 1 }} /><MockButton>挑戦する</MockButton></div>
          ))}
        </MockList>
      </div>
    );
  }
  if (layerId === 'eternity') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <MockList title="Time 次元">
          {TIME_DIMENSIONS.map((d) => (
            <div key={d.tier} style={s.row}><span><b>{d.name}</b> <span style={s.badgeMock}>モック</span></span><span style={s.muted}>{d.produces} · 基礎コスト: {String(d.baseCostEP)} EP</span><span style={{ flex: 1 }} /><MockButton>買う</MockButton></div>
          ))}
        </MockList>
        <MockList title="Time Studies（前提つきグリッド）">
          {TIME_STUDIES.map((t) => (
            <div key={t.id} style={s.row}><span><b>#{t.id}</b> <span style={s.badgeMock}>モック</span></span><span style={s.muted}>列 {t.col} · 行 {t.row} · {t.costTT} TT{t.requires.length ? ` · 前提: ${t.requires.join(', ')}` : ''} · {t.description}</span><span style={{ flex: 1 }} /><MockButton>取得する</MockButton></div>
          ))}
        </MockList>
        <MockList title="Eternity アップグレード">
          {ETERNITY_UPGRADES.map((u) => (
            <div key={u.id} style={s.row}><span><b>{u.name}</b> <span style={s.badgeMock}>モック</span></span><span style={s.muted}>{u.description}</span><span style={{ flex: 1 }} /><MockButton>買う（{String(u.costEP)} EP）</MockButton></div>
          ))}
        </MockList>
      </div>
    );
  }
  if (layerId === 'reality') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <MockList title="Glyph（5系統・スロットはモック）">
          {GLYPH_TYPES.map((g) => (
            <div key={g.id} style={s.row}><span><b>{g.nameJa}</b> ({g.nameEn}) <span style={s.badgeMock}>モック</span></span><span style={s.muted}>{g.effectExample}</span><span style={{ flex: 1 }} /><MockButton>装備する</MockButton></div>
          ))}
        </MockList>
        <MockList title="Reality アップグレード">
          {REALITY_UPGRADES.map((u) => (
            <div key={u.id} style={s.row}><span><b>{u.name}</b> <span style={s.badgeMock}>モック</span></span><span style={s.muted}>{u.description}</span><span style={{ flex: 1 }} /><MockButton>買う（{u.costRM} RM）</MockButton></div>
          ))}
        </MockList>
      </div>
    );
  }
  return (
    <MockList title="Celestials（概要モック）">
      {CELESTIALS_OVERVIEW.map((c) => (
        <div key={c.id} style={s.row}><span><b>{c.name}</b> <span style={s.badgeMock}>モック</span></span><span style={s.muted}>{c.role}</span></div>
      ))}
    </MockList>
  );
}

export function LayerTabs({ ad }: { ad: AntimatterSlice }) {
  const tabs = getLayerTabs(ad.game.infinities);
  const [layerId, setLayerId] = useState('dimensions');
  const tab = tabs.find((t) => t.id === layerId) ?? tabs[0];
  const layerArt: Record<string, LabArtKind> = { dimensions: 'reactor', infinity: 'singularity', eternity: 'galaxy', reality: 'explorer', celestials: 'galaxy' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={s.tabs}>
        {tabs.map((t) => (
          <button key={t.id} style={t.id === layerId ? s.tabActive : s.tab} onClick={() => { if (t.id !== layerId) { setLayerId(t.id); emitAdFeedback({ kind: 'navigate' }); } }}>
            {t.nameJa}<span style={t.status === 'mock' ? s.badgeMock : s.badge}>{t.badge}</span>{!t.unlocked && t.id !== 'dimensions' ? ' 🔒' : ''}
          </button>
        ))}
      </div>
      <LabBanner kind={layerArt[tab.id] ?? 'galaxy'} eyebrow={tab.nameEn.toUpperCase()} title={tab.nameJa} description={`${tab.tagline} · 通貨: ${tab.currencyName}`} />
      <LayerBody layerId={tab.id} ad={ad} />
    </div>
  );
}
