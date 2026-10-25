import { sourceText as uiSource } from '../i18n/core.ts';
import { localized } from '../i18n/core.ts';
import type { ItemKind } from '../../../shared/items.ts';

export const ITEM_USAGE: Partial<Record<ItemKind, string>> = localized({
  note: uiSource('ui373'),
  hammer: uiSource('ui374'),
  chess: uiSource('ui375'),
  chessAi: uiSource('ui376'),
  g2048: uiSource('ui377'),
  canvas: uiSource('ui378'),
  camera: uiSource('ui379'),
  dice: uiSource('ui380'),
});
