import type { ItemInfo, ItemKind } from './items.ts';

export type ItemVariant = 'camera-timer';
export interface ItemVariantDefinition { id: ItemVariant; kind: ItemKind; info: ItemInfo; usage: string }

export const ITEM_VARIANTS: Readonly<Record<ItemVariant, ItemVariantDefinition>> = {
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
