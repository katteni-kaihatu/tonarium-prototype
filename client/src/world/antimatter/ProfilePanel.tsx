import { useEffect, useState } from 'react';
import type { AntimatterSlice } from './types.ts';
import { s } from './styles.ts';
import { emitAdFeedback } from '../../ad/feedback.ts';
import { parseImportBundle } from '../../ad/user.mjs';
import { t, useLanguage, msg, getLanguage, type UiMessage } from '../../i18n/index.ts';
import { ProgressPicker } from './ProgressPicker.tsx';

export function ProfilePanel({ ad, notice }: { ad: AntimatterSlice; notice: (message: UiMessage) => void }) {
  useLanguage();
  const [exportText, setExportText] = useState('');
  const [code, setCode] = useState('');
  const [issued, setIssued] = useState<{ code: string; expiresAt: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const active = ad.activeProfile;
  useEffect(() => { setCode(''); setIssued(null); setExportText(''); }, [active?.id]);
  const waiting = ad.migration || ad.syncState === 'loading' || ad.syncState === 'choice';
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
      notice(msg('adExportDone'));
    } catch { notice(msg('adExportFailed')); }
  };
  const onImport = () => {
    try {
      const bundle = parseImportBundle(exportText);
      const legacy = bundle.version === 2;
      if (legacy && !window.confirm(t('adLegacyConfirm'))) return;
      notice(ad.importBundle(exportText, legacy).message);
    } catch { emitAdFeedback({ kind: 'error' }); notice(msg('adImportFailed')); }
  };
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    <div>
      <h3 style={s.sectionTitle}>{t('adTransfer')}</h3>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button style={s.btn} disabled={busy || ad.syncState !== 'ready'} onClick={() => {
          setBusy(true); setIssued(null);
          void ad.issueTransfer().then(setIssued).catch(() => notice(msg('adTransferFailed'))).finally(() => setBusy(false));
        }}>{t('adIssueCode')}</button>
        <input style={s.input} value={code} onChange={e => setCode(e.target.value)} autoComplete="off" spellCheck={false} aria-label={t('adTransferCode')} placeholder={t('adTransferCode')} />
        <button style={s.btn} disabled={busy || waiting || !code.trim()} onClick={() => {
          const input = code; setCode(''); setBusy(true); setIssued(null);
          void ad.exchangeTransfer(input).catch(() => notice(msg('adTransferFailed'))).finally(() => setBusy(false));
        }}>{t('adUseCode')}</button>
        {ad.syncState === 'error' && <button style={s.btn} onClick={() => { void ad.loadFromServer(); }}>{t('adRetry')}</button>}
      </div>
      {issued && <p style={s.muted}>{t('adCodeExpires', new Date(issued.expiresAt).toLocaleString(getLanguage()))}: <code>{issued.code}</code></p>}
    </div>
    <div>
      <h3 style={s.sectionTitle}>{t('adExportTitle')}</h3>
      <textarea style={s.textarea} value={exportText} onChange={e => setExportText(e.target.value)} placeholder={t('adBundlePlaceholder')} aria-label={t('adExportTitle')} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
        <button style={s.btn} onClick={onExport}>{t('adExport')}</button>
        <button style={s.btn} disabled={waiting || !exportText.trim()} onClick={onImport}>{t('adImport')}</button>
      </div>
    </div>
    <details>
      <summary>{t('adPreviousProgress')}</summary>
      <ProgressPicker ad={ad} notice={notice} onExport={text => {
        if (!text) { notice(msg('adNoRecovery')); return; }
        setExportText(text); download(text, 'antimatter-recovery-v3.json');
      }} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
        <button style={s.btnDanger} disabled={waiting} onClick={() => {
          if (!window.confirm(t('adResetConfirm')) || !window.confirm(t('adResetFinal'))) return;
          try { ad.resetGame(); setExportText(''); } catch { notice(msg('adProfileFailed')); }
        }}>{t('adReset')}</button>
      </div>
    </details>
  </div>;
}
