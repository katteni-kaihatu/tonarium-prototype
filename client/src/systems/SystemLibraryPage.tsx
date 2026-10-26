import { SystemCatalogBrowser } from './SystemCatalogBrowser.tsx';
import { t, useLanguage } from '../i18n/index.ts';
import { LanguageSelect } from '../i18n/LanguageSelect.tsx';

export default function SystemLibraryPage() {
  useLanguage();
  return <main className="system-library-page"><header><div><p>TONARIUM</p><h1>{t('ssCatalogLibraryTitle')}</h1></div><LanguageSelect /><a href="/">{t('ssCatalogBack')}</a></header><SystemCatalogBrowser /></main>;
}
