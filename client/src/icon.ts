import { send } from './net/ws.ts';

/** アカウント ID ごとのアイコン */
export const iconUrl = (id: string, v?: string | null) =>
  `/icon?id=${encodeURIComponent(id)}${v ? `&v=${v}` : `&t=${Date.now()}`}`;

/** 画像を選ばせて中央を正方形に切り抜き、128px の JPEG として送る */
export function pickImage(upload: (blob: Blob) => Promise<void>): Promise<boolean> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.oncancel = () => resolve(false);
    input.onchange = async () => {
      try {
        const file = input.files?.[0];
        if (!file) { resolve(false); return; }
        const img = await createImageBitmap(file);
        const size = Math.min(img.width, img.height);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 128;
        canvas.getContext('2d')!.drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, 128, 128);
        img.close();
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
        if (!blob) { resolve(false); return; }
        await upload(blob);
        resolve(true);
      } catch { resolve(false); }
    };
    input.click();
  });
}

/** 自分のアイコン（サーバーはログインのセッションの本人に保存する） */
export async function pickIcon(): Promise<string | null> {
  let version: string | null = null;
  await pickImage(async (blob) => {
    const res = await fetch('/icon', { method: 'POST', body: blob, headers: { 'Content-Type': 'image/jpeg' } });
    if (!res.ok) throw new Error('upload');
    version = ((await res.json()) as { icon: string | null }).icon;
    send({ t: 'profileUpdated' });
  });
  return version;
}

export const pickGroupImage = (groupId: string) => pickImage(async (blob) => {
  const res = await fetch(`/group-image/${encodeURIComponent(groupId)}`, { method: 'POST', body: blob, headers: { 'Content-Type': 'image/jpeg' } });
  if (!res.ok || res.status === 204) throw new Error('upload');
});
