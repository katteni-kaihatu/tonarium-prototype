import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { t } from '../i18n/index.ts';
import { ARRIVAL_LIFETIME, shouldShowArrival, openArrivalPatch, POPUP_PAUSE_MINUTES } from '../newArrival.ts';
import { save, set, useStore } from '../store.ts';

export function PopupPauseSettings() {
  const until = useStore((s) => s.popupPausedUntil);
  const sound = useStore((s) => s.chatNotificationSound);
  const [, tick] = useState(0);
  useEffect(() => {
    if (until <= Date.now()) return;
    const timer = setTimeout(() => tick((n) => n + 1), until - Date.now() + 1);
    return () => clearTimeout(timer);
  }, [until]);
  return <section>
    <h3>{t('popupSettings')}</h3>
    <label className="switchrow settings-row"><span><b>{t('chatNotificationSound')}</b><span className="sub wrap">{t('chatNotificationSoundHelp')}</span></span><input type="checkbox" role="switch" checked={sound} onChange={(e) => {
      const enabled = e.target.checked;
      save('tonarium.chatNotificationSound', enabled);
      set({ chatNotificationSound: enabled });
    }} /></label>
    <label className="settings-select-row"><span>{t('popupPause')}</span><select className="settings-select" value="" onChange={(e) => {
      const minutes = Number(e.target.value);
      if (POPUP_PAUSE_MINUTES.some((n) => n === minutes)) set({ popupPausedUntil: Date.now() + minutes * 60_000, arrivals: {} });
    }}>
      <option value="" disabled>{t('popupChooseDuration')}</option>
      {POPUP_PAUSE_MINUTES.map((n) => <option key={n} value={n}>{n === 60 ? t('popupHour') : t('popupMinutes', n)}</option>)}
    </select></label>
    {until > Date.now() && <div role="status">
      {t('popupPaused', new Date(until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}
      <button className="ib" onClick={() => set({ popupPausedUntil: 0 })}>{t('popupResume')}</button>
    </div>}
  </section>;
}

export function NewArrivals() {
  const state = useStore(useShallow((s) => ({
    session: s.session, hubOpen: s.hubOpen, folded: s.folded, phoneLayout: s.phoneLayout,
    phoneTab: s.phoneTab, rightView: s.rightView, rightConversation: s.rightConversation,
    popupPausedUntil: s.popupPausedUntil, arrivals: s.arrivals,
  })));
  const [, tick] = useState(0);
  const arrivals = Object.values(state.arrivals).filter((a) => a !== undefined);
  const nextExpiry = Math.min(...arrivals.map((a) => a.at + ARRIVAL_LIFETIME).filter((at) => at > Date.now()));
  useEffect(() => {
    if (!Number.isFinite(nextExpiry) || nextExpiry <= Date.now()) return;
    const timer = setTimeout(() => tick((n) => n + 1), nextExpiry - Date.now() + 1);
    return () => clearTimeout(timer);
  }, [nextExpiry]);
  return <div className="new-arrivals" role="status">
    {arrivals.filter((a) => Date.now() < a.at + ARRIVAL_LIFETIME && shouldShowArrival(a.kind, state, Date.now(), a.conversation)).map((a) => (
      <div className="new-arrival" key={a.kind}>
        <button onClick={() => set((s) => openArrivalPatch(a, s))}>{t(a.kind === 'chat' ? 'popupNewChat' : 'popupNewNotice')}</button>
        <button aria-label={t('ui73')} onClick={() => set((s) => ({ arrivals: { ...s.arrivals, [a.kind]: undefined } }))}>×</button>
      </div>
    ))}
  </div>;
}
