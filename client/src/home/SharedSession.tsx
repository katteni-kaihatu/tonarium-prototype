import { useEffect, useRef, useState } from 'react';
import { sessionIdFromUrl } from '../../../shared/session-links.ts';
import { useStore } from '../store.ts';
import { t as tr } from '../i18n/index.ts';
import { SessionCard } from './SessionCard.tsx';
import { Toast } from '../world/WorldScreen.tsx';

export function SharedSession() {
  const [id, setId] = useState(() => sessionIdFromUrl(location.href));
  const joined = useStore((s) => s.joined);
  const ready = useStore((s) => s.wsReady);
  const sessions = useStore((s) => s.guild.sessions);
  const current = useStore((s) => s.session);
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => {
    const url = new URL(location.href);
    if (sessionIdFromUrl(url.href) === id) { url.hash = ''; history.replaceState(null, '', url); }
    setId(null);
  };
  useEffect(() => {
    const read = () => setId(sessionIdFromUrl(location.href));
    window.addEventListener('hashchange', read);
    window.addEventListener('popstate', read);
    return () => { window.removeEventListener('hashchange', read); window.removeEventListener('popstate', read); };
  }, []);
  useEffect(() => {
    if (id && current === id) close();
    else if (id && joined) dialog.current?.showModal();
  }, [id, joined, current]);
  if (!id || !joined) return null;
  const session = sessions.find((s) => s.id === id);
  return <dialog ref={dialog} className="shared-session" aria-labelledby="shared-session-title" onCancel={close}>
    <h2 id="shared-session-title">{tr('sharedSession')}</h2>
    {!ready ? <p role="status">{tr('sessionLinkLoading')}</p> : session ? <SessionCard s={session} /> : <p>{tr('sessionLinkUnavailable')}</p>}
    <button type="button" className="ib" onClick={close}>{tr('ui73')}</button>
    <Toast />
  </dialog>;
}
