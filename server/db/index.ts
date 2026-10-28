import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from './schema.ts';

export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle');

type Db = ReturnType<typeof drizzle<typeof schema>>;
let client: postgres.Sql | null = null;
let instance: Db | null = null;

/** 接続して、まだ流していないマイグレーションを流す。dotenv より先に import されてもよいよう、ここで初めて環境変数を読む */
export async function openDb(url = process.env.DATABASE_URL): Promise<Db> {
  if (!url) throw new Error('DATABASE_URL が未設定です。手元では npm run services で Postgres を起動し、.env に DATABASE_URL を書いてください');
  client = postgres(url, { max: 5, onnotice: () => {} });
  instance = drizzle(client, { schema });
  await migrate(instance, { migrationsFolder: MIGRATIONS_DIR });
  return instance;
}

export function db(): Db {
  if (!instance) throw new Error('DB を開く前に使おうとしました');
  return instance;
}

export async function closeDb() {
  const c = client;
  client = null;
  instance = null;
  await c?.end({ timeout: 5 });
}
