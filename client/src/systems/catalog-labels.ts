import type { SystemManifest, SystemObject, SystemView } from '../../../shared/system-types.ts';
import { t } from '../i18n/core.ts';
import { systemCatalogLocales } from './locales/catalog.ts';
import { contentFieldText, contentText } from '../content-translations.ts';

const stock = {
  button: { title: 'ssCatalogButtonTitle', description: 'ssCatalogButtonDescription' },
  timer: { title: 'ssCatalogTimerTitle', description: 'ssCatalogTimerDescription' },
  chair: { title: 'ssCatalogChairTitle', description: 'ssCatalogChairDescription' },
} as const;

function stockLabels(manifest: SystemManifest) {
  const labels = Object.hasOwn(stock, manifest.id) ? stock[manifest.id as keyof typeof stock] : undefined;
  // 公開原本と作者が変更した説明は翻訳のために書き換えない。
  return labels && manifest.title === systemCatalogLocales.ko[labels.title] && manifest.description === systemCatalogLocales.ko[labels.description]
    && manifest.credits.includes('Tonarium contributors') ? labels : undefined;
}

export const systemContentKey = (manifest: SystemManifest) => `system/${manifest.id}/${manifest.version}`;
export function systemTitle(manifest: SystemManifest) { const labels = stockLabels(manifest); return contentText(systemContentKey(manifest), 'title', manifest.title, labels ? t(labels.title) : manifest.title); }
export function systemDescription(manifest: SystemManifest) { const labels = stockLabels(manifest); return contentText(systemContentKey(manifest), 'description', manifest.description, labels ? t(labels.description) : manifest.description); }
export const systemDocumentation = (manifest: SystemManifest, field: string) => contentFieldText(systemContentKey(manifest), field);

const demoLabels = {
  'start-button': { source: 'start-button', key: 'ssCatalogDemoStart' },
  'pause-button': { source: 'pause-button', key: 'ssCatalogDemoPause' },
  'reset-button': { source: 'reset-button', key: 'ssCatalogDemoReset' },
  'chair-object': { source: 'chair-object', key: 'ssCatalogDemoSeat' },
  'menu-chess-button': { source: '클릭: 타이머 시작', key: 'ssCatalogDemoChess' },
} as const;

export function systemObjectLabel(view: Pick<SystemView, 'map'> | undefined, object: SystemObject) {
  const source = object.text ?? object.id;
  const label = Object.hasOwn(demoLabels, object.id) ? demoLabels[object.id as keyof typeof demoLabels] : undefined;
  return view?.map.id === 'system-demo' && label && source === label.source ? t(label.key) : source;
}
