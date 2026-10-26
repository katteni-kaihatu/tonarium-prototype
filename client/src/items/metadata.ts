import type { ItemInfo } from '../../../shared/items.ts';
import { itemVariantDefinition, type ItemVariantDefinition } from '../../../shared/item-variants.ts';
import { contentText, localizedContentEntry } from '../content-translations.ts';
import { getLanguage } from '../i18n/core.ts';

function variantFallback(definition: ItemVariantDefinition) {
  if (definition.id === 'camera-timer' && getLanguage() === 'ko') return {
    info: { ...definition.info, name: '5초 딜레이 카메라', genre: '도구', desc: '카메라를 누르면 5초 카운트다운 후 누른 사람의 화면에서 한 번 촬영합니다. 카메라 위에 남은 초가 표시되며 여러 대를 배치하고 옮기거나 치울 수 있습니다.' },
    usage: '아이템 메뉴에서 꺼내고 카메라를 클릭하거나 C를 누르면 5초 후 촬영합니다. 남은 초는 카메라 위에 표시됩니다. 오른쪽 클릭으로 옮기고 X 또는 메뉴에서 치울 수 있습니다.',
  };
  if (definition.id === 'camera-timer' && getLanguage() === 'en') return {
    info: { ...definition.info, name: '5-second timer camera', genre: 'Tools', desc: 'Press the camera to take one photo from your browser after a five-second countdown. The remaining seconds appear above it. You can place, move, and remove multiple cameras.' },
    usage: 'Place it from the item menu, then click the camera or press C to take a photo after five seconds. The countdown appears above the camera. Right-click to move it; use X or the menu to remove it.',
  };
  return { info: definition.info, usage: definition.usage };
}

export function localizedVariantInfo(variant: unknown): ItemInfo | undefined {
  const definition = itemVariantDefinition(variant);
  if (!definition) return;
  const fallback = new Proxy(definition.info, { get(_target, field) { return Reflect.get(variantFallback(definition).info, field); } });
  return localizedContentEntry(`item/${definition.id}`, definition.info, ['name', 'desc', 'genre'], fallback);
}

export function localizedVariantUsage(variant: unknown): string | undefined {
  const definition = itemVariantDefinition(variant);
  return definition && contentText(`item/${definition.id}`, 'usage', definition.usage, variantFallback(definition).usage);
}
