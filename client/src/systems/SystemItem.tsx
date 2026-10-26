import type { ReactNode } from 'react';
import type { Item } from '../../../shared/items.ts';
import { useStore } from '../store.ts';
import type { Interactable } from '../view3d/interact.ts';
import { interactSystemObject } from './api.ts';
import { controlledItemObject } from './map-item-control.ts';
import { useSystems } from './state.ts';
import { Label } from '../view3d/Label.tsx';
import { t, useLanguage } from '../i18n/index.ts';
import { systemObjectLabel } from './catalog-labels.ts';
import { cameraTimerLabel } from './camera-countdown.ts';
import { isCameraTimerItem } from '../../../shared/camera-timer-demo.ts';
import { removeItem } from '../items/actions.ts';

function useSystemItem(item: Item) {
  const state = useSystems(), session = useStore(store => store.session);
  const object = controlledItemObject(item, session, state);
  const interactive = !!object?.capabilities.includes('interact');
  const use = () => {
    const current = useStore.getState(), latest = current.items[item.id];
    const target = latest && controlledItemObject(latest, current.session, useSystems.getState());
    if (target?.capabilities.includes('interact')) {
      try { interactSystemObject(target.id); } catch (error) { useSystems.setState({ error: String(error) }); }
    }
  };
  const caption = object && cameraTimerLabel(item, state.view);
  return { interactive, use, label: caption ?? (object?.text !== undefined && state.view ? systemObjectLabel(state.view, object) : undefined) };
}

export function SystemItemBoundary({ item, children }: { item: Item; children: ReactNode }) {
  useLanguage();
  const action = useSystemItem(item);
  const data: Interactable = { interactionBoundary: true, hint: t(action.interactive ? 'ssCatalogRunSystem' : 'ssCatalogControlledObject'), ...(action.interactive ? { use: action.use } : {}), ...(isCameraTimerItem(item) ? { remove: () => removeItem(item.id) } : {}) };
  // 既存モデルが絶対座標を持つため、この境界では座標を変更しない。
  return <group userData={data} onClick={event => { if (!document.pointerLockElement) { event.stopPropagation(); if (action.interactive) action.use(); } }}>{children}{item.kind !== 'note' && action.label && <Label text={action.label} position={[item.x, item.kind === 'camera' ? 1.95 : 1.5, item.z]} height={0.17} />}</group>;
}

export function SystemItemPanel({ item }: { item: Item }) {
  useLanguage();
  const action = useSystemItem(item);
  return <div style={{ padding: 18 }}><p>{t('ssCatalogConnectedObject')}</p>{item.kind === 'note' && <p style={{ whiteSpace: 'pre-wrap', fontSize: 24 }}>{item.text}</p>}{action.interactive && <button type="button" onClick={action.use}>{action.label ?? t('ssCatalogRunSystem')}</button>}</div>;
}
