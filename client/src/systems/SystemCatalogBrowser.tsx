import { useEffect, useState } from 'react';
import type { Capability, SystemCatalog, SystemEntry, SystemPort, ValueSchema, ValueType } from '../../../shared/system-types.ts';
import { compareVersions } from '../../../shared/systems.ts';
import { catalogExampleCode } from './catalog-example.ts';
import './catalog.css';
import { SystemItemCatalog } from './SystemItemCatalog.tsx';
import { SystemLibraryGuide } from './SystemLibraryGuide.tsx';
import { t, useLanguage } from '../i18n/index.ts';
import { systemDescription, systemDocumentation, systemTitle } from './catalog-labels.ts';
import { systemErrorText } from './messages.ts';
import { CatalogPagination } from './CatalogPagination.tsx';
import { catalogPage, uniqueSystemIds } from './pagination.ts';
import { startContentTranslations } from '../content-translations.ts';

const capabilities: Record<Capability, string> = { interact: 'ssCatalogCapabilityInteract', move: 'ssCatalogCapabilityMove', text: 'ssCatalogCapabilityText', seat: 'ssCatalogCapabilitySeat' };
const types: Record<ValueType, string> = { number: 'ssCatalogTypeNumber', string: 'ssCatalogTypeString', boolean: 'ssCatalogTypeBoolean', user: 'ssCatalogTypeUser', object: 'ssCatalogTypeObject' };

function FieldDocumentation({ manifest, field }: { manifest: SystemEntry['manifest']; field: string }) {
  const label = systemDocumentation(manifest, `${field}.label`), description = systemDocumentation(manifest, `${field}.description`);
  return label || description ? <span style={{ display: 'block', whiteSpace: 'pre-wrap' }}>{label && <strong>{label}</strong>}{label && description && ' — '}{description}</span> : null;
}

function Fields({ fields, manifest, group }: { fields: Record<string, ValueSchema>; manifest: SystemEntry['manifest']; group: 'config' | 'state' }) {
  useLanguage();
  return Object.keys(fields).length ? <div className="system-catalog-table"><table><thead><tr><th>{t('ssCatalogName')}</th><th>{t('ssCatalogType')}</th><th>{t('ssCatalogDefault')}</th><th>{t('ssCatalogRange')}</th></tr></thead><tbody>{Object.entries(fields).map(([name, field]) => <tr key={name}><td><code>{name}</code><FieldDocumentation manifest={manifest} field={`${group}.${name}`} /></td><td>{t(types[field.type])}</td><td><code>{JSON.stringify(field.default)}</code></td><td>{field.min === undefined && field.max === undefined ? t('ssCatalogUnlimited') : t('ssCatalogRangeValues', field.min ?? t('ssCatalogUnlimited'), field.max ?? t('ssCatalogUnlimited'))}</td></tr>)}</tbody></table></div> : <p>{t('ssCatalogNone')}</p>;
}

function Ports({ ports, manifest, group }: { ports: Record<string, SystemPort>; manifest: SystemEntry['manifest']; group: 'inputs' | 'outputs' }) {
  useLanguage();
  return Object.keys(ports).length ? <dl className="system-catalog-ports">{Object.entries(ports).map(([name, port]) => <div key={name}><dt><code>{name}</code></dt><dd><FieldDocumentation manifest={manifest} field={`${group}.${name}`} />{Object.entries(port.payload).map(([key, type]) => `${key}: ${t(types[type])}`).join(', ') || t('ssCatalogNoPayload')}</dd></div>)}</dl> : <p>{t('ssCatalogNone')}</p>;
}

export function CatalogItem({ entries, latest }: { entries: SystemEntry[]; latest: SystemEntry }) {
  useLanguage();
  const [version, setVersion] = useState(''), [copyMessage, setCopyMessage] = useState('');
  const entry = entries.find(item => item.version === version) ?? latest, manifest = entry.manifest;
  const usage = systemDocumentation(manifest, 'usage');
  const code = catalogExampleCode(latest.manifest);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopyMessage('ssCatalogCopied'); }
    catch { setCopyMessage('ssCatalogCopyFallback'); }
  };
  return <details className="system-catalog-item"><summary><span><strong>{systemTitle(latest.manifest)}</strong><code>{latest.id}</code></span><span>{t('ssCatalogLatestVersions', latest.version, entries.length)}</span></summary>
    <div className="system-catalog-detail">
      <label>{t('ssCatalogPublishedVersion')}<select value={entry.version} onChange={event => { setVersion(event.target.value === latest.version ? '' : event.target.value); setCopyMessage(''); }}>{[latest, ...entries.filter(item => item.version !== latest.version)].map(item => <option value={item.version} key={item.version}>{item.version}{item.version === latest.version ? t('ssCatalogLatestSuffix') : ''}</option>)}</select></label>
      <p>{systemDescription(manifest)}</p>
      {usage && <><h3>{t('ui372')}</h3><p style={{ whiteSpace: 'pre-wrap' }}>{usage}</p></>}
      <dl className="system-catalog-meta"><div><dt>{t('ssCatalogLicense')}</dt><dd>{manifest.license}</dd></div><div><dt>{t('ssCatalogCredits')}</dt><dd>{manifest.credits.join(', ') || t('ssCatalogNone')}</dd></div><div><dt>{t('ssCatalogSdk')}</dt><dd>{manifest.sdk}</dd></div></dl>
      <h3>{t('ssCatalogTargets')}</h3>
      {Object.entries(manifest.targets).length ? <ul>{Object.entries(manifest.targets).map(([name, target]) => <li key={name}><code>{name}</code> — {target.capabilities.map(capability => t(capabilities[capability])).join(', ')} · {t(target.required ? 'ssCatalogRequired' : 'ssCatalogOptional')} · {t(target.multiple ? 'ssCatalogMultiple' : 'ssCatalogSingle')}<FieldDocumentation manifest={manifest} field={`targets.${name}`} /></li>)}</ul> : <p>{t('ssCatalogNone')}</p>}
      {manifest.interaction && <p>{t('ssCatalogInteraction', manifest.interaction.target, manifest.interaction.input)}</p>}
      <h3>{t('ssCatalogConfig')}</h3><Fields fields={manifest.config} manifest={manifest} group="config" />
      <h3>{t('ssCatalogInputs')}</h3><Ports ports={manifest.inputs} manifest={manifest} group="inputs" />
      <h3>{t('ssCatalogOutputs')}</h3><Ports ports={manifest.outputs} manifest={manifest} group="outputs" />
      <details><summary>{t('ssCatalogStateUpdates')}</summary><Fields fields={manifest.state} manifest={manifest} group="state" /><p>{t('ssCatalogUpdatePolicy')}</p>{manifest.migrations?.length ? <pre>{JSON.stringify(manifest.migrations, null, 2)}</pre> : <p>{t('ssCatalogNoMigrations')}</p>}</details>
      <h3>{t('ssCatalogExampleTitle', latest.version)}</h3><p>{t('ssCatalogExampleHelp')}</p><button type="button" onClick={() => void copy()}>{t('ssCatalogCopyExample')}</button><span role="status">{copyMessage && t(copyMessage)}</span><pre>{code}</pre>
      <details><summary>{t('ssCatalogLogicOriginal')}</summary><p><a href={`/system-originals/${encodeURIComponent(entry.integrity)}`} target="_blank" rel="noreferrer">{t('ssCatalogOpenOriginal')}</a></p><p className="system-catalog-hash">{t('ssCatalogIntegrity', entry.integrity)}</p><pre>{JSON.stringify(manifest, null, 2)}</pre></details>
    </div>
  </details>;
}

export function SystemCatalogBrowser() {
  useLanguage();
  const [catalog, setCatalog] = useState<SystemCatalog>(), [error, setError] = useState(''), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0), [search, setSearch] = useState(''), [page, setPage] = useState(1);
  useEffect(() => revision ? startContentTranslations() : undefined, [revision]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    void fetch('/api/shared-systems', { signal: controller.signal, cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('ssCatalogLoadFailed');
      const next = await response.json() as SystemCatalog;
      if (next.schema !== 1 || !Array.isArray(next.entries)) throw new Error('ssCatalogInvalidCatalog');
      if (!controller.signal.aborted) setCatalog(next);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  const catalogEntries = catalog?.entries ?? [], query = search.trim().toLocaleLowerCase();
  const groups = new Map<string, SystemEntry[]>(), matches = new Set<string>();
  for (const entry of catalogEntries) {
    const versions = groups.get(entry.id);
    if (versions) versions.push(entry); else groups.set(entry.id, [entry]);
    if (!matches.has(entry.id) && (!query || [entry.id, entry.version, entry.manifest.title, entry.manifest.description, systemTitle(entry.manifest), systemDescription(entry.manifest), ...entry.manifest.credits, ...Object.keys(entry.manifest.inputs), ...Object.keys(entry.manifest.outputs)].join(' ').toLocaleLowerCase().includes(query))) matches.add(entry.id);
  }
  const ids = uniqueSystemIds(catalogEntries), visible = ids.filter(id => matches.has(id));
  const result = catalogPage(visible, page);
  const pageEntries = result.entries.map(id => {
    const entries = groups.get(id)!;
    return { id, entries, latest: entries.reduce((latest, entry) => compareVersions(entry.version, latest.version) > 0 ? entry : latest) };
  });
  useEffect(() => { if (page !== result.page) setPage(result.page); }, [page, result.page]);
  return <div className="system-catalog">
    <p>{t('ssCatalogIntro')}</p>
    <SystemLibraryGuide />
    <details className="system-catalog-item"><summary><strong>{t('ssCatalogSystemsTitle')}</strong></summary><div className="system-catalog-detail">
      <div className="system-catalog-actions"><button type="button" onClick={() => setRevision(value => value + 1)} disabled={loading}>{t('ssCatalogRefresh')}</button></div>
      <label className="system-catalog-search">{t('ssCatalogSearch')}<input type="search" placeholder={t('ssCatalogSearchHint')} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
      {loading && <p role="status">{t('ssCatalogLoading')}</p>}{error && <p role="alert">{systemErrorText(error)}</p>}
      {catalog && <><p className="system-catalog-count">{t('ssCatalogCount', ids.length, catalog.entries.length)}{query && t('ssCatalogSearchCount', visible.length)}</p>{!loading && !ids.length && <p>{t('ssCatalogEmpty')}</p>}{!!ids.length && !visible.length && <p>{t('ssCatalogNoResults')}</p>}{pageEntries.map(({ id, entries, latest }) => <CatalogItem key={id} entries={entries} latest={latest} />)}{!!result.total && <CatalogPagination page={result.page} pageCount={result.pageCount} onChange={setPage} label={t('ssCatalogSystemsPages')} />}<details className="system-catalog-release"><summary>{t('ssCatalogServerRelease')}</summary><p>{catalog.commit}</p><a href="/api/shared-systems" target="_blank" rel="noreferrer">{t('ssCatalogOpenJson')}</a></details></>}
    </div></details>
    <SystemItemCatalog />
  </div>;
}
