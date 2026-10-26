import { t, useLanguage } from '../i18n/index.ts';

export function CatalogPagination({ page, pageCount, onChange, label }: { page: number; pageCount: number; onChange: (page: number) => void; label: string }) {
  useLanguage();
  return <nav aria-label={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 12, margin: '14px 0' }}>
    <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1}>{t('ssCatalogPrevious')}</button>
    <span role="status" aria-live="polite">{t('ssCatalogPageNumbers', page, pageCount)}</span>
    <button type="button" onClick={() => onChange(page + 1)} disabled={page >= pageCount}>{t('ssCatalogNext')}</button>
  </nav>;
}
