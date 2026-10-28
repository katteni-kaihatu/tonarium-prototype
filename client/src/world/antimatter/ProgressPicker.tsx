import { useState } from 'react';
import type { AntimatterSlice } from './types.ts';
import { t } from '../../i18n/index.ts';
import { formatNumber } from './format.ts';
import { s } from './styles.ts';

export function ProgressSummary({ save }: { save: Record<string, unknown> }) {
  return <div style={s.muted}>Infinity: {String(save.infinities)} · {t('adTotalAntimatter')}: {formatNumber(save.totalAntimatter as { mantissa: number; exponent: number })}</div>;
}

export function ProgressPicker({ ad, migration = false, notice, onExport }: { ad: AntimatterSlice; migration?: boolean; notice: (message: string) => void; onExport?: (text: string) => void }) {
  const sources = migration ? ad.progressSources.filter(source => source.key.startsWith('profile:')) : ad.progressSources;
  const [selected, setSelected] = useState('');
  const source = sources.find(source => source.key === selected) ?? sources.find(source => source.key === 'profile:' + ad.activeProfile?.id) ?? sources[0];
  const options = (history: boolean) => sources.filter(source => !source.key.startsWith('profile:') === history).map(source =>
    <option key={source.key} value={source.key}>{source.name}{source.createdAt ? ` · ${new Date(source.createdAt).toLocaleString()}` : ''}{source.source ? ` · ${t(source.source === 'local' ? 'adChooseLocal' : 'adChooseRemote')}` : ''}</option>);
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <select style={s.input} aria-label={t('adPreviousProgress')} value={source?.key ?? ''} onChange={e => setSelected(e.target.value)}>
      {migration ? options(false) : <>
        <optgroup label={t('adUseProgress')}>{options(false)}</optgroup>
        <optgroup label={t('adRecoveryHistory')}>{options(true)}</optgroup>
      </>}
    </select>
    {source && <ProgressSummary save={source.save} />}
    <div style={s.row}>
      <button style={s.btn} disabled={!source || !migration && ['loading', 'choice'].includes(ad.syncState)} onClick={() => {
        if (!source) return;
        try {
          if (migration) ad.selectProgress(source.key);
          else if (window.confirm(t('adRestoreConfirm'))) ad.restoreProgress(source.key);
        } catch { notice(t('adProfileFailed')); }
      }}>{t(migration ? 'adUseProgress' : 'adRestoreProgress')}</button>
      {!migration && <button style={s.btn} disabled={!source} onClick={() => {
        try { onExport?.(ad.exportProgress(source!.key)); } catch { notice(t('adExportFailed')); }
      }}>{t('adExport')}</button>}
    </div>
  </div>;
}
