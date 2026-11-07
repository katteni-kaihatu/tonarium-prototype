import { t } from '../../i18n/core.ts';
import type { CSSProperties } from 'react';
// 共通部品はインライン、反応・アニメーションは名前空間付き CSS で定義する。
export const s: Record<string, CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: 8, width: '100%', height: '100%', minHeight: 0, overflow: 'hidden', boxSizing: 'border-box', padding: 8, borderRadius: 10, background: '#10122c', color: '#f2eef5', fontSize: 'var(--ad-text, 13px)', lineHeight: 1.5, fontVariantNumeric: 'tabular-nums', textAlign: 'left' },
  header: { display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px', borderRadius: 10, background: 'rgba(21,17,42,.72)', border: '1px solid #3a3160' },
  big: { fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  muted: { color: 'rgba(242,238,245,0.65)', fontSize: 'var(--ad-small, 12px)' },
  row: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' },
  dimRow: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' },
  dimRowLocked: { display: 'grid', gridTemplateColumns: '1fr', gap: 4, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', opacity: 0.6 },
  btn: { border: '1px solid rgba(255,255,255,0.22)', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: '#f2eef5', padding: '5px 10px', cursor: 'pointer', fontSize: 12 },
  btnDanger: { border: '1px solid rgba(255,120,120,0.5)', borderRadius: 8, background: 'rgba(255,80,80,0.14)', color: '#ffd9d9', padding: '5px 10px', cursor: 'pointer', fontSize: 12 },
  input: { border: '1px solid rgba(255,255,255,0.22)', borderRadius: 8, background: 'rgba(0,0,0,0.25)', color: '#f2eef5', padding: '5px 8px', fontSize: 12, minWidth: 120 },
  textarea: { width: '100%', minHeight: 90, boxSizing: 'border-box', border: '1px solid rgba(255,255,255,0.22)', borderRadius: 8, background: 'rgba(0,0,0,0.25)', color: '#f2eef5', padding: 8, fontSize: 12, fontFamily: 'monospace' },
  badge: { display: 'inline-block', borderRadius: 999, background: 'rgba(255,211,109,0.2)', color: '#ffe9b0', padding: '1px 8px', fontSize: 11, marginLeft: 6 },
  badgeMock: { display: 'inline-block', borderRadius: 999, background: 'rgba(255,255,255,0.12)', color: 'rgba(242,238,245,0.8)', padding: '1px 8px', fontSize: 11, marginLeft: 6 },
  notice: { padding: '8px 10px', borderRadius: 10, background: 'rgba(255,211,109,0.16)', color: '#ffe9b0' },
  modal: { position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', padding: 16 },
  modalBox: { maxWidth: 480, width: '100%', borderRadius: 14, background: '#10122c', color: '#f2eef5', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  table: { width: '100%', tableLayout: 'fixed', overflowWrap: 'anywhere', borderCollapse: 'collapse', fontSize: 12 },
  num: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  sectionTitle: { fontSize: 14, fontWeight: 700, margin: '4px 0 0' },
};

export const TIER_EN = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

export const ACHIEVEMENT_DEFS = [
  { id: 'first-dimension', get name() { return t('adLabText133'); }, get desc() { return t('adLabText134'); } },
  { id: 'eighth-dimension', get name() { return t('adLabText135'); }, get desc() { return t('adLabText136'); } },
  { id: 'antimatter-1e100', get name() { return t('adLabText137'); }, get desc() { return t('adLabText138'); } },
  { id: 'first-boost', get name() { return t('adLabText139'); }, get desc() { return t('adLabText140'); } },
  { id: 'first-galaxy', get name() { return t('adLabText141'); }, get desc() { return t('adLabText142'); } },
  { id: 'first-sacrifice', get name() { return t('adLabText143'); }, get desc() { return t('adLabText144'); } },
  { id: 'first-infinity', get name() { return t('adLabText145'); }, get desc() { return t('adLabText146'); } },
] as const;
