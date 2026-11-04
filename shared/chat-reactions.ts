import type { ChatMessage } from './protocol.ts';
import { isReaction } from './timeline.ts';

export function canReadChat(message: ChatMessage, user: string) {
  return !message.to || message.to.includes(user);
}

export function reactChat(history: readonly ChatMessage[], user: string, command: unknown): ChatMessage | null {
  if (!command || typeof command !== 'object') return null;
  const c = command as Record<string, unknown>;
  if (Object.keys(c).some(k => !['t', 'id', 'emoji', 'on'].includes(k)) || c.t !== 'chatReact' ||
    typeof c.id !== 'string' || !isReaction(c.emoji) || typeof c.on !== 'boolean') return null;
  const message = history.find(m => m.id === c.id);
  if (!message || message.from === null || !canReadChat(message, user)) return null;
  const reactions = message.reactions ?? {};
  const ids = reactions[c.emoji] ?? [];
  if (ids.includes(user) === c.on) return null;
  const next = c.on ? [...ids, user] : ids.filter(id => id !== user);
  message.reactions = { ...reactions };
  if (next.length) message.reactions[c.emoji] = next;
  else delete message.reactions[c.emoji];
  message.reactionRevision = (message.reactionRevision ?? 0) + 1;
  return message;
}
