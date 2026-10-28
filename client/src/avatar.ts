import { sampleFor } from '../../shared/avatar.ts';
import { send } from './net/ws.ts';

/** その人（アカウント ID）のアバター画像。未設定ならサンプル */
export const avatarTextureUrl = (id: string, v: string | null | undefined) =>
  v ? `/avatar?id=${encodeURIComponent(id)}&v=${v}` : sampleFor(id);

export const avatarParamsUrl = (id: string, v: string) => `/avatar/params?id=${encodeURIComponent(id)}&v=${v}`;

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

async function post(path: string, body: Blob | string) {
  const res = await fetch(path, { method: 'POST', body });
  if (!res.ok) return null;
  send({ t: 'profileUpdated' });
  return ((await res.json()) as { avatar: string | null }).avatar;
}

/** テンプレートに描いた画像を選ばせ、2048×1024 の PNG にして保存する */
export async function uploadAvatarImage() {
  const file = await pickFile('image/*');
  if (!file) return null;
  const img = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  canvas.getContext('2d')!.drawImage(img, 0, 0, 2048, 1024);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  return blob ? post('/avatar', blob) : null;
}

/** oekaki-avatar から書き出した manifest.json の調整値を保存する */
export async function uploadAvatarManifest() {
  const file = await pickFile('application/json,.json');
  if (!file) return null;
  try {
    const manifest = JSON.parse(await file.text());
    return post('/avatar/params', JSON.stringify(manifest.params ?? manifest));
  } catch {
    return null;
  }
}
