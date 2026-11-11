import { t } from '../../i18n/index.ts';

// 毎 tick 数字が動くとうるさいので、いちばん大きい単位だけを切り上げて出す（秒が動くのは 1 分を切ってから）。
export function etaText(ready: boolean, etaSeconds: number): string {
  if (ready) return t('adUiEtaNow');
  const seconds = Math.ceil(etaSeconds);
  if (!Number.isFinite(seconds)) return t('adUiEtaFar');
  if (seconds < 60) return t('adUiEtaSec', seconds);
  if (seconds < 3600) return t('adUiEtaMin', Math.ceil(seconds / 60));
  if (seconds < 86400) return t('adUiEtaHour', Math.ceil(seconds / 3600));
  const days = Math.ceil(seconds / 86400);
  return days > 9999 ? t('adUiEtaFar') : t('adUiEtaDay', days);
}
