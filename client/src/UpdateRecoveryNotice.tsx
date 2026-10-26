import { useEffect, useState } from 'react';
import { get, set, useStore } from './store.ts';
import { connectWs } from './net/ws.ts';
import { abandonPreparedUpdate, prepareUpdate, readRecovery, restoreUpdate, waitFor } from './updateRecovery.ts';
import { t } from './i18n/index.ts';
import { hydrateUpdateDrafts } from './updateDraft.ts';
import { room } from './net/livekit.ts';
import { resumeAudio } from './spatial.ts';
import { restoreRecordings, retryRecordings } from './updateRecording.ts';

export function UpdateRecoveryNotice() {
  const [messages, setMessages] = useState<string[]>([]);
  useEffect(() => {
    const recordingError = (event: Event) => setMessages(current => [...current, (event as CustomEvent<string>).detail]);
    window.addEventListener('tonarium-recording-error', recordingError);
    const off = window.tonariumUpdates?.onPrepare(() => prepareUpdate(true), abandonPreparedUpdate);
    void (async () => {
      let snapshot: ReturnType<typeof readRecovery> = null;
      try {
        snapshot = readRecovery();
        if (!snapshot) return;
        hydrateUpdateDrafts(snapshot.drafts);
        if (!snapshot.joined) { set(snapshot.ui); return; }
        set({ selfId: snapshot.id, selfName: snapshot.name, joined: true, micEnabled: snapshot.ui.micEnabled });
        useStore.getState().adBindTonarium(snapshot.id, snapshot.name);
        connectWs();
        await waitFor(() => get().wsReady, () => t('updateConnectionFailed'));
        const issues = await restoreUpdate(snapshot);
        if (issues.length) setMessages(issues);
      } catch (error) { setMessages([t('updateRecoveryFailed', error instanceof Error ? error.message : String(error))]); }
      finally {
        if (snapshot?.joined) {
          const issues = await restoreRecordings(snapshot.recordings ?? []);
          if (issues.length) setMessages(current => [...current, ...issues]);
        }
      }
    })();
    return () => { off?.(); window.removeEventListener('tonarium-recording-error', recordingError); };
  }, []);
  if (!messages.length) return null;
  return <div className="modalbg"><div className="modal" role="alertdialog" aria-label={t('updateRecoveryTitle')}>
    <h2>{t('updateRecoveryTitle')}</h2>{messages.map((message, i) => <p key={i}>{message}</p>)}
    <button onClick={() => {
      resumeAudio();
      void Promise.all([room.startAudio(), retryRecordings()]).then(([, issues]) => setMessages(issues), error => setMessages([t('updateRecoveryFailed', String(error))]));
    }}>{t('updateRetry')}</button>
    <button onClick={() => setMessages([])}>{t('ui73')}</button>
  </div></div>;
}
