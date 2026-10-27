import { useSyncExternalStore } from 'react';
import type { FantasyGmChatResponse, FantasyGmReply } from '../../../shared/fantasy-gm.ts';
import type { NpcLocale } from '../../../shared/npc.ts';

export interface FantasyGmMessage { id: string; who: 'you' | 'gm'; reply: FantasyGmReply }
const histories = new Map<string, FantasyGmMessage[]>();
const requestOwners = new Map<string, { user: string; locale: NpcLocale }>();
const empty: FantasyGmMessage[] = [];
const listeners = new Set<() => void>();
const keyOf = (user: string, locale: NpcLocale) => JSON.stringify([user, locale]);
export const fantasyGmHistory = (user: string, locale: NpcLocale) => histories.get(keyOf(user, locale)) ?? empty;
export function appendFantasyGmMessages(user: string, locale: NpcLocale, ...messages: FantasyGmMessage[]) {
  const previous = fantasyGmHistory(user, locale);
  const added = messages.filter(message => !previous.some(old => old.id === message.id));
  if (!added.length) return;
  histories.set(keyOf(user, locale), [...previous, ...added].slice(-80));
  for (const listener of listeners) listener();
}
export function registerFantasyGmRequest(requestId: string, user: string, locale: NpcLocale) {
  requestOwners.set(requestId, { user, locale });
  if (requestOwners.size > 80) requestOwners.delete(requestOwners.keys().next().value!);
}
export const fantasyGmRequestOwner = (requestId: string) => requestOwners.get(requestId);
export function clearFantasyGmLife(user: string): void {
  for (const key of histories.keys()) if (JSON.parse(key)[0] === user) histories.delete(key);
  for (const [id, owner] of requestOwners) if (owner.user === user) requestOwners.delete(id);
  for (const listener of listeners) listener();
}
/** 遅延応答を現在の閲覧者ではなく、要求した人物へ戻す。 */
export function appendFantasyGmResponse(response: FantasyGmChatResponse): boolean {
  const owner = requestOwners.get(response.requestId);
  if (!owner) return false;
  requestOwners.delete(response.requestId);
  if (response.error || !response.reply.text || response.locale !== owner.locale) return false;
  appendFantasyGmMessages(owner.user, owner.locale, { id: `${response.requestId}:gm`, who: 'gm', reply: response.reply });
  return true;
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useFantasyGmHistory(user: string, locale: NpcLocale) {
  return useSyncExternalStore(subscribe, () => fantasyGmHistory(user, locale), () => empty);
}
