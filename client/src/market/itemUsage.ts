import { ITEM_USAGE as sourceUsage } from '../../../shared/item-usage.ts';
import { contentText } from '../content-translations.ts';
import { t } from '../i18n/core.ts';

export const ITEM_USAGE = new Proxy(sourceUsage, {
  get(target, key, receiver) {
    const source = Reflect.get(target, key, receiver) as unknown;
    return typeof key === 'string' && typeof source === 'string'
      ? contentText(`item/${key}`, 'usage', source, t(source))
      : source;
  },
});
