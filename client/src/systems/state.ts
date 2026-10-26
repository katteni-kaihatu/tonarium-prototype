import { create } from 'zustand';
import type { SystemView } from '../../../shared/system-types.ts';

export const useSystems = create<{ sid: string; view?: SystemView; error?: string }>(() => ({ sid: '' }));
export function receiveSystems(sid: string, view: SystemView, error?: string, snapshot = false) {
  const current = useSystems.getState();
  if (!snapshot && current.sid === sid && current.view && view.revision < current.view.revision) return false;
  useSystems.setState({ sid, view, error });
  return true;
}
