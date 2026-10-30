import { msg, systemText, t as tr, type UiMessage } from './i18n/index.ts';
import { LanguageSelect } from './i18n/LanguageSelect.tsx';
import { PopupPauseSettings } from './world/NewArrivals.tsx';
import { UpdateSettings } from './UpdateSettings.tsx';
import { useUpdateDraft } from './updateDraft.ts';
import { useEffect, useState } from 'react';
import { iconUrl, pickIcon } from './icon.ts';
import { avatarTextureUrl, uploadAvatarImage, uploadAvatarManifest } from './avatar.ts';
import { send } from './net/ws.ts';
import { useStore } from './store.ts';
import { setLightweight, setLoadScale, setMapMode, setVoiceHeat } from './actions.ts';
import { logout, renameSelf, startMisskeyLogin } from './auth.ts';

/** 表示名の変更とログアウト。ゲストには Misskey でのログインを勧める */
function AccountSection() {
  const selfName = useStore((s) => s.selfName);
  const guest = useStore((s) => s.selfGuest);
  const username = useStore((s) => s.selfUsername);
  const [name, setName] = useState(selfName);
  const [message, setMessage] = useState('');
  const [waiting, setWaiting] = useState<string | null>(null);
  const rename = async () => {
    try { await renameSelf(name); setMessage(tr('authNameSaved')); } catch { setMessage(tr('authNameFailed')); }
  };
  const login = async () => {
    try {
      // ゲストのまま入っている画面からは、ログインできたら入り直す（本人が変わるため）
      if (await startMisskeyLogin(setWaiting)) location.reload();
    } catch { setWaiting(null); setMessage(tr('authFailed')); }
  };
  return (
    <section>
      <h3>{tr('authAccount')}</h3>
      <div className="sub">{guest ? tr('authGuestNow') : username ? tr('authSignedInAs', username) : ''}</div>
      <div className="row">
        <input aria-label={tr('authName')} value={name} maxLength={24} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void rename()} />
        <button disabled={!name.trim() || name.trim() === selfName} onClick={() => void rename()}>{tr('authNameSave')}</button>
      </div>
      <div className="row end">
        {guest && <button className="primary" onClick={() => void login()}>{tr('authMisskey')}</button>}
        <button onClick={() => void logout()}>{tr('authLogout')}</button>
      </div>
      {waiting && <div className="sub">{tr('authWaiting')} <b className="logincode">{waiting}</b></div>}
      {!waiting && message && <div className="sub">{message}</div>}
    </section>
  );
}

const LOAD_SCALES = [0, 0.5, 1, 2, 3];

const OEKAKI_SITE = 'https://oekaki-avatar.anthrotech.dev/';

/** 名前ごとに保存されるアイコンと 3D アバターの設定 */
export function ProfileDialog({ name, onClose }: { name: string; onClose: () => void }) {
  const n = name.trim();
  const id = useStore((s) => s.selfId);
  // 今の版は名簿（ゲストはオンラインの一覧）から引く。変えた直後は返ってきた版を使う
  const iconV = useStore((s) => (s.users.find((u) => u.id === s.selfId) ?? s.directory[s.selfId])?.icon ?? null);
  const avatarV = useStore((s) => (s.users.find((u) => u.id === s.selfId) ?? s.directory[s.selfId])?.avatar ?? null);
  const [changedIcon, setIcon] = useState<string | null>(null);
  const [changedAvatar, setAvatar] = useState<string | null>(null);
  const icon = changedIcon ?? (iconV ? iconUrl(id, iconV) : null);
  const avatar = changedAvatar ?? avatarV;
  const [message, setMessage] = useState<string | UiMessage>('');
  const [bio, setBio] = useUpdateDraft<string | null>(`profile.bio.${id}`, null);
  const [bot, setBot] = useState<boolean | null>(null);
  const loadScale = useStore((s) => s.loadScale);
  const lightweight = useStore((s) => s.lightweight);
  const mapMode = useStore((s) => s.mapMode);
  const voiceHeat = useStore((s) => s.voiceHeat);
  const guest = useStore((s) => s.selfGuest);
  useEffect(() => {
    let alive = true;
    void fetch(`/profile?id=${encodeURIComponent(id)}`).then((r) => r.json()).then((p: { bio: string; bot: boolean }) => { if (alive) { setBio(current => current ?? p.bio); setBot(current => current ?? p.bot); } });
    return () => { alive = false; };
  }, [id]);
  const saveBio = async () => {
    const r = await fetch('/profile', { method: 'POST', body: JSON.stringify({ bio }) });
    if (r.ok) send({ t: 'profileUpdated' });
    setMessage(r.ok ? msg("ui42") : msg("ui43"));
  };
  const saveBot = async (next: boolean) => {
    setBot(next);
    const r = await fetch('/profile', { method: 'POST', body: JSON.stringify({ bot: next }) });
    if (r.ok) send({ t: 'profileUpdated' });
    setMessage(r.ok ? msg("ui42") : msg("ui43"));
  };
  const run = async (f: () => Promise<string | null>, ok: (v: string) => void, label: UiMessage) => {
    const v = await f();
    if (v) { ok(v); setMessage(msg("ui44", label)); } else setMessage(msg("ui45", label));
  };

  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal profile" role="dialog" aria-modal="true" aria-label={tr('ui584', n)} onClick={(e) => e.stopPropagation()}>
        <h2>{tr('ui584', n)}</h2>
        <AccountSection />
        <section><LanguageSelect /></section>
        <PopupPauseSettings />
        <UpdateSettings />
        <div className="sub">{tr("ui47")}</div>
        {!guest && <section>
          <h3>{tr("ui48")}</h3>
          <textarea className="biofield" value={bio ?? ''} maxLength={300} onChange={(e) => setBio(e.target.value)} placeholder={tr("ui49")} aria-label={tr("ui48")} />
          <div className="row end"><button onClick={() => void saveBio()}>{tr("ui50")}</button></div>
        </section>}
        <section>
          <h3>{tr('authBotMark')}</h3>
          <label className="row"><input type="checkbox" checked={bot ?? false} onChange={(e) => void saveBot(e.target.checked)} />{tr('authBotToggle')}</label>
          <div className="sub">{tr('authBotNote')}</div>
        </section>
        <section>
          <h3>{tr("ui51")}</h3>
          <div className="row">
            {icon ? <img className="av big" src={icon} alt="" /> : <div className="av big noicon">{n.slice(0, 1)}</div>}
            <button onClick={() => void run(() => pickIcon(), (v) => setIcon(iconUrl(id, v)), msg("ui52"))}>{tr("ui53")}</button>
          </div>
        </section>
        <section>
          <h3>{tr("ui54")}</h3>
          <img className="avatartex" src={avatarTextureUrl(id, avatar)} alt="" />
          {!avatar && <div className="sub">{tr("ui55")}</div>}
          <div className="row wrap">
            <button className="primary" onClick={() => void run(() => uploadAvatarImage(), setAvatar, msg("ui56"))}>{tr("ui53")}</button>
            <button onClick={() => void run(() => uploadAvatarManifest(), setAvatar, msg("ui57"))}>{tr("ui58")}</button>
            <a className="btnlink" href="/oekaki/template.png" download="oekaki-template.png">{tr("ui59")}</a>
            <a className="btnlink" href={OEKAKI_SITE} target="_blank" rel="noreferrer">{tr("ui60")}</a>
          </div>
          <div className="sub">{tr("ui61")}</div>
        </section>
        <section>
          <h3>{tr("ui62")}</h3>
          <div className="seg" role="radiogroup" aria-label={tr("ui63")}>
            {LOAD_SCALES.map((k) => (
              <button key={k} role="radio" aria-checked={loadScale === k} className={loadScale === k ? 'on' : 'ib'} onClick={() => setLoadScale(k)}>
                {k === 0 ? tr("ui64") : `×${k}`}
              </button>
            ))}
          </div>
          <div className="sub">{tr("ui65")}</div>
          <label className="checkrow">
            <input type="checkbox" checked={lightweight} onChange={(e) => setLightweight(e.target.checked)} />
            {tr("ui66")}</label>
        </section>
        <section>
          <h3>{tr("ui67")}</h3>
          <div className="seg" role="radiogroup" aria-label={tr("ui67")}>
            {(['none', '2d', '3d'] as const).map((k) => (
              <button key={k} role="radio" aria-checked={mapMode === k} className={mapMode === k ? 'on' : 'ib'} onClick={() => setMapMode(k)}>
                {k === 'none' ? tr("ui64") : k === '2d' ? tr("ui68") : tr("ui69")}
              </button>
            ))}
          </div>
          <div className="sub">{tr("ui70")}</div>
          <label className="checkrow">
            <input type="checkbox" checked={voiceHeat} onChange={(e) => setVoiceHeat(e.target.checked)} />
            {tr("ui71")}</label>
          <div className="sub">{tr("ui72")}</div>
        </section>
        {message && <div className="msgline" role="status">{systemText(message)}</div>}
        <div className="row end"><button onClick={onClose}>{tr("ui73")}</button></div>
      </div>
    </div>
  );
}
