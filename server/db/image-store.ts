import { inArray } from 'drizzle-orm';
import { db } from './index.ts';
import { stripNul } from './persist.ts';
import { accountImages, mediaFiles } from './schema.ts';

export interface AccountImages { icon: string | null; avatarImage: string | null; avatarParams: unknown; avatarVersion: string | null }

export async function loadAccountImages() {
  const rows = await db().select().from(accountImages);
  return new Map(rows.map(({ accountId, ...rest }) => [accountId, rest as AccountImages]));
}

export async function saveAccountImages(accountId: string, rec: AccountImages) {
  const row = stripNul(rec);
  await db().insert(accountImages).values({ accountId, ...row }).onConflictDoUpdate({ target: accountImages.accountId, set: row });
}

/** 添付画像を古い順に */
export async function loadMediaFiles() {
  const rows = await db().select().from(mediaFiles).orderBy(mediaFiles.at);
  return rows.map((r) => ({ name: r.name, size: r.size }));
}

export async function addMediaFile(name: string, size: number) {
  await db().insert(mediaFiles).values({ name, size }).onConflictDoNothing();
}

export async function removeMediaFiles(names: string[]) {
  if (names.length) await db().delete(mediaFiles).where(inArray(mediaFiles.name, names));
}
