import http from 'node:http';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { ObjectStorage } from './storage.ts';

export const IMAGE_MAX = 10 * 1024 * 1024;
/** 添付画像の合計の上限。超えたら古いものから消す（MEDIA_TOTAL_MAX_BYTES はテスト用） */
export const MEDIA_TOTAL_MAX = Number(process.env.MEDIA_TOTAL_MAX_BYTES) || 1024 * 1024 * 1024;

export const IMAGE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
};

/** 中身の先頭で種類を決める（拡張子や Content-Type は信用しない） */
function sniff(b: Buffer): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return 'png';
  if (b.subarray(0, 4).toString('latin1') === 'GIF8') return 'gif';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

/** /media/<名前> の名前。ストレージのキーは media/<名前> */
export const MEDIA_NAME_RE = /^[0-9a-f-]{36}\.(jpg|png|gif|webp)$/;

export async function saveMedia(req: http.IncomingMessage, storage: ObjectStorage): Promise<{ url: string; name: string; size: number } | { error: string; status: number }> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > IMAGE_MAX) return { error: '画像は 10MB までです', status: 413 };
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > IMAGE_MAX) return { error: '画像は 10MB までです', status: 413 };
    chunks.push(c as Buffer);
  }
  const body = Buffer.concat(chunks);
  const ext = sniff(body);
  if (!ext) return { error: '画像（JPEG/PNG/GIF/WebP）だけ送れます', status: 415 };
  const name = `${randomUUID()}.${ext}`;
  await storage.put(`media/${name}`, body, IMAGE_TYPES[ext]);
  return { url: `/media/${name}`, name, size: body.length };
}

/** ファイル配信のストリームエラーの受け皿。存在確認後にファイルが消える競合などで
 * createReadStream が error を出しても、リスナーなしの未処理例外でプロセスごと落とさない。
 * 応答が始まっていなければ 500、始まっていれば接続を切る */
export function pipeFile(res: http.ServerResponse, file: string, range?: { start: number; end: number }) {
  const rs = fs.createReadStream(file, range);
  rs.on('error', (e) => {
    console.error(`file stream error: ${file}`, e);
    if (res.writableEnded) return;
    if (!res.headersSent) { res.statusCode = 500; res.end(); } else res.destroy();
  });
  rs.pipe(res);
}
