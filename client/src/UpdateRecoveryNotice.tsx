import { useEffect, useState } from 'react';
import { get, set } from './store.ts';
import { enter, fetchAuth } from './auth.ts';
import { abandonPreparedUpdate, prepareUpdate, readRecovery, restoreUpdate, waitFor } from './updateRecovery.ts';
import { t } from './i18n/index.ts';
import { hydrateUpdateDrafts } from './updateDraft.ts';
import { room } from './net/livekit.ts';
import { resumeAudio } from './spatial.ts';

export function UpdateRecoveryNotice() {
  const [messages, setMessages] = useState<string[]>([]);
  useEffect(() => {
    const off = window.tonariumUpdates?.onPrepare(() => prepareUpdate(true), abandonPreparedUpdate);
    void (async () => {
      let snapshot: ReturnType<typeof readRecovery> = null;
      try {
        snapshot = readRecovery();
        if (!snapshot) return;
        hydrateUpdateDrafts(snapshot.drafts);
        if (!snapshot.joined) { set(snapshot.ui); return; }
        // 本人は Cookie のセッションで決まる。ログインが切れていたら入口からやり直す
        const { account } = await fetchAuth();
        if (!account) return;
        set({ micEnabled: snapshot.ui.micEnabled });
        enter(account);
        await waitFor(() => get().wsReady, () => t('updateConnectionFailed'));
        const issues = await restoreUpdate(snapshot);
        if (issues.length) setMessages(issues);
      } catch (error) { setMessages([t('updateRecoveryFailed', error instanceof Error ? error.message : String(error))]); }
    })();
    return () => { off?.(); };
  }, []);
  if (!messages.length) return null;
  return <div className="modalbg"><div className="modal" role="alertdialog" aria-label={t('updateRecoveryTitle')}>
    <h2>{t('updateRecoveryTitle')}</h2>{messages.map((message, i) => <p key={i}>{message}</p>)}
    <button onClick={() => {
      resumeAudio();
      void room.startAudio().then(() => setMessages([]), error => setMessages([t('updateRecoveryFailed', String(error))]));
    }}>{t('updateRetry')}</button>
    <button onClick={() => setMessages([])}>{t('ui73')}</button>
  </div></div>;
}
