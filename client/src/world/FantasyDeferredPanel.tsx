import { createElement, lazy, Suspense, useState, type ComponentType, type ComponentProps } from 'react';
import { useLocale } from '../locale.ts';
import { FantasyMenuBoundary } from './FantasyMenuBoundary.tsx';

export function deferFantasyPanel<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  let SharedPanel = lazy(load);
  return function DeferredFantasyPanel(props: ComponentProps<T>) {
    const [Panel, setPanel] = useState(() => SharedPanel);
    const [locale] = useLocale();
    const retry = () => {
      // 再試行時だけ lazy の失敗キャッシュを作り直す。
      SharedPanel = lazy(load);
      setPanel(() => SharedPanel);
    };
    return <FantasyMenuBoundary menu="deferred" onRetry={retry}>
      <Suspense fallback={<p className="fr-muted" role="status" aria-live="polite">{{ ko: '메뉴를 여는 중…', en: 'Opening menu…', ja: 'メニューを開いています…' }[locale]}</p>}>
        {createElement(Panel, props)}
      </Suspense>
    </FantasyMenuBoundary>;
  };
}
