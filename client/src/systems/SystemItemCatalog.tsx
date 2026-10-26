import { useEffect, useState } from 'react';
import { systemItemDefinitions } from '../../../shared/system-items.ts';
import { ITEM_INFO } from '../i18n/static.ts';
import { t, useLanguage } from '../i18n/index.ts';
import { CatalogPagination } from './CatalogPagination.tsx';
import { catalogPage } from './pagination.ts';

export function SystemItemCatalog() {
  useLanguage();
  const [search, setSearch] = useState(''), [page, setPage] = useState(1);
  const entries = systemItemDefinitions().filter(entry => `${entry.id} ${entry.info.name} ${ITEM_INFO[entry.kind].name}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const result = catalogPage(entries, page);
  useEffect(() => { if (page !== result.page) setPage(result.page); }, [page, result.page]);
  return <details className="system-catalog-item"><summary><strong>{t('ssCatalogItemsTitle')}</strong></summary><div className="system-catalog-detail">
    <p>{t('ssCatalogItemsIntro')}</p>
    <label className="system-catalog-search">{t('ssCatalogItemsSearch')}<input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="note, chess, jumpPad…" /></label>
    <div className="system-catalog-table"><table><thead><tr><th>{t('ssCatalogItemId')}</th><th>{t('ssCatalogName')}</th></tr></thead><tbody>{result.entries.map(entry => <tr key={entry.id}><td><code>{entry.id}</code></td><td>{ITEM_INFO[entry.kind].name}</td></tr>)}</tbody></table></div>{!entries.length && <p>{t('ssCatalogNoResults')}</p>}
    {!!result.total && <CatalogPagination page={result.page} pageCount={result.pageCount} onChange={setPage} label={t('ssCatalogItemsPages')} />}
    <h3>{t('ssCatalogNativePlacement')}</h3><pre>{`.item({\n  id: 'lobby-chess', itemId: 'chess',\n  position: [2, 0, -3], rotation: 0,\n})`}</pre>
    <h3>{t('ssCatalogTimerPlacement')}</h3><pre>{`.item({\n  id: 'clock-note', itemId: 'note', itemMode: 'system',\n  capabilities: ['text'], position: [0, 0, -2],\n})\n.system({\n  instanceId: 'clock', systemId: 'timer',\n  bindings: { display: ['clock-note'] }, config: { duration: 30 },\n})`}</pre>
    <p>{t('ssCatalogItemModes')}</p><p>{t('ssCatalogItemsAutoInclude')}</p><p>{t('ssCatalogMediaExcluded')}</p>
  </div></details>;
}
