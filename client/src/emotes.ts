import { useSyncExternalStore } from 'react';
import { EMOTES } from './i18n/static.ts';
import { isEmoteId } from '../../shared/emotes.ts';
import type { RoomServerMsg } from '../../shared/protocol.ts';
import { get, set, serverNow, useStore } from './store.ts';
import { volumeFrom } from './spatial.ts';
import { playEmoteSound } from './world/sounds.ts';

export function receiveEmote(msg: Extract<RoomServerMsg, { t: 'emote' }>) {
  const s = get();
  if (msg.sid !== s.session || !isEmoteId(msg.id) || !Number.isFinite(msg.at)) return;
  const user = s.participants.find((u) => u.id === msg.from);
  if (!user || s.blocked.includes(user.name)) return;
  const age = Math.max(0, serverNow() - msg.at);
  if (age >= EMOTES[msg.id].duration || (s.emotes[msg.from]?.at ?? -Infinity) >= msg.at) return;
  const emote = { id: msg.id, at: msg.at, started: performance.now() - age };
  set({ emotes: { ...s.emotes, [msg.from]: emote } });
  // Do not replay delayed sounds after a tab wakes up or the transport reconnects.
  if (age < 700 && !s.peerMuted.includes(user.name)) playEmoteSound(msg.id, volumeFrom(msg.from));
  window.setTimeout(() => {
    if (get().emotes[msg.from] !== emote) return;
    set((state) => {
      const { [msg.from]: _, ...emotes } = state.emotes;
      return { emotes };
    });
  }, EMOTES[msg.id].duration - age);
}

export const useEmote = (id: string) => useStore((s) => s.emotes[id]);
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const subscribeMotion = (cb: () => void) => { motionQuery.addEventListener('change', cb); return () => motionQuery.removeEventListener('change', cb); };
export const useReducedMotion = () => useSyncExternalStore(subscribeMotion, () => motionQuery.matches);
