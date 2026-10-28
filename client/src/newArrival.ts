export type ArrivalKind = 'chat' | 'notice';
export interface Arrival { kind: ArrivalKind; at: number; conversation?: string }
export interface ArrivalState {
  session: string | null;
  hubOpen: boolean;
  folded: { left: boolean; right: boolean; faces: boolean };
  phoneLayout: boolean;
  phoneTab: string;
  rightView: 'log' | 'msg';
  rightConversation: string | null;
  popupPausedUntil: number;
}

export const POPUP_PAUSE_MINUTES = [15, 30, 60] as const;
export const ARRIVAL_LIFETIME = 6000;

export class KnownChatMessages {
  private scopes = new Map<string, Set<string>>();

  remember(scope: string, messages: readonly { id: string }[]) {
    let ids = this.scopes.get(scope);
    if (!ids) this.scopes.set(scope, ids = new Set());
    for (const message of messages) ids.add(message.id);
    return ids;
  }

  receive(scope: string, message: { id: string }, history: readonly { id: string }[]) {
    const ids = this.remember(scope, history);
    const fresh = !ids.has(message.id);
    ids.add(message.id);
    return fresh;
  }
}

export function shouldPlayChatArrival(state: {
  session: string | null; chatNotificationSound: boolean; audioVol: { fx: number };
  selfId: string; users: readonly { id: string; status?: string }[]; popupPausedUntil: number;
}, now: number) {
  return !!state.session && state.chatNotificationSound && state.audioVol.fx > 0
    && !state.users.some((u) => u.id === state.selfId && u.status === 'busy')
    && state.popupPausedUntil <= now;
}
export const initialArrivalState = () => ({
  popupPausedUntil: 0,
  arrivals: {} as Partial<Record<ArrivalKind, Arrival>>,
});

// 将来の種別別設定はこの参照先で切り替える。
export function popupSettingsFor(_kind: ArrivalKind, state: ArrivalState) {
  return { pausedUntil: state.popupPausedUntil };
}

export function arrivalWindowOpen(kind: ArrivalKind, state: ArrivalState, conversation?: string) {
  if (state.hubOpen || state.folded.right || (state.phoneLayout && state.phoneTab !== 'log')) return false;
  switch (kind) {
    case 'chat': return conversation ? state.rightView === 'msg' && state.rightConversation === conversation : state.rightView === 'log';
    case 'notice': return state.rightView === 'log';
  }
}

export function shouldShowArrival(kind: ArrivalKind, state: ArrivalState, now: number, conversation?: string) {
  return !!state.session && popupSettingsFor(kind, state).pausedUntil <= now && !arrivalWindowOpen(kind, state, conversation);
}

export function arrivalPatch(kind: ArrivalKind, state: ArrivalState & { arrivals: Partial<Record<ArrivalKind, Arrival>> }, now = Date.now(), conversation?: string) {
  return shouldShowArrival(kind, state, now, conversation)
    ? { arrivals: { ...state.arrivals, [kind]: { kind, at: now, conversation } } } : {};
}

export function openArrivalPatch(arrival: Arrival, state: ArrivalState & { arrivals: Partial<Record<ArrivalKind, Arrival>> }) {
  return {
    folded: { ...state.folded, right: false }, hubOpen: false, phoneTab: 'log' as const,
    rightView: arrival.conversation ? 'msg' as const : 'log' as const,
    rightConversation: arrival.conversation ?? null,
    arrivals: { ...state.arrivals, [arrival.kind]: undefined },
  };
}
