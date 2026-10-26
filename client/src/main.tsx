import { createRoot } from 'react-dom/client';
import { lazy, Suspense } from 'react';
import { t, useLanguage } from './i18n/index.ts';
import { App } from './App.tsx';
import './style.css';
import { startContentTranslations } from './content-translations.ts';

const stopContentTranslations = startContentTranslations();
if (import.meta.hot) import.meta.hot.dispose(stopContentTranslations);

const localPlaytest = import.meta.env.DEV && import.meta.env.VITE_SYSTEM_PLAYTEST === '1';
const systemLibrary = import.meta.env.DEV && new URLSearchParams(location.search).get('systemLibrary') === '1';
const Playtest = import.meta.env.DEV ? lazy(() => import('./systems/SystemPlaytest.tsx')) : null;
const Library = import.meta.env.DEV ? lazy(() => import('./systems/SystemLibraryPage.tsx')) : null;
function SystemLoading({ playtest = false }: { playtest?: boolean }) {
  useLanguage();
  return <p>{t(playtest ? 'ssPlaytestLoading' : 'ssLibraryLoading')}</p>;
}
createRoot(document.getElementById('root')!).render(systemLibrary && Library ? <Suspense fallback={<SystemLoading />}><Library /></Suspense> : localPlaytest && Playtest ? <Suspense fallback={<SystemLoading playtest />}><Playtest /></Suspense> : <App />);

// PWA としてインストールできるように（sw.js はキャッシュしない）
if (!localPlaytest && 'serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => {});
