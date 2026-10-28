import { and, eq, notInArray, sql } from 'drizzle-orm';
import type { Item } from '../../shared/items.ts';
import type { Post } from '../../shared/timeline.ts';
import { db } from './index.ts';
import { stripNul } from './persist.ts';
import { marketLikes, posts, reports, sessionItems } from './schema.ts';

/** 起動時に、タイムライン・アイテム・マーケットのいいねを全部読む（以後はメモリ側が正） */
export async function loadContent() {
  const d = db();
  const [postRows, itemRows, likeRows] = await Promise.all([
    d.select().from(posts).orderBy(posts.at), d.select().from(sessionItems), d.select().from(marketLikes),
  ]);
  const items: Record<string, Item[]> = Object.create(null);
  for (const r of itemRows) (items[r.sessionId] ??= []).push(r.data as Item);
  const likes: Record<string, string[]> = Object.create(null);
  for (const r of likeRows) (likes[r.product] ??= []).push(r.accountId);
  return { posts: postRows.map((r) => r.data as Post), items, likes };
}

/** 消えたポストを消し、変わったポストだけ書き直す */
export async function savePosts(all: readonly Post[], changed: Iterable<string>) {
  const byId = new Map(all.map((p) => [p.id, p]));
  const rows = [...new Set(changed)].flatMap((id) => { const p = byId.get(id); return p ? [{ id, at: p.at, data: stripNul(p) }] : []; });
  await db().transaction(async (tx) => {
    await tx.delete(posts).where(byId.size ? notInArray(posts.id, [...byId.keys()]) : undefined);
    if (rows.length) await tx.insert(posts).values(rows).onConflictDoUpdate({ target: posts.id, set: { at: sql`excluded.at`, data: sql`excluded.data` } });
  });
}

/** 変わったセッションのアイテムを入れ替える */
export async function saveItems(bySession: Record<string, readonly Item[]>) {
  await db().transaction(async (tx) => {
    for (const [sessionId, list] of Object.entries(bySession)) {
      const keep = list.map((it) => it.id);
      await tx.delete(sessionItems).where(keep.length ? and(eq(sessionItems.sessionId, sessionId), notInArray(sessionItems.itemId, keep)) : eq(sessionItems.sessionId, sessionId));
      if (list.length) {
        await tx.insert(sessionItems).values(list.map((it) => ({ sessionId, itemId: it.id, data: stripNul(it) })))
          .onConflictDoUpdate({ target: [sessionItems.sessionId, sessionItems.itemId], set: { data: sql`excluded.data` } });
      }
    }
  });
}

/** いいねは付けるだけ（外す操作は無い） */
export async function addMarketLike(product: string, accountId: string) {
  await db().insert(marketLikes).values({ product, accountId }).onConflictDoNothing();
}

export async function addReport(r: { fromAccount: string; fromName: string; target: string; reason: string }) {
  await db().insert(reports).values(stripNul(r));
}
