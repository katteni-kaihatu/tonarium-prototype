import { randomBytes } from 'node:crypto';
import type { TestContext } from 'node:test';
import postgres from 'postgres';

/** 使い捨て DB を作るための管理用接続。手元は npm run services の Postgres、CI は services の Postgres */
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? 'postgres://tonarium:tonarium@localhost:5432/tonarium';

/**
 * テストごとに空の DB を作り、終わったら消す。起動するサーバーの env に混ぜて使う。
 * .env の DATABASE_URL や S3_* を引き継ぐと開発用のデータに書き込んでしまうので、ここで上書きする
 */
export async function testServerEnv(t: TestContext): Promise<Record<string, string>> {
  const name = `tonarium_test_${randomBytes(6).toString('hex')}`;
  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
  try { await admin.unsafe(`CREATE DATABASE ${name}`); }
  catch (e) { throw new Error(`テスト用の DB を作れませんでした（${ADMIN_URL.replace(/:[^:@/]*@/, ':***@')}）。npm run services で PostgreSQL を起動してください: ${(e as NodeJS.ErrnoException).code ?? (e as Error).message}`); }
  finally { await admin.end(); }
  t.after(async () => {
    const sql = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
    // サーバーの終了を待たずに消せるよう、残った接続は切る
    try { await sql.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); }
    finally { await sql.end(); }
  });
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  // 開発用ログイン（名前だけで入れる）を開けて、テストから本人を作れるようにする
  return { DATABASE_URL: url.toString(), S3_ENDPOINT: '', AUTH_DEV_LOGIN: '1' };
}

/**
 * サーバーを立てる前に、開発用アカウント（名前だけで入るもの）を作って ID を返す。
 * home.json などを人の ID 入りで用意してから起動するテスト用。devLogin(base, 名前) は同じアカウントに入る
 */
export async function seedDevAccounts(env: Record<string, string>, names: string[]): Promise<Record<string, string>> {
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const { migrate } = await import('drizzle-orm/postgres-js/migrator');
  const { MIGRATIONS_DIR } = await import('./db/index.ts');
  const { accounts } = await import('./db/schema.ts');
  const sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    const db = drizzle(sql);
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    const rows = await db.insert(accounts).values(names.map((n) => ({ kind: 'dev' as const, username: n, displayName: n }))).returning();
    return Object.fromEntries(rows.map((r) => [r.username!, r.id]));
  } finally { await sql.end(); }
}

/** 先に置いたデータを「名前で持っていた頃の古いデータ」として退避させないための印（server/index.ts の archiveNameKeyedData） */
export async function markIdData(dir: string) {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(`${dir}/.ids-v1`, '');
}

/** サーバーを立てる前に、作ったセッション・グループ・イベント・フォロー・セッションのアイテムを DB に置く */
export async function seedHomeData(env: Record<string, string>, data: { home?: Partial<import('./db/home-store.ts').HomeData>; follows?: [string, string][]; items?: Record<string, import('../shared/items.ts').Item[]> }) {
  const { openDb, closeDb } = await import('./db/index.ts');
  const store = await import('./db/home-store.ts');
  const content = await import('./db/content-store.ts');
  await openDb(env.DATABASE_URL);
  try {
    if (data.home) await store.saveHome({ sessions: [], groups: [], events: [], renamed: {}, ...data.home });
    if (data.follows) await store.saveFollows(data.follows);
    if (data.items) await content.saveItems(data.items);
  } finally { await closeDb(); }
}

/** サーバーが DB に書いたホームのデータを読む（保存されたかの確かめ用） */
export async function readHomeData(env: Record<string, string>) {
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const schema = await import('./db/schema.ts');
  const sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    const d = drizzle(sql);
    return {
      sessions: await d.select().from(schema.userSessions), groups: await d.select().from(schema.groups), events: await d.select().from(schema.events),
      items: await d.select().from(schema.sessionItems),
    };
  } finally { await sql.end(); }
}
