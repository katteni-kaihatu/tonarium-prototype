// お絵描きアバター（https://github.com/anthrotech-dev/oekaki-avatar）の形式

export interface AvatarParams {
  headSize: number;
  neckLength: number;
  headInFront: boolean;
  handSize: number;
  bodySize: number;
  tailSize: number;
  tailPosition: number;
  tailRotation: number;
  disableTail: boolean;
  legsSize: number;
  legsDistance: number;
  legsDistanceFromBody: number;
  legsInFront: boolean;
}

export const DEFAULT_PARAMS: AvatarParams = {
  headSize: 0, neckLength: 0, headInFront: true, handSize: 0, bodySize: 0,
  tailSize: 0, tailPosition: 0, tailRotation: 0, disableTail: false,
  legsSize: 0, legsDistance: 0, legsDistanceFromBody: 0, legsInFront: true,
};

export const AVATAR_SCALE = 0.012;
// GLB の頭の中心・基準寸法。上下・前方の比率を目の目印に使う。
export const AVATAR_EYES = { up: 1 / 4, forward: 1 / 3, headSize: 39.825, headY: 76.224609375, centerY: 4.282142162322998 } as const;

// Feet の拡縮と首・脚の移動で、既定モデルから足裏の高さが変わらないようにする。
export function getAvatarFloorOffset(params: AvatarParams): number {
  const s = 1 + params.legsSize;
  const bottom = Math.min(-20.573508 * s, 0.131523 * s);
  return (params.neckLength + params.legsDistanceFromBody - 20.573508 - bottom) * AVATAR_SCALE;
}

export function getAvatarEyeHeight(params: AvatarParams): number {
  return getAvatarFloorOffset(params)
    + (AVATAR_EYES.headY + AVATAR_EYES.centerY + Math.abs(AVATAR_EYES.headSize + params.headSize) * AVATAR_EYES.up) * AVATAR_SCALE;
}

export const DEFAULT_EYE_HEIGHT = getAvatarEyeHeight(DEFAULT_PARAMS);

/** manifest.json の params だけを取り出す（数値・真偽値以外は既定値） */
export function sanitizeParams(raw: unknown): AvatarParams {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_PARAMS } as Record<string, number | boolean>;
  for (const [k, v] of Object.entries(DEFAULT_PARAMS)) {
    const x = src[k];
    if (typeof v === 'boolean' && typeof x === 'boolean') out[k] = x;
    if (typeof v === 'number' && typeof x === 'number' && Number.isFinite(x)) out[k] = Math.max(-100, Math.min(100, x));
  }
  return out as unknown as AvatarParams;
}

export const AVATAR_SAMPLES = ['/oekaki/sample.png'];

/** 未設定の人のサンプル。名前から決まるようにハッシュで選ぶ */
export function sampleFor(name: string) {
  let h = 0x811c9dc5;
  for (const ch of name.trim()) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return AVATAR_SAMPLES[h % AVATAR_SAMPLES.length];
}
