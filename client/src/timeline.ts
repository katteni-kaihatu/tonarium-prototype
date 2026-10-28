import { send } from './net/ws.ts';
import { get, save, set } from './store.ts';
import { t as tr } from './i18n/index.ts';
import { POST_IMAGE_EDGE, POST_IMAGE_MAX_BYTES, type PostAttach, type TimelineTab } from '../../shared/timeline.ts';

export const postImageUrl = (id: string) => `/timeline-image/${encodeURIComponent(id)}`;

export function createPost(p: { text: string; withPlace: boolean; image?: string; attach?: PostAttach; quote?: string; replyTo?: string }) {
  send({ t: 'postCreate', ...p });
}
export const deletePost = (id: string) => send({ t: 'postDelete', id });
export const reactPost = (id: string, emoji: string, on: boolean) => send({ t: 'postReact', id, emoji, on });
export const repostPost = (id: string, on: boolean) => send({ t: 'postRepost', id, on });

export const openPost = (id: string) => set({ timelineSide: `post:${id}` });
export const openCompose = (quote: string | null = null) => set({ timelineSide: 'compose', composeQuote: quote });
/** ポストに付けられる写真は 1 枚なので、最初の画像だけを書く欄へ渡す */
export function offerPostImage(files: File[]) {
  set({ timelineSide: 'compose', composeImage: files.find((f) => f.type.startsWith('image/')) ?? 'unsupported' });
}
export const closeTimelineSide = () => set({ timelineSide: null, composeQuote: null });
export function setTimelineTab(timelineTab: TimelineTab) { save('tonarium.timelineTab', timelineTab); set({ timelineTab }); }

/** 長辺を縮めた JPEG にして送る。上限に収まるまで画質を下げる */
export async function uploadPostImage(file: File): Promise<string | null> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, POST_IMAGE_EDGE / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close();
  let blob: Blob | null = null;
  for (const q of [0.85, 0.7, 0.55, 0.4]) {
    blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= POST_IMAGE_MAX_BYTES) break;
  }
  if (!blob || blob.size > POST_IMAGE_MAX_BYTES) return null;
  const res = await fetch('/timeline-image', { method: 'POST', body: blob, headers: { 'Content-Type': 'image/jpeg' } });
  if (!res.ok) return null;
  return ((await res.json()) as { id: string }).id;
}

export function agoLabel(at: number, now = Date.now()) {
  const min = Math.floor((now - at) / 60_000);
  if (min < 1) return tr('tlJustNow');
  if (min < 60) return tr('tlMinutesAgo', min);
  const h = Math.floor(min / 60);
  if (h < 24) return tr('tlHoursAgo', h);
  return tr('tlDaysAgo', Math.floor(h / 24));
}
