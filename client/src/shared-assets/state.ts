import { create } from 'zustand';
import type { AssetView, Catalog } from '../../../shared/shared-assets.ts';
export const useSharedAssets = create<{ sid: string; view?: AssetView; error?: string; catalog?: Catalog }>(() => ({ sid: '' }));
export function receiveShared(sid: string, view: AssetView, error?: string, snapshot = false) {
  const current = useSharedAssets.getState();
  if (!snapshot && current.sid === sid && current.view && view.revision < current.view.revision) return;
  useSharedAssets.setState({ sid, view, error });
}
