import { randomUUID } from 'node:crypto';
import type { ChatMessage } from '../shared/protocol.ts';

export function logHammerHit(list: ChatMessage[], from: { id: string; name: string }, to: { id: string; name: string }, at: number): ChatMessage {
  const previous = list.findLast((m) => m.hammer?.from === from.id && m.hammer.to === to.id);
  const elapsed = previous?.hammer ? at - previous.hammer.lastHitAt : Infinity;
  const m: ChatMessage = previous && elapsed >= 0 && elapsed <= 10_000
    ? previous
    : { id: randomUUID(), from: null, fromName: '', text: '', at, scope: 'all', about: to.id,
      hammer: { from: from.id, to: to.id, count: 0, lastHitAt: at } };
  m.hammer!.count++;
  m.hammer!.lastHitAt = at;
  m.text = `${from.name} がピコピコハンマーで ${to.name} を${m.hammer!.count}回叩きました`;
  if (m !== previous) {
    list.push(m);
    if (list.length > 500) list.shift();
  }
  return m;
}
