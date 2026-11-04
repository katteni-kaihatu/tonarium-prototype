import type { ChatMessage, RoomServerMsg } from '../../../shared/protocol.ts';

type Update = Extract<RoomServerMsg, { t: 'chatReactions' }>;
export function mergeChatReactions(body: ChatMessage, current?: Pick<ChatMessage, 'reactions' | 'reactionRevision'>): ChatMessage {
  if (!current || (body.reactionRevision ?? 0) >= (current.reactionRevision ?? 0)) return body;
  return { ...body, reactions: current.reactions, reactionRevision: current.reactionRevision };
}

export class PendingChatReactions {
  private pending = new Map<string, Update>();
  private key(sid: string, id: string) { return JSON.stringify([sid, id]); }
  receive(update: Update, history: ChatMessage[]): ChatMessage[] {
    if (history.some(m => m.id === update.id)) return history.map(m => m.id === update.id ? mergeChatReactions(m, update) : m);
    const key = this.key(update.sid, update.id), old = this.pending.get(key);
    if (!old || old.reactionRevision < update.reactionRevision) this.pending.set(key, update);
    // 本文のない更新も履歴と同じ件数までに抑える。
    while (this.pending.size > 500) this.pending.delete(this.pending.keys().next().value!);
    return history;
  }
  body(sid: string, body: ChatMessage, current?: ChatMessage) {
    const key = this.key(sid, body.id), update = this.pending.get(key);
    this.pending.delete(key);
    return mergeChatReactions(mergeChatReactions(body, current), update);
  }
}
