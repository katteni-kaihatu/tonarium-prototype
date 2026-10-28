import { msg } from './i18n/core.ts';
import type { ChatMedia, ChatMessage } from '../../shared/protocol.ts';
import type { ItemKind, MediaInit } from '../../shared/items.ts';
import { get, showToast } from './store.ts';
import { send } from './net/ws.ts';
import { spawnItem } from './items/actions.ts';

const IMAGE_MAX = 10 * 1024 * 1024;
const mb = (n: number) => `${Math.round(n / 1024 / 1024)}MB`;

const YT_RE = /(?:youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/;
export const youTubeId = (text: string) => YT_RE.exec(text)?.[1] ?? null;
export const youTubeUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const youTubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/** 大きすぎるものは送る前に断る。サーバーでも同じ上限を見る */
export async function uploadMedia(file: Blob): Promise<ChatMedia | null> {
  if (!file.type.startsWith('image/')) { showToast(msg("ui28")); return null; }
  if (file.size > IMAGE_MAX) { showToast(msg("ui29", msg("ui31"), mb(IMAGE_MAX), mb(file.size))); return null; }
  showToast(msg("ui32", msg("ui31")));
  try {
    const img = await createImageBitmap(file);
    const { width: w, height: h } = img;
    img.close();
    const res = await fetch('/media', { method: 'POST', body: file });
    const j = await res.json() as { url?: string; error?: string };
    if (!res.ok || !j.url) { showToast(j.error ?? msg("ui33")); return null; }
    showToast(msg("ui34", msg("ui31")));
    return { kind: 'image', url: j.url, w, h };
  } catch {
    showToast(msg("ui33"));
    return null;
  }
}

function spawnMedia(kind: ItemKind, media: MediaInit) {
  spawnItem(kind, undefined, media);
}

const spawnChatMedia = (m: ChatMedia) => spawnMedia(m.kind, { url: m.url, w: m.w, h: m.h });

/** ファイルをチャットに投稿し、asItem なら目の前にアイテムとしても出す */
export async function shareFiles(files: File[], asItem: boolean) {
  for (const f of files.slice(0, 5)) {
    const m = await uploadMedia(f);
    if (!m) continue;
    send({ t: 'chat', text: '', media: m, scope: 'all' });
    if (asItem) spawnChatMedia(m);
  }
}

/** YouTube の oEmbed はブラウザから直接呼べる（ページの OGP は先頭が大きすぎて取れない） */
async function titleOf(id: string) {
  try {
    const o = await (await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(youTubeUrl(id))}`)).json() as { title?: string };
    return o.title ?? '';
  } catch {
    return '';
  }
}

export async function spawnYouTube(id: string) {
  spawnMedia('youtube', { videoId: id, title: await titleOf(id) });
}

/** YouTube のリンクをチャットに投稿し、asItem なら目の前にアイテムとしても出す */
export async function shareYouTube(id: string, asItem: boolean) {
  send({ t: 'chat', text: youTubeUrl(id), scope: 'all' });
  if (asItem) await spawnYouTube(id);
}

/** チャットの画像・YouTube をアイテムにする。写真などの data URL はアップロードし直す */
export async function itemizeMessage(m: ChatMessage) {
  if (!get().session) return;
  if (m.media) { spawnChatMedia(m.media); return; }
  const yt = youTubeId(m.text);
  if (yt) { await spawnYouTube(yt); return; }
  if (m.image) {
    const blob = await (await fetch(m.image)).blob();
    const media = await uploadMedia(blob);
    if (media) spawnChatMedia(media);
  }
}

export const canItemize = (m: ChatMessage) => !!(m.media || m.image || youTubeId(m.text));
