import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MEDIA_DIR = path.join(process.env.DATA_DIR ?? path.join(ROOT, 'data'), 'media');

const IMAGE_MAX = 10 * 1024 * 1024;
const VIDEO_MAX = 50 * 1024 * 1024;
/** 小さな VPS なので、合計がこれを超えたら古いものから消す */
const TOTAL_MAX = 1024 * 1024 * 1024;

const TYPES: Record<string, string> = {
  jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm',
};

/** 中身の先頭で種類を決める（拡張子や Content-Type は信用しない） */
function sniff(b: Buffer): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return 'png';
  if (b.subarray(0, 4).toString('latin1') === 'GIF8') return 'gif';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (b.subarray(4, 8).toString('latin1') === 'ftyp') return 'mp4';
  if (b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'webm';
  return null;
}

const isVideo = (ext: string) => ext === 'mp4' || ext === 'webm';
const fileOf = (url: string) => path.join(MEDIA_DIR, path.basename(url));
export const mediaExists = (url: string) => fs.existsSync(fileOf(url));

function prune() {
  const files = fs.readdirSync(MEDIA_DIR).map((f) => {
    const st = fs.statSync(path.join(MEDIA_DIR, f));
    return { f, size: st.size, at: st.mtimeMs };
  }).sort((a, b) => a.at - b.at);
  let total = files.reduce((n, x) => n + x.size, 0);
  for (const x of files) {
    if (total <= TOTAL_MAX) break;
    fs.rmSync(path.join(MEDIA_DIR, x.f), { force: true });
    total -= x.size;
  }
}

export async function saveMedia(req: http.IncomingMessage): Promise<{ url: string } | { error: string; status: number }> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > VIDEO_MAX) return { error: 'ファイルが大きすぎます', status: 413 };
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > VIDEO_MAX) return { error: 'ファイルが大きすぎます', status: 413 };
    chunks.push(c as Buffer);
  }
  const body = Buffer.concat(chunks);
  const ext = sniff(body);
  if (!ext) return { error: '画像（JPEG/PNG/GIF/WebP）か動画（MP4/WebM）だけ送れます', status: 415 };
  if (!isVideo(ext) && body.length > IMAGE_MAX) return { error: '画像は 10MB までです', status: 413 };
  const name = `${randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(MEDIA_DIR, name), body);
  prune();
  return { url: `/media/${name}` };
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

/** 動画のシークに Range が要る */
export function serveMedia(req: http.IncomingMessage, res: http.ServerResponse, pathname: string) {
  const name = path.basename(pathname);
  const ext = name.split('.').pop() ?? '';
  const file = path.join(MEDIA_DIR, name);
  if (!/^[0-9a-f-]{36}\.\w+$/.test(name) || !Object.hasOwn(TYPES, ext) || !fs.existsSync(file)) { res.statusCode = 404; res.end(); return; }
  const total = fs.statSync(file).size;
  res.setHeader('Content-Type', TYPES[ext]);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
  if (!m || (!m[1] && !m[2])) {
    res.setHeader('Content-Length', total);
    pipeFile(res, file);
    return;
  }
  let start = m[1] ? Number(m[1]) : Math.max(0, total - Number(m[2]));
  let end = m[1] && m[2] ? Number(m[2]) : total - 1;
  end = Math.min(end, total - 1);
  if (start > end || start >= total) {
    res.statusCode = 416;
    res.setHeader('Content-Range', `bytes */${total}`);
    res.end();
    return;
  }
  start = Math.max(0, start);
  res.statusCode = 206;
  res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
  res.setHeader('Content-Length', end - start + 1);
  pipeFile(res, file, { start, end });
}
