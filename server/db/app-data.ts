import { and, eq, sql } from 'drizzle-orm';
import { db } from './index.ts';
import { stripNul } from './persist.ts';
import { appData } from './schema.ts';

/**
 * 機能ごとに形が違うデータを入れる汎用の表（app_data）の口。scope は「機能.種類」で、使っているものは docs/storage.md に並べる。
 * 新しいゲームやアイテムが自分のデータを持つときは、表を足さずに scope を足す
 */
export interface AppDataRow<T = unknown> { key: string; accountId: string | null; data: T }

export async function getAppData<T>(scope: string, key: string): Promise<T | undefined> {
  const [row] = await db().select({ data: appData.data }).from(appData).where(and(eq(appData.scope, scope), eq(appData.key, key)));
  return row?.data as T | undefined;
}

export async function listAppData<T>(scope: string): Promise<AppDataRow<T>[]> {
  const rows = await db().select().from(appData).where(eq(appData.scope, scope));
  return rows.map((r) => ({ key: r.key, accountId: r.accountId, data: r.data as T }));
}

/** 何件でも 1 回で書く（あれば置き換える） */
export async function putAppData(scope: string, rows: AppDataRow[]) {
  if (!rows.length) return;
  await db().insert(appData)
    .values(rows.map((r) => ({ scope, key: r.key, accountId: r.accountId, data: stripNul(r.data), updatedAt: new Date() })))
    .onConflictDoUpdate({ target: [appData.scope, appData.key], set: { data: sql`excluded.data`, accountId: sql`excluded.account_id`, updatedAt: sql`excluded.updated_at` } });
}

export async function removeAppData(scope: string, key: string) {
  await db().delete(appData).where(and(eq(appData.scope, scope), eq(appData.key, key)));
}
