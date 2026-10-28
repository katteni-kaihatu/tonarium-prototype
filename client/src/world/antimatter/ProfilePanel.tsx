import { useEffect, useState } from 'react';
import type { AntimatterSlice } from './types.ts';
import { s } from './styles.ts';
import { emitAdFeedback } from '../../ad/feedback.ts';
import { parseImportBundle } from '../../ad/user.mjs';
import { t, useLanguage } from '../../i18n/index.ts';

export function ProfilePanel({ ad, notice }: { ad: AntimatterSlice; notice: (msg: string) => void }) {
  useLanguage();
  const [newName, setNewName] = useState('');
  const [exportText, setExportText] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const selectedRecovery = ad.recoveryRecords.some(record => record.key === recoveryKey) ? recoveryKey : ad.recoveryRecords[0]?.key ?? '';
  const [code, setCode] = useState('');
  const [issued, setIssued] = useState<{ code: string; expiresAt: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const active = ad.activeProfile;
  useEffect(() => { setCode(''); setIssued(null); setExportText(''); }, [active?.id]);
  const waiting = ad.syncState === 'loading' || ad.syncState === 'choice';
  const download = (text: string, filename: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const onExport = () => {
    try {
      const text = ad.exportBundle(); setExportText(text);
      download(text, 'antimatter-dimensions-export-v3.json');
      notice(t('adExportDone'));
    } catch { notice(t('adExportFailed')); }
  };
  const onImport = () => {
    try {
      const bundle = parseImportBundle(exportText);
      const legacy = bundle.version === 2;
      if (legacy && !window.confirm(t('adLegacyConfirm'))) return;
      notice(ad.importBundle(exportText, legacy).message);
    } catch { emitAdFeedback({ kind: 'error' }); notice(t('adImportFailed')); }
  };
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    <div>
      <h3 style={s.sectionTitle}>{t('adProfiles')}</h3>
      {active && <p style={s.muted}>{active.name}{ad.lastSavedAt ? ` · ${ad.lastSavedAt}` : ''}</p>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <select style={s.input} value={active?.id ?? ''} aria-label={t('adProfiles')} onChange={e => {
          try { ad.switchProfile(e.target.value); } catch { notice(t('adProfileFailed')); }
        }}>{ad.profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <input style={s.input} value={newName} onChange={e => setNewName(e.target.value)} placeholder={t('adNewProfile')} aria-label={t('adNewProfile')} />
        <button style={s.btn} disabled={!newName.trim() || waiting} onClick={() => {
          try { ad.createProfile(newName.trim()); setNewName(''); } catch { notice(t('adProfileFailed')); }
        }}>{t('adCreateOptional')}</button>
        {active && ad.profiles.length > 1 && <button style={s.btnDanger} onClick={() => {
          if (window.confirm(t('adDeleteConfirm', active.name))) ad.deleteProfile(active.id);
        }}>{t('adDeleteProfile')}</button>}
      </div>
      <p style={s.muted}>{t('adGuestHelp')}</p>
    </div>
    <div>
      <h3 style={s.sectionTitle}>{t('adTransfer')}</h3>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button style={s.btn} disabled={busy || ad.syncState !== 'ready'} onClick={() => {
          setBusy(true); setIssued(null);
          void ad.issueTransfer().then(setIssued).catch(() => notice(t('adTransferFailed'))).finally(() => setBusy(false));
        }}>{t('adIssueCode')}</button>
        <input style={s.input} value={code} onChange={e => setCode(e.target.value)} autoComplete="off" spellCheck={false} aria-label={t('adTransferCode')} placeholder={t('adTransferCode')} />
        <button style={s.btn} disabled={busy || waiting || !code.trim()} onClick={() => {
          const input = code; setCode(''); setBusy(true); setIssued(null);
          void ad.exchangeTransfer(input).catch(() => notice(t('adTransferFailed'))).finally(() => setBusy(false));
        }}>{t('adUseCode')}</button>
        {ad.syncState === 'error' && <button style={s.btn} onClick={() => { void ad.loadFromServer(); }}>{t('adRetry')}</button>}
      </div>
      {issued && <p style={s.muted}>{t('adCodeExpires', new Date(issued.expiresAt).toLocaleString())}: <code>{issued.code}</code></p>}
      <p style={s.muted}>{t('adTransferHelp')}</p>
    </div>
    <div>
      <h3 style={s.sectionTitle}>{t('adExportTitle')}</h3>
      <p style={s.muted}>{t('adChecksumHelp')}</p>
      <textarea style={s.textarea} value={exportText} onChange={e => setExportText(e.target.value)} placeholder={t('adBundlePlaceholder')} aria-label={t('adExportTitle')} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
        <button style={s.btn} onClick={onExport}>{t('adExport')}</button>
        <select style={s.input} value={selectedRecovery} aria-label={t('adRecoveryHistory')} onChange={e => setRecoveryKey(e.target.value)}>
          {ad.recoveryRecords.map((record, index) => <option key={record.key} value={record.key}>{t('adRecoveryRecord', String(ad.recoveryRecords.length - index), record.createdAt ? new Date(record.createdAt).toLocaleString() : t('adRecoveryUnknownDate'))}</option>)}
        </select>
        {(['local', 'remote'] as const).map(source => <button key={source} style={s.btn} onClick={() => {
          try {
            const text = ad.exportRecoveryBundle(source, selectedRecovery);
            if (!text) { notice(t('adNoRecovery')); return; }
            setExportText(text); download(text, `antimatter-recovery-${source}-v3.json`);
          } catch { notice(t('adExportFailed')); }
        }}>{t(source === 'local' ? 'adRecoveryLocal' : 'adRecoveryRemote')}</button>)}
        <button style={s.btn} disabled={waiting || !exportText.trim()} onClick={onImport}>{t('adImport')}</button>
        <button style={s.btnDanger} disabled={waiting} onClick={() => {
          if (!window.confirm(t('adResetConfirm')) || !window.confirm(t('adResetFinal'))) return;
          try { ad.resetGame(); setExportText(''); } catch { notice(t('adProfileFailed')); }
        }}>{t('adReset')}</button>
      </div>
    </div>
  </div>;
}
