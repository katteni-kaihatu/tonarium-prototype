import { useEffect, useState } from 'react';
import type { AntimatterSlice } from './types.ts';
import { s } from './styles.ts';
import { Icon } from '../Icon.tsx';
import { emitAdFeedback } from '../../ad/feedback.ts';
import { parseImportBundle } from '../../ad/user.mjs';
import { t, useLanguage, msg, getLanguage, type UiMessage } from '../../i18n/index.ts';
import { ProgressPicker } from './ProgressPicker.tsx';
import { confirmAd } from './confirmAd.tsx';

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
  const onImport = async () => {
    try {
      const bundle = parseImportBundle(exportText);
      const legacy = bundle.version === 2;
      if (legacy && !await confirmAd(t('adLegacyConfirm'))) return;
      notice(ad.importBundle(exportText, legacy).message);
    } catch { emitAdFeedback({ kind: 'error' }); notice(msg('adImportFailed')); }
  };
  return <div className="adlab-save">
    {ad.syncState === 'ready' && ad.lastSavedAt && <div className="adlab-save-status" role="status">
      <span className="adlab-save-status-icon"><Icon name="cloudCheck" size={20} /></span>
      <span><b>{t('adUiSaved')}</b><span>{t('adUiSavedAt', ad.lastSavedAt)}</span></span>
    </div>}
    <section className="adlab-panel-box">
      <div className="adlab-box-head"><Icon name="devices" size={16} /><h3 style={s.sectionTitle}>{t('adTransfer')}</h3></div>
      <div className="adlab-save-row">
        <button style={s.btn} disabled={busy || ad.syncState !== 'ready'} onClick={() => {
          setBusy(true); setIssued(null);
          void ad.issueTransfer().then(setIssued).catch(() => notice(msg('adTransferFailed'))).finally(() => setBusy(false));
        }}>{t('adIssueCode')}</button>
        {ad.syncState === 'error' && <button style={s.btn} onClick={() => { void ad.loadFromServer(); }}>{t('adRetry')}</button>}
      </div>
      {issued && <p className="adlab-save-code"><code>{issued.code}</code><span>{t('adCodeExpires', new Date(issued.expiresAt).toLocaleString(getLanguage()))}</span></p>}
      <div className="adlab-save-row">
        <input style={s.input} value={code} onChange={e => setCode(e.target.value)} autoComplete="off" spellCheck={false} aria-label={t('adTransferCode')} placeholder={t('adTransferCode')} />
        <button style={s.btn} className="adlab-primary" disabled={busy || waiting || !code.trim()} onClick={() => {
          const input = code; setCode(''); setBusy(true); setIssued(null);
          void ad.exchangeTransfer(input).catch(() => notice(msg('adTransferFailed'))).finally(() => setBusy(false));
        }}>{t('adUseCode')}</button>
      </div>
    </section>
    <section className="adlab-panel-box">
      <div className="adlab-box-head"><Icon name="file" size={16} /><h3 style={s.sectionTitle}>{t('adExportTitle')}</h3></div>
      <div className="adlab-save-row">
        <button style={s.btn} onClick={onExport}><Icon name="download" size={14} />{t('adExport')}</button>
        <button style={s.btn} disabled={waiting || !exportText.trim()} onClick={onImport}><Icon name="upload" size={14} />{t('adImport')}</button>
      </div>
      <textarea style={s.textarea} value={exportText} onChange={e => setExportText(e.target.value)} placeholder={t('adBundlePlaceholder')} aria-label={t('adExportTitle')} />
    </section>
    <details className="adlab-panel-box adlab-save-history">
      <summary><Icon name="history" size={16} />{t('adPreviousProgress')}</summary>
      <ProgressPicker ad={ad} notice={notice} onExport={text => {
        if (!text) { notice(msg('adNoRecovery')); return; }
        setExportText(text); download(text, 'antimatter-recovery-v3.json');
      }} />
      <div className="adlab-save-danger">
        <span><Icon name="alert" size={14} />{t('adUiResetNote')}</span>
        <button style={s.btnDanger} disabled={waiting} onClick={async () => {
          if (!await confirmAd(t('adResetConfirm')) || !await confirmAd(t('adResetFinal'))) return;
          try { ad.resetGame(); setExportText(''); } catch { notice(msg('adProfileFailed')); }
        }}>{t('adReset')}</button>
      </div>
    </details>
  </div>;
}
