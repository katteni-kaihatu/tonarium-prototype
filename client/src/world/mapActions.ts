import { isHandheld, type Item } from '../../../shared/items.ts';
import type { Participant } from '../../../shared/protocol.ts';
import { windowKeyOf } from './windowKey.ts';

export interface MapActionState {
  session: string | null;
  selfId: string;
  items: Record<string, Item>;
  participants: Participant[];
  sharer: string | null;
  camFeeds: Record<string, number>;
}

export function canEquipHammer(s: Pick<MapActionState, 'session' | 'selfId' | 'items'>, id: string) {
  const item = s.items[id];
  return !!s.session && !!s.selfId && item?.kind === 'hammer' && item.mapPlacement?.mode !== 'system' && !item.holder
    && !Object.values(s.items).some(i => isHandheld(i) && 'holder' in i && i.holder === s.selfId);
}

export type MapTarget = { kind: 'pick' | 'open' | 'share'; id: string; session: string };

export function mapItemTarget(s: MapActionState, id: string): MapTarget | null {
  const item = s.items[id];
  if (!s.session || !item || ('holder' in item && item.holder)) return null;
  if (canEquipHammer(s, id)) return { kind: 'pick', id, session: s.session };
  return windowKeyOf(item, s.camFeeds) ? { kind: 'open', id, session: s.session } : null;
}

export function mapShareTarget(s: MapActionState, id: string): MapTarget | null {
  return s.session && s.sharer === id && s.participants.some(p => p.id === id && p.sharing)
    ? { kind: 'share', id, session: s.session } : null;
}

export function runMapTarget(s: MapActionState, target: MapTarget, effects: { pick: (id: string) => void; open: (key: string) => void }) {
  if (s.session !== target.session) return;
  if (target.kind === 'share') {
    if (mapShareTarget(s, target.id)) effects.open('share');
  } else if (target.kind === 'pick') {
    if (canEquipHammer(s, target.id)) effects.pick(target.id);
  } else {
    const current = mapItemTarget(s, target.id);
    if (current?.kind === 'open') effects.open(windowKeyOf(s.items[target.id], s.camFeeds)!);
  }
}
