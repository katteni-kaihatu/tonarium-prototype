import { NPC_PUBLIC, type NpcLocale, type NpcReply } from '../../../shared/npc.ts';
import { npcReadingRequest } from '../../../shared/npc-reading.ts';
import { matchPrewrittenTopic } from '../../../shared/fantasy-dialogue-topics.ts';
import { npcProfileQuestion } from '../../../shared/fantasy-npc-query.ts';
import { matchNpcPreferenceTopic } from '../../../shared/fantasy-npc-preferences.ts';

const pending = new Map<string, { user: string; npcId: string; locale: NpcLocale }>();
export function registerNpcRequest(id: string, user: string, npcId: string, locale: NpcLocale) {
  pending.set(id, { user, npcId, locale });
  if (pending.size > 80) pending.delete(pending.keys().next().value!);
}
export function consumeNpcRequest(reply: NpcReply) {
  const owner = pending.get(reply.requestId);
  if (!owner || owner.npcId !== reply.npcId || owner.locale !== reply.locale) return undefined;
  pending.delete(reply.requestId);
  return owner;
}
export const npcRequestOwner = (id:string|null) => id?pending.get(id):undefined;
export function clearNpcRequests(user: string): void {
  for (const [id, owner] of pending) if (owner.user === user) pending.delete(id);
}
export function quickNpcQuestion(text: string, npcId?: string): boolean {
  const query=text.normalize('NFKC').toLowerCase().trim();
  if (/(?:내|제|저의)\s*(?:이름|나이|성별|직업)|my (?:name|age|gender|job)|私の(?:名前|年齢|性別|仕事)/.test(query)) return false;
  if (matchPrewrittenTopic(text) || matchNpcPreferenceTopic(text)) return true;
  return !!npcId && NPC_PUBLIC.some(npc => npc.id === npcId && npc.building === 'library') && npcReadingRequest(query)
    || /^(?:안녕(?:하세요)?|반가워(?:요)?|hello|hi|hey|こんにちは|こんばんは|おはよう|고마워(?:요)?|감사(?:합니다|해요)?|thanks?|thank you|ありがとう(?:ございます)?)[!?.。！\s]*$/.test(query)
    || npcProfileQuestion(text) !== undefined;
}
