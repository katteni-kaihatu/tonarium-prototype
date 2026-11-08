import type { ItemInfo, ItemKind } from './items.ts';

export type ItemVariant = 'camera-timer' | 'battlefield-tank';
export interface ItemVariantDefinition { id: ItemVariant; kind: ItemKind; info: ItemInfo; usage: string; spawnable?: boolean }

export const ITEM_VARIANTS: Readonly<Record<ItemVariant, ItemVariantDefinition>> = {
  'battlefield-tank': {
    id: 'battlefield-tank', kind: 'bike', spawnable: false,
    info: { name: '戦車', mark: '戦車', tint: '#80946b', ink: '#172119', desc: '戦場に配置された一人乗りの戦車。両表示で移動・照準・射撃ができます。', genre: 'のりもの', in2d: true, in3d: true },
    usage: '戦場の戦車に近づいて搭乗します。操縦と射撃は搭乗者だけが行えます。',
  },
  'camera-timer': {
    id: 'camera-timer', kind: 'camera',
    info: {
      illustration: '/items/camera.png', name: '5秒タイマーカメラ', mark: '写5', tint: '#E5F0E9', ink: '#2E6E4E',
      desc: 'カメラを押すと5秒のカウントダウン後、押した人の画面から一度撮影します。残り秒はカメラの上に表示され、複数台を置いたり、移動・片付けたりできます。',
      genre: 'ツール', in2d: false, in3d: true,
    },
    usage: 'アイテムメニューから出し、カメラをクリックまたはCで操作すると5秒後に撮影します。残り秒はカメラの上に表示されます。右クリックで移動、Xまたはメニューで片付けできます。',
  },
};

export function itemVariantDefinition(value: unknown): ItemVariantDefinition | undefined {
  return typeof value === 'string' && Object.hasOwn(ITEM_VARIANTS, value) ? ITEM_VARIANTS[value as ItemVariant] : undefined;
}

export function validItemVariant(kind: ItemKind, variant: unknown): variant is ItemVariant | undefined {
  return variant === undefined || itemVariantDefinition(variant)?.kind === kind;
}
